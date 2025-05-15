// Import the Express app
console.log('Loading Express app for Vercel deployment');

// Add environment info for debugging
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Current directory:', process.cwd());

// Import the original serve-api.js but swap the database module
const express = require('express');
const cors = require('cors');
// Use JSON database instead of SQLite
const db = require('../src/db/json-db');
const config = require('../src/utils/config');
const fs = require('fs');
const path = require('path');

// Create the Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Read-only API middleware - reject any non-GET requests
app.use((req, res, next) => {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed',
      message: 'This API is read-only and only accepts GET requests'
    });
  }
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error',
    message: err.message 
  });
});

// Helper function to get full thumbnail URL
function getFullThumbnailUrl(thumbnailPath) {
  if (!thumbnailPath) {
    return '';
  }
  
  // If the path already starts with http:// or https://, return it as is
  if (thumbnailPath.startsWith('http://') || thumbnailPath.startsWith('https://')) {
    return thumbnailPath;
  }
  
  // Extract the path after /wp-content/ if it exists
  const wpContentIndex = thumbnailPath.indexOf('/wp-content/');
  const imagePath = wpContentIndex !== -1 ? thumbnailPath.substring(wpContentIndex) : thumbnailPath;
  
  // Ensure the image path starts with a forward slash
  const normalizedPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  
  // Use the fixed domain from config
  const fullUrl = `${config.api.rootUrl}${normalizedPath}`;
  
  return fullUrl;
}

// Helper function to format basic movie data (without full info)
function formatBasicMovieData(movie) {
  const formattedData = {
    id: movie.id,
    title: movie.title,
    url: movie.url,
    date: movie.date,
    thumbnail: getFullThumbnailUrl(movie.thumbnail),
    type: movie.info && movie.info.length > 0 ? movie.info[0].movie_or_series : 'unknown',
    tags: movie.tags || []
  };
  
  return formattedData;
}

// API Routes
const apiRouter = express.Router();

/**
 * @route   GET /api/all
 * @desc    Get all movies with pagination (basic info only)
 * @access  Public
 */
apiRouter.get('/all', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      type, 
      year, 
      language, 
      quality, 
      sort = 'newest'
    } = req.query;
    
    const filters = { 
      type,  // 'movie' or 'series' or 'all'
      year, 
      language, 
      quality,
      sort 
    };
    
    const result = await db.getAllMovies(parseInt(page), parseInt(limit), filters);
    
    // Transform to basic format (without detailed info)
    result.items = result.movies.map(formatBasicMovieData);
    delete result.movies;
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting movies:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/type/:type
 * @desc    Get movies or series specifically (basic info only)
 * @access  Public
 */
apiRouter.get('/type/:type', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      year, 
      language, 
      quality, 
      sort = 'newest'
    } = req.query;
    
    const type = req.params.type;
    
    if (type !== 'movie' && type !== 'series') {
      return res.status(400).json({
        success: false,
        error: "Invalid type parameter. Must be 'movie' or 'series'."
      });
    }
    
    const filters = {
      type,
      year,
      language,
      quality,
      sort
    };
    
    const result = await db.getAllMovies(parseInt(page), parseInt(limit), filters);
    
    // Transform to basic format (without detailed info)
    result.items = result.movies.map(formatBasicMovieData);
    delete result.movies;
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error(`Error getting ${req.params.type}:`, error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/url/:url
 * @desc    Get a movie by URL (full info)
 * @access  Public
 */
apiRouter.get('/url/:url', async (req, res) => {
  try {
    const url = decodeURIComponent(req.params.url);
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: "URL parameter is required" 
      });
    }
    
    // Use exact URL matching without normalization
    const result = await db.getAllMovies(1, 1, { url });
    
    if (!result.movies || result.movies.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Movie not found",
        message: `No movie found with URL: ${url}`
      });
    }
    
    const movie = result.movies[0];
    
    // Transform thumbnail to include full URL
    movie.thumbnail = getFullThumbnailUrl(movie.thumbnail);
    
    // For screenshots in info sections
    if (movie.info && Array.isArray(movie.info)) {
      movie.info.forEach(infoItem => {
        if (infoItem.screenshots && Array.isArray(infoItem.screenshots)) {
          infoItem.screenshots = infoItem.screenshots.map(screenshot => 
            getFullThumbnailUrl(screenshot)
          );
        }
      });
    }
    
    res.json({ 
      success: true, 
      data: movie 
    });
  } catch (error) {
    console.error('Error getting movie by URL:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/featured
 * @desc    Get featured movies sorted by both post date and release year in descending order
 * @access  Public
 */
apiRouter.get('/featured', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20,
      type
    } = req.query;
    
    // Custom query for featured movies
    const result = await db.getMoviesByCustomQuery(
      parseInt(page), 
      parseInt(limit), 
      { 
        type,
        sortField: 'release_year', 
        sortDirection: 'DESC',
        secondarySortField: 'date',
        secondarySortDirection: 'DESC'
      }
    );
    
    // Transform to basic format (without detailed info)
    result.items = result.movies.map(movie => ({
      ...formatBasicMovieData(movie),
      release_year: movie.info && movie.info.length > 0 ? movie.info[0].release_year : null
    }));
    delete result.movies;
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting featured movies:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/id/:id
 * @desc    Get a movie by ID (full info)
 * @access  Public
 */
apiRouter.get('/id/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid ID parameter" 
      });
    }
    
    // Use the getMovieById method from json-db
    const movie = await db.getMovieById(id);
    
    if (!movie) {
      return res.status(404).json({ 
        success: false, 
        error: "Movie not found" 
      });
    }
    
    // Transform thumbnail to include full URL
    movie.thumbnail = getFullThumbnailUrl(movie.thumbnail);
    
    // For screenshots in info sections
    if (movie.info && Array.isArray(movie.info)) {
      movie.info.forEach(infoItem => {
        if (infoItem.screenshots && Array.isArray(infoItem.screenshots)) {
          infoItem.screenshots = infoItem.screenshots.map(screenshot => 
            getFullThumbnailUrl(screenshot)
          );
        }
      });
    }
    
    res.json({ 
      success: true, 
      data: movie 
    });
  } catch (error) {
    console.error('Error getting movie by ID:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/search
 * @desc    Search for movies/series (basic info only)
 * @access  Public
 */
apiRouter.get('/search', async (req, res) => {
  try {
    const { 
      q, 
      page = 1, 
      limit = 20, 
      type, 
      year, 
      language, 
      quality,
      sort = 'newest'
    } = req.query;
    
    if (!q) {
      return res.status(400).json({ 
        success: false, 
        error: 'Search query is required' 
      });
    }
    
    const filters = { 
      type, // 'movie' or 'series' or 'all'
      year, 
      language, 
      quality,
      sort
    };
    
    const result = await db.searchMovies(q, parseInt(page), parseInt(limit), filters);
    
    // Transform to basic format (without detailed info)
    result.items = result.movies.map(formatBasicMovieData);
    delete result.movies;
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error searching movies:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/filters
 * @desc    Get available filter options
 * @access  Public
 */
apiRouter.get('/filters', async (req, res) => {
  try {
    const filters = await db.getFilters();
    res.json({ 
      success: true, 
      data: filters 
    });
  } catch (error) {
    console.error('Error getting filters:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/stats
 * @desc    Get database statistics
 * @access  Public
 */
apiRouter.get('/stats', async (req, res) => {
  try {
    const stats = await db.getMovieStats();
    res.json({ 
      success: true, 
      data: stats 
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/tags/:tag
 * @desc    Get movies filtered by specific tag
 * @access  Public
 */
apiRouter.get('/tags/:tag', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20
    } = req.query;
    
    const tag = req.params.tag;
    
    // Get movies with the exact specified tag
    const result = await db.getMoviesByTag(
      tag,
      parseInt(page), 
      parseInt(limit)
    );
    
    // Check if we found any movies with this tag
    if (!result.movies || result.movies.length === 0) {
      // Return a clear message that no movies were found with this tag
      return res.status(404).json({
        success: false,
        tag: tag,
        error: "No movies found",
        message: `No movies found with tag: ${tag}`
      });
    }
    
    // Transform to basic format (without detailed info)
    result.items = result.movies.map(movie => ({
      ...formatBasicMovieData(movie),
      release_year: movie.info && movie.info.length > 0 ? movie.info[0].release_year : null
    }));
    delete result.movies;
    
    res.json({
      success: true,
      tag: tag,
      data: result
    });
  } catch (error) {
    console.error(`Error getting movies with tag ${req.params.tag}:`, error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/categories
 * @desc    Get all categories organized by type
 * @access  Public
 */
apiRouter.get('/categories', async (req, res) => {
  try {
    const categories = await db.getCategories();
    
    if (!categories) {
      return res.status(404).json({
        success: false,
        error: 'Categories not found'
      });
    }
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/categories/:type
 * @desc    Get categories of a specific type
 * @access  Public
 */
apiRouter.get('/categories/:type', async (req, res) => {
  try {
    const categories = await db.getCategories();
    if (!categories) {
      return res.status(404).json({
        success: false,
        error: 'Categories not found'
      });
    }

    const type = req.params.type;
    if (!categories.categories[type]) {
      return res.status(404).json({
        success: false,
        error: `Category type '${type}' not found`
      });
    }

    res.json({
      success: true,
      data: categories.categories[type]
    });
  } catch (error) {
    console.error('Error getting category type:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/categories/:type/:slug
 * @desc    Get movies for a specific category
 * @access  Public
 */
apiRouter.get('/categories/:type/:slug', async (req, res) => {
  try {
    const { type, slug } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const result = await db.getMoviesByCategory(type, slug, parseInt(page), parseInt(limit));
    
    // Transform to basic format (without detailed info)
    result.items = result.movies.map(formatBasicMovieData);
    delete result.movies;
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting category movies:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/search/categories/:slug
 * @desc    Comprehensive search for a category across all fields (tags, title, info, notes, synopsis)
 * @access  Public
 */
apiRouter.get('/search/categories/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { page = 1, limit = 20 } = req.query;

    if (!slug) {
      return res.status(400).json({
        success: false,
        error: "Category slug is required"
      });
    }
    
    const result = await db.searchMoviesByCategory(
      slug,
      parseInt(page), 
      parseInt(limit)
    );
    
    // Check if we found any results
    if (!result.movies || result.movies.length === 0) {
      return res.status(404).json({
        success: false,
        category: slug,
        error: "No movies found",
        message: `No movies found matching category: ${slug}`
      });
    }
    
    // Transform to basic format
    result.items = result.movies.map(formatBasicMovieData);
    delete result.movies;
    
    res.json({
      success: true,
      category: slug,
      data: result
    });
  } catch (error) {
    console.error(`Error searching for category ${req.params.slug}:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Register the API router
app.use('/api', apiRouter);

// Simple home route
app.get('/', (req, res) => {
  res.send(`
    <h1>Vega Movies API</h1>
    <p>Read-only API for accessing movie and series data</p>
    <h2>Available Endpoints:</h2>
    <ul>
      <li>GET /api/all - Get paginated list of movies/series (basic info)</li>
      <li>GET /api/type/:type - Get movies or series specifically (type must be 'movie' or 'series')</li>
      <li>GET /api/id/:id - Get detailed movie/series information by ID</li>
      <li>GET /api/url/:url - Get detailed movie/series information by URL path</li>
      <li>GET /api/search?q=query - Search for movies/series</li>
      <li>GET /api/filters - Get available filter options</li>
      <li>GET /api/stats - Get database statistics</li>
      <li>GET /api/featured - Get featured movies sorted by both post date and release year in descending order</li>
      <li>GET /api/tags/:tag - Get movies filtered by specific tag</li>
      <li>GET /api/categories - Get all categories organized by type</li>
      <li>GET /api/categories/:type - Get categories of a specific type</li>
      <li>GET /api/categories/:type/:slug - Get movies for a specific category</li>
      <li>GET /api/search/categories/:slug - Comprehensive search for a category across all fields (tags, title, info, notes, synopsis)</li>
    </ul>
    <h2>Query Parameters:</h2>
    <ul>
      <li>page - Page number (default: 1)</li>
      <li>limit - Items per page (default: 20)</li>
      <li>type - Content type ('movie', 'series', or 'all')</li>
      <li>year - Filter by release year</li>
      <li>language - Filter by language</li>
      <li>quality - Filter by quality (e.g., 720p, 1080p)</li>
      <li>sort - Sort order ('newest' [default, by post date], 'oldest', 'title', 'rating', 'relevance' [for search], 'id_newest')</li>
    </ul>
    <p>Note: This API is now using JSON files for data storage and is fully compatible with serverless deployments.</p>
  `);
});

// Determine if this is being run directly or imported by Vercel
if (require.main === module) {
  // This is being run directly (local development)
  const PORT = process.env.PORT || 3000;
  const HOST = process.env.HOST || '127.0.0.1';
  
  // Start the server
  app.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
    console.log('Available endpoints:');
    console.log('  GET /api/all - Get paginated list of movies/series');
    console.log('  GET /api/type/:type - Get movies or series');
    console.log('  GET /api/id/:id - Get movie by ID');
    console.log('  GET /api/url/:url - Get movie by URL');
    console.log('  ...and more');
  });
}

// Export the Express app for serverless function
module.exports = app; 