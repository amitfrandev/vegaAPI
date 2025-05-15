const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('../db/db');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const config = require('../utils/config');

// Initialize the Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Serve static files from the "public" directory
app.use(express.static('public'));

// API Routes
const apiRouter = express.Router();

// Add this helper function at the top
function getFullThumbnailUrl(thumbnailPath) {
  if (!thumbnailPath) return '';
  return `${process.env.API_URL}${thumbnailPath}`;
}

// Get database statistics
apiRouter.get('/stats', async (req, res) => {
  try {
    const stats = await db.getMovieStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all movies with pagination
apiRouter.get('/movies', async (req, res) => {
  try {
    const { page = 1, limit = 20, year, language, quality } = req.query;
    const movies = await db.getAllMovies(parseInt(page), parseInt(limit), { year, language, quality });
    
    // Transform thumbnails to include full URL
    movies.movies = movies.movies.map(movie => ({
      ...movie,
      thumbnail: getFullThumbnailUrl(movie.thumbnail)
    }));
    
    res.json(movies);
  } catch (error) {
    console.error('Error getting movies:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a movie by URL
apiRouter.get('/movies/by-url', async (req, res) => {
  try {
    if (!req.query.url) {
      return res.status(400).json({ 
        success: false, 
        error: "URL parameter is required" 
      });
    }
    
    const movie = await db.getMovieByUrl(req.query.url);
    
    if (!movie) {
      return res.status(404).json({ 
        success: false, 
        error: "Movie not found" 
      });
    }
    
    // Transform thumbnail to include full URL
    movie.thumbnail = getFullThumbnailUrl(movie.thumbnail);
    
    res.json({ success: true, data: movie });
  } catch (error) {
    console.error('Error getting movie by URL:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get a movie by ID
apiRouter.get('/movies/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid ID parameter" 
      });
    }
    
    const movie = await db.getMovieById(id);
    
    if (!movie) {
      return res.status(404).json({ 
        success: false, 
        error: "Movie not found" 
      });
    }
    
    // Transform thumbnail to include full URL
    movie.thumbnail = getFullThumbnailUrl(movie.thumbnail);
    
    res.json({ success: true, data: movie });
  } catch (error) {
    console.error('Error getting movie by ID:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search for movies
apiRouter.get('/search', async (req, res) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const results = await db.searchMovies(q, parseInt(page), parseInt(limit));
    
    // Transform thumbnails to include full URL
    results.movies = results.movies.map(movie => ({
      ...movie,
      thumbnail: getFullThumbnailUrl(movie.thumbnail)
    }));
    
    res.json(results);
  } catch (error) {
    console.error('Error searching movies:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all links by category
apiRouter.get('/links/:category', async (req, res) => {
  try {
    const category = req.params.category;
    
    // Example SQL query to find all links matching a category
    const query = `
      SELECT l.id, l.button_label, l.url, lg.name AS group_name, m.title AS movie_title, m.url AS movie_url
      FROM links l
      JOIN link_groups lg ON l.link_group_id = lg.id
      JOIN sections s ON lg.section_id = s.id
      JOIN movies m ON s.movie_id = m.id
      WHERE lg.name LIKE ?
      ORDER BY m.id DESC
      LIMIT 100
    `;
    
    const dbPath = path.join(__dirname, '..', 'db', 'data', 'movies.db');
    const database = new sqlite3.Database(dbPath);
    
    database.all(query, [`%${category}%`], (err, rows) => {
      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).json({ success: false, error: err.message });
      }
      
      res.json({ success: true, data: rows });
      
      database.close();
    });
  } catch (error) {
    console.error('Error getting links by category:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all available categories (link groups)
apiRouter.get('/categories', async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT name 
      FROM link_groups 
      ORDER BY name ASC
    `;
    
    const dbPath = path.join(__dirname, '..', 'db', 'data', 'movies.db');
    const database = new sqlite3.Database(dbPath);
    
    database.all(query, [], (err, rows) => {
      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).json({ success: false, error: err.message });
      }
      
      // Extract category names from results
      const categories = rows.map(row => row.name);
      
      res.json({ success: true, data: categories });
      
      database.close();
    });
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get available filters (years, languages, qualities)
apiRouter.get('/filters', async (req, res) => {
  try {
    const dbPath = config.db.path;
    const database = new sqlite3.Database(dbPath);
    
    const queries = {
      years: "SELECT DISTINCT release_year FROM movies WHERE release_year IS NOT NULL ORDER BY release_year DESC",
      languages: "SELECT DISTINCT language FROM movies WHERE language IS NOT NULL",
      qualities: "SELECT DISTINCT quality FROM movies WHERE quality IS NOT NULL"
    };
    
    const results = {};
    
    // Execute all queries and collect results
    for (const [key, query] of Object.entries(queries)) {
      results[key] = await new Promise((resolve, reject) => {
        database.all(query, [], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows.map(row => row[Object.keys(row)[0]]));
          }
        });
      });
    }
    
    res.json({ success: true, data: results });
    
    database.close();
  } catch (error) {
    console.error('Error getting filters:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get recent movies (for homepage)
apiRouter.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const dbPath = config.db.path;
    const database = new sqlite3.Database(dbPath);
    
    const query = `
      SELECT 
        id, title, url, thumbnail, date, movie_name, series_name, release_year 
      FROM movies 
      ORDER BY created_at DESC 
      LIMIT ?
    `;
    
    database.all(query, [limit], (err, rows) => {
      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).json({ success: false, error: err.message });
      }
      
      res.json({ success: true, data: rows });
      
      database.close();
    });
  } catch (error) {
    console.error('Error getting recent movies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add a test endpoint for debugging the link structure
apiRouter.get('/test-movie', async (req, res) => {
  try {
    // Create a test movie with proper structure
    const testMovie = {
      title: "Test Movie Structure",
      url: "https://test-movie-structure-url.com",
      thumbnail: "https://via.placeholder.com/300x200?text=Test+Movie",
      date: new Date().toISOString(),
      info: [{
        imdb_rating: "7.5/10",
        movie_name: "Test Movie",
        release_year: "2025",
        language: "English",
        subtitle: "Yes",
        size: "1.2GB",
        quality: "1080p",
        format: "MKV",
        synopsis: "This is a test movie to verify the link structure.",
        screenshots: [
          "https://via.placeholder.com/800x450?text=Screenshot+1",
          "https://via.placeholder.com/800x450?text=Screenshot+2"
        ],
        note: "Test Note",
        sections: [
          {
            note: "Download Section 1",
            links: [
              {
                name: "1080p Quality",
                links: [
                  {
                    buttonLabel: "G-Drive Link",
                    link: "https://test.com/gdrive"
                  },
                  {
                    buttonLabel: "Direct Link",
                    link: "https://test.com/direct"
                  }
                ]
              },
              {
                name: "720p Quality",
                links: [
                  {
                    buttonLabel: "G-Drive Link",
                    link: "https://test.com/gdrive-720p"
                  }
                ]
              }
            ]
          },
          {
            note: "Download Section 2",
            links: [
              {
                name: "Alternative Source",
                links: [
                  {
                    buttonLabel: "Mirror Link",
                    link: "https://test.com/mirror"
                  }
                ]
              }
            ]
          }
        ]
      }]
    };
    
    // Clear any existing test movie from the database
    const dbPath = path.join(__dirname, '..', 'db', 'data', 'movies.db');
    const database = new sqlite3.Database(dbPath);
    
    await new Promise((resolve, reject) => {
      database.run("DELETE FROM movies WHERE url = ?", [testMovie.url], err => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Save the test movie to the database
    await db.saveMovie(testMovie);
    
    // Retrieve the test movie from the database
    const retrievedMovie = await db.getMovieByUrl(testMovie.url);
    
    // Compare original structure with retrieved structure
    const comparison = {
      original: {
        sections_count: testMovie.info[0].sections.length,
        first_section: testMovie.info[0].sections[0].links.length + " link groups"
      },
      retrieved: {
        sections_count: retrievedMovie && retrievedMovie.info && retrievedMovie.info[0] && retrievedMovie.info[0].sections ? retrievedMovie.info[0].sections.length : 0,
        first_section: retrievedMovie && retrievedMovie.info && retrievedMovie.info[0] && retrievedMovie.info[0].sections && retrievedMovie.info[0].sections.length > 0 
          ? (retrievedMovie.info[0].sections[0].links ? retrievedMovie.info[0].sections[0].links.length + " link groups" : "no links") 
          : "no sections"
      }
    };
    
    res.json({
      success: true,
      data: {
        message: "Test movie created and retrieved",
        comparison,
        movie: retrievedMovie
      }
    });
    
    // Close the database connection used for deleting
    database.close();
    
  } catch (error) {
    console.error('Error in test endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Test failed: ' + error.message
    });
  }
});

// Add a test endpoint for parsing HTML files
apiRouter.get('/test-html-parser', async (req, res) => {
  try {
    // Get the HTML file to parse from the query parameters
    const fileName = req.query.file;
    
    if (!fileName) {
      return res.status(400).json({
        success: false,
        error: "File parameter is required"
      });
    }
    
    // Check if the file exists in the html folder
    const htmlFilePath = path.join(__dirname, '..', 'utils', 'html', fileName);
    if (!fs.existsSync(htmlFilePath)) {
      return res.status(404).json({
        success: false,
        error: `File not found: ${fileName}`
      });
    }
    
    // Load the movie list service
    const movieListService = require('../utils/movieListService');
    
    // Read the HTML file content
    const html = fs.readFileSync(htmlFilePath, 'utf8');
    
    // Create a mock URL for testing
    const mockUrl = `http://example.com/test/${encodeURIComponent(fileName)}`;
    
    // Create a mock getContentWithGot function that returns the file content
    const originalGetContent = movieListService.httpClient.getContentWithGot;
    movieListService.httpClient.getContentWithGot = async () => html;
    
    // Parse the HTML file
    console.log(`Parsing HTML file: ${fileName}`);
    const movie = await movieListService.getMovieDetails(mockUrl);
    
    // Restore the original getContentWithGot function
    movieListService.httpClient.getContentWithGot = originalGetContent;
    
    // Return the parsed movie data
    const sectionStats = movie.info.sections.map(section => ({
      note: section.note,
      link_groups: section.links.length,
      sample_groups: section.links.slice(0, 3).map(group => ({
        name: group.name,
        links_count: group.links.length,
        sample_links: group.links.slice(0, 2).map(link => link.buttonLabel)
      }))
    }));
    
    res.json({
      success: true,
      data: {
        title: movie.title,
        url: movie.url,
        sections_count: movie.info.sections.length,
        section_stats: sectionStats,
        sections: movie.info.sections
      }
    });
  } catch (error) {
    console.error('Error testing HTML parser:', error);
    res.status(500).json({
      success: false, 
      error: error.message
    });
  }
});

// Register the API router
app.use('/api', apiRouter);

// Serve the main HTML page for any other routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET /api/stats           - Database statistics');
  console.log('  GET /api/movies          - List all movies (pagination with ?page=1&limit=20)');
  console.log('  GET /api/movies/:id      - Get movie by ID');
  console.log('  GET /api/movies/by-url    - Get movie by URL');
  console.log('  GET /api/search?q=query  - Search movies (pagination with &page=1&limit=20)');
  console.log('  GET /api/links/:category - Get links by category');
  console.log('  GET /api/categories      - Get all available link categories');
  console.log('  GET /api/filters         - Get filter options (years, languages, qualities)');
  console.log('  GET /api/recent          - Get recent movies (for homepage)');
  console.log('  GET /api/test-movie      - Test movie creation and retrieval');
  console.log('  GET /api/test-html-parser - Test HTML parser');
  
  // Initialize the database
  db.initializeDatabase()
    .then(() => {
      console.log('Database initialized successfully');
    })
    .catch(error => {
      console.error('Error initializing database:', error);
    });
}); 
