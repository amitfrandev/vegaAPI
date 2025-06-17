/**
 * JSON-based data service for serverless deployment
 * This module replaces the SQLite database with JSON files
 */

const fs = require('fs');
const path = require('path');

// Determine the correct data directory based on environment
let DATA_DIR;
if (process.env.VERCEL) {
  // In Vercel serverless environment
  console.log('Running in Vercel environment');
  DATA_DIR = path.join(process.cwd(), 'api', 'data');
} else {
  // Local development environment
  console.log('Running in local environment');
  DATA_DIR = path.join(process.cwd(), 'api', 'data');
}

// Make sure the directory exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    console.warn(`Data directory not found: ${DATA_DIR}`);
    // Show available directories for debugging
    const parentDir = path.dirname(DATA_DIR);
    if (fs.existsSync(parentDir)) {
      console.log('Available directories:', fs.readdirSync(parentDir));
    }
  } else {
    console.log(`Using data directory: ${DATA_DIR}`);
    console.log('Available data files:', fs.readdirSync(DATA_DIR));
  }
} catch (error) {
  console.error('Error checking data directory:', error);
}

// Constants
const MOVIES_PER_PAGE = 20;

// Cache for JSON data
const cache = {
  manifest: null,
  moviesChunks: {},
  moviesLookup: null,
  filters: null,
  categories: null,
  stats: null
};

// Helper function to load JSON file
function loadJsonFile(filename) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return null;
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return data;
  } catch (error) {
    console.error(`Error loading JSON file ${filename}:`, error);
    return null;
  }
}

// Initialize the database (load manifest)
function initializeDb() {
  if (!cache.manifest) {
    cache.manifest = loadJsonFile('manifest.json');
    cache.moviesLookup = loadJsonFile('movies_lookup.json');
  }
  return cache.manifest;
}

// Get movies chunk by index
function getMoviesChunk(chunkIndex) {
  if (!cache.moviesChunks[chunkIndex]) {
    cache.moviesChunks[chunkIndex] = loadJsonFile(`movies_${chunkIndex}.json`);
  }
  return cache.moviesChunks[chunkIndex];
}

// Helper to extract movie_or_series value from info
function getMovieType(movie) {
  return movie.info && movie.info.length > 0 ? movie.info[0].movie_or_series : 'unknown';
}

// Helper to get release year
function getReleaseYear(movie) {
  return movie.info && movie.info.length > 0 ? movie.info[0].release_year : null;
}

// Helper to get language
function getLanguage(movie) {
  return movie.info && movie.info.length > 0 ? movie.info[0].language : null;
}

// Helper to get quality
function getQuality(movie) {
  return movie.info && movie.info.length > 0 ? movie.info[0].quality : null;
}

// Apply filters to a list of movies
function applyFilters(movies, filters) {
  let filteredMovies = [...movies];
  
  // Filter by type (movie or series)
  if (filters.type && filters.type !== 'all') {
    filteredMovies = filteredMovies.filter(movie => 
      getMovieType(movie) === filters.type
    );
  }
  
  // Filter by year
  if (filters.year) {
    filteredMovies = filteredMovies.filter(movie => 
      getReleaseYear(movie) === filters.year
    );
  }
  
  // Filter by language
  if (filters.language) {
    filteredMovies = filteredMovies.filter(movie => 
      getLanguage(movie) === filters.language
    );
  }
  
  // Filter by quality
  if (filters.quality) {
    filteredMovies = filteredMovies.filter(movie => 
      getQuality(movie) === filters.quality
    );
  }
  
  // Filter by exact URL
  if (filters.url) {
    filteredMovies = filteredMovies.filter(movie => 
      movie.url === filters.url
    );
  }
  
  // Filter by ID
  if (filters.id) {
    filteredMovies = filteredMovies.filter(movie => 
      movie.id === filters.id
    );
  }
  
  return filteredMovies;
}

function parseIMDBRating(value) {
  if (!value || typeof value !== 'string') return 0;
  const match = value.match(/([\d.]+)/); // match "6.3" from "6.3/10" or "6.3"
  return match ? parseFloat(match[1]) : 0;
}

// Sort movies based on sort parameter
function sortMovies(movies, sortType = 'newest') {
  switch (sortType) {
    case 'year_desc':
      return movies.sort((a, b) => getYear(b) - getYear(a));
    case 'imdb_desc':
      return movies.sort((a, b) => getRating(b) - getRating(a));
    case 'release_imdb_desc':
      return movies.sort((a, b) => {
        const yearDiff = getYear(b) - getYear(a);
        if (yearDiff !== 0) return yearDiff;
        return getRating(b) - getRating(a);
      });
    case 'newest':
    default:
      return movies.sort((a, b) => new Date(b.date) - new Date(a.date));
  }
}

function getYear(movie) {
  return parseInt(getReleaseYear(movie)) || 0;
}

function getRating(movie) {
  const raw = movie.info?.[0]?.imdb_rating || '';
  const cleaned = parseFloat(raw.split('/')[0]);
  return isNaN(cleaned) ? 0 : cleaned;
}

// Paginate movies
function paginateMovies(movies, page = 1, limit = MOVIES_PER_PAGE) {
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  return movies.slice(startIndex, endIndex);
}

// Get all movies with pagination and filters
async function getAllMovies(page = 1, limit = MOVIES_PER_PAGE, filters = {}) {
  // Initialize
  initializeDb();
  
  if (!cache.manifest) {
    throw new Error('Failed to load manifest');
  }
  
  // We need to load all chunks when filtering
  const allMovies = [];
  for (let i = 0; i < cache.manifest.moviesChunks; i++) {
    const chunk = getMoviesChunk(i);
    if (chunk) {
      allMovies.push(...chunk);
    }
  }
  
  // Apply filters
  const filteredMovies = applyFilters(allMovies, filters);
  
  // Sort movies
  const sortedMovies = sortMovies(filteredMovies, filters.sort);
  
  // Apply pagination
  const paginatedMovies = paginateMovies(sortedMovies, page, limit);
  
  return {
    movies: paginatedMovies,
    page: parseInt(page),
    limit: parseInt(limit),
    totalItems: filteredMovies.length,
    totalPages: Math.ceil(filteredMovies.length / limit)
  };
}

// Search movies by title
async function searchMovies(query, page = 1, limit = MOVIES_PER_PAGE, filters = {}) {
  // Initialize
  initializeDb();
  
  if (!cache.manifest) {
    throw new Error('Failed to load manifest');
  }
  
  // We need to load all chunks when searching
  const allMovies = [];
  for (let i = 0; i < cache.manifest.moviesChunks; i++) {
    const chunk = getMoviesChunk(i);
    if (chunk) {
      allMovies.push(...chunk);
    }
  }
  
  // Filter by search query
  const queryLower = query.toLowerCase();
  const searchResults = allMovies.filter(movie => 
    movie.title.toLowerCase().includes(queryLower)
  );
  
  // Apply additional filters
  const filteredMovies = applyFilters(searchResults, filters);
  
  // Sort by relevance (movies with title starting with query come first)
  const sortedMovies = filteredMovies.sort((a, b) => {
    const titleA = a.title.toLowerCase();
    const titleB = b.title.toLowerCase();
    
    // If title starts with query, prioritize it
    const aStartsWith = titleA.startsWith(queryLower);
    const bStartsWith = titleB.startsWith(queryLower);
    
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    
    // Then sort by title
    return titleA.localeCompare(titleB);
  });
  
  // Apply pagination
  const paginatedMovies = paginateMovies(sortedMovies, page, limit);
  
  return {
    movies: paginatedMovies,
    page: parseInt(page),
    limit: parseInt(limit),
    totalItems: sortedMovies.length,
    totalPages: Math.ceil(sortedMovies.length / limit)
  };
}

// Get movie by ID
async function getMovieById(id) {
  // Initialize
  initializeDb();
  
  if (!cache.manifest || !cache.moviesLookup) {
    throw new Error('Failed to load manifest or lookup');
  }
  
  // Find which chunk contains this movie ID
  let targetChunk = null;
  for (const [chunkIndex, ids] of Object.entries(cache.moviesLookup)) {
    if (ids.includes(id)) {
      targetChunk = parseInt(chunkIndex);
      break;
    }
  }
  
  if (targetChunk === null) {
    return null;
  }
  
  // Load the chunk and find the movie
  const chunk = getMoviesChunk(targetChunk);
  if (!chunk) {
    return null;
  }
  
  return chunk.find(movie => movie.id === id) || null;
}

// Get available filters
async function getFilters() {
  if (!cache.filters) {
    cache.filters = loadJsonFile('filters.json');
  }
  
  return cache.filters;
}

// Get movie stats
async function getMovieStats() {
  if (!cache.stats) {
    cache.stats = loadJsonFile('stats.json');
  }
  
  return cache.stats;
}

function parseImdbRating(ratingStr) {
  if (!ratingStr || ratingStr === '-') return 0; // treat "-" as no rating = 0
  if (ratingStr.includes('/')) {
    // e.g. "6.3/10" => parseFloat("6.3")
    return parseFloat(ratingStr.split('/')[0]) || 0;
  }
  return parseFloat(ratingStr) || 0;
}

// Get movies by custom query (featured)
async function getMoviesByCustomQuery(page = 1, limit = MOVIES_PER_PAGE, options = {}) {
  // Initialize
  initializeDb();
  
  if (!cache.manifest) {
    throw new Error('Failed to load manifest');
  }
  
  // We need to load all chunks when filtering
  const allMovies = [];
  for (let i = 0; i < cache.manifest.moviesChunks; i++) {
    const chunk = getMoviesChunk(i);
    if (chunk) {
      allMovies.push(...chunk);
    }
  }
  
  // Calculate date 3 months ago from now
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  
  // Filter movies from last 3 months and with IMDB rating >= 6.0
  const recentHighRatedMovies = allMovies.filter(movie => {
    // Check if movie is from last 3 months
    const movieDate = new Date(movie.date);
    const isRecent = movieDate >= threeMonthsAgo;
    
    // Check if movie has good IMDB rating (>= 6.0)
    const imdbRating = getRating(movie);
    const hasGoodRating = imdbRating >= 6.0;
    
    return isRecent && hasGoodRating;
  });
  
  // Apply type filter if specified
  let filteredMovies = recentHighRatedMovies;
  if (options.type && options.type !== 'all') {
    filteredMovies = filteredMovies.filter(movie => 
      getMovieType(movie) === options.type
    );
  }
  
  // Sort by release year (descending) then by IMDB rating (descending)
  const sortedMovies = sortMovies(filteredMovies, 'release_imdb_desc');
  
  // Apply pagination
  const paginatedMovies = paginateMovies(sortedMovies, page, limit);
  
  return {
    movies: paginatedMovies,
    page: parseInt(page),
    limit: parseInt(limit),
    totalItems: filteredMovies.length,
    totalPages: Math.ceil(filteredMovies.length / limit)
  };
}

// Get movies by tag
async function getMoviesByTag(tag, page = 1, limit = MOVIES_PER_PAGE) {
  // Initialize
  initializeDb();
  
  if (!cache.manifest) {
    throw new Error('Failed to load manifest');
  }
  
  // We need to load all chunks to search by tags
  const allMovies = [];
  for (let i = 0; i < cache.manifest.moviesChunks; i++) {
    const chunk = getMoviesChunk(i);
    if (chunk) {
      allMovies.push(...chunk);
    }
  }
  
  // Filter by tag
  const moviesWithTag = allMovies.filter(movie => 
    movie.tags && Array.isArray(movie.tags) && movie.tags.includes(tag)
  );
  
  // Sort by date
  const sortedMovies = sortMovies(moviesWithTag, 'newest');
  
  // Apply pagination
  const paginatedMovies = paginateMovies(sortedMovies, page, limit);
  
  return {
    movies: paginatedMovies,
    page: parseInt(page),
    limit: parseInt(limit),
    totalItems: moviesWithTag.length,
    totalPages: Math.ceil(moviesWithTag.length / limit)
  };
}

// Get categories
async function getCategories() {
  if (!cache.categories) {
    cache.categories = loadJsonFile('categories.json');
  }
  
  return cache.categories;
}

// Get movies by category
async function getMoviesByCategory(type, slug, page = 1, limit = MOVIES_PER_PAGE) {
  // Initialize
  initializeDb();
  
  if (!cache.manifest) {
    throw new Error('Failed to load manifest');
  }
  
  // First, try to get pre-generated category file
  try {
    const categoryFilePath = path.join(DATA_DIR, 'categories', type, `${slug}.json`);
    
    if (fs.existsSync(categoryFilePath)) {
      console.log(`Using pre-generated category file: ${categoryFilePath}`);
      const categoryData = JSON.parse(fs.readFileSync(categoryFilePath, 'utf8'));
      
      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedItems = categoryData.items.slice(startIndex, endIndex);
      
      return {
        movies: paginatedItems,
        page: parseInt(page),
        limit: parseInt(limit),
        totalItems: categoryData.totalItems,
        totalPages: Math.ceil(categoryData.totalItems / limit)
      };
    }
  } catch (error) {
    console.error(`Error loading category file for ${type}/${slug}:`, error.message);
    // Continue with fallback method if file not found or other error
  }
  
  console.log(`No pre-generated category file found for ${type}/${slug}, using dynamic matching`);
  
  // Fallback: We need to load all chunks to search
  const allMovies = [];
  for (let i = 0; i < cache.manifest.moviesChunks; i++) {
    const chunk = getMoviesChunk(i);
    if (chunk) {
      allMovies.push(...chunk);
    }
  }
  
  // Convert slug to search term
  const searchTerm = slug.split('-').join(' ').toLowerCase();
  
  // Look for matches based on category type
  let matchingMovies = [];
  
  if (type === 'movies-by-genres') {
    matchingMovies = allMovies.filter(movie => {
      // Check for genre in info
      if (movie.info && movie.info.length > 0) {
        const genres = movie.info[0].genre || movie.info[0].genres;
        if (typeof genres === 'string' && genres.toLowerCase().includes(searchTerm)) {
          return true;
        } else if (Array.isArray(genres) && genres.some(g => g.toLowerCase().includes(searchTerm))) {
          return true;
        }
      }
      
      // Check tags for genre
      if (movie.tags && Array.isArray(movie.tags)) {
        return movie.tags.some(tag => tag.toLowerCase().includes(searchTerm));
      }
      
      return false;
    });
  } else if (type === 'movies-by-quality') {
    matchingMovies = allMovies.filter(movie => {
      // Check quality in info
      if (movie.info && movie.info.length > 0 && movie.info[0].quality) {
        return movie.info[0].quality.toLowerCase().includes(searchTerm);
      }
      
      // Check tags for quality
      if (movie.tags && Array.isArray(movie.tags)) {
        return movie.tags.some(tag => tag.toLowerCase().includes(searchTerm));
      }
      
      return false;
    });
  } else if (type === 'movies-by-year') {
    matchingMovies = allMovies.filter(movie => {
      // Check release year in info
      if (movie.info && movie.info.length > 0 && movie.info[0].release_year) {
        return movie.info[0].release_year === slug;
      }
      
      // Check tags for year
      if (movie.tags && Array.isArray(movie.tags)) {
        return movie.tags.includes(slug);
      }
      
      return false;
    });
  } else {
    // Default: Check title and tags for any match
    matchingMovies = allMovies.filter(movie => {
      // Check title
      if (movie.title.toLowerCase().includes(searchTerm)) {
        return true;
      }
      
      // Check tags
      if (movie.tags && Array.isArray(movie.tags)) {
        return movie.tags.some(tag => tag.toLowerCase().includes(searchTerm));
      }
      
      return false;
    });
  }
  
  // Sort by date
  const sortedMovies = sortMovies(matchingMovies, 'newest');
  
  // Apply pagination
  const paginatedMovies = paginateMovies(sortedMovies, page, limit);
  
  return {
    movies: paginatedMovies,
    page: parseInt(page),
    limit: parseInt(limit),
    totalItems: matchingMovies.length,
    totalPages: Math.ceil(matchingMovies.length / limit)
  };
}

// Search movies by category (comprehensive search)
async function searchMoviesByCategory(categorySlug, page = 1, limit = MOVIES_PER_PAGE) {
  // Initialize
  initializeDb();
  
  if (!cache.manifest) {
    throw new Error('Failed to load manifest');
  }
  
  // Try to find the category in any of the category types
  const categoriesData = getCategories();
  let foundType = null;
  
  if (categoriesData && categoriesData.categories) {
    // Look through all category types
    for (const [type, data] of Object.entries(categoriesData.categories)) {
      if (data.slugs.includes(categorySlug)) {
        foundType = type;
        break;
      }
    }
  }
  
  // If we found the category type, use the optimized function
  if (foundType) {
    console.log(`Found category ${categorySlug} in type ${foundType}, using optimized lookup`);
    return getMoviesByCategory(foundType, categorySlug, page, limit);
  }
  
  // Fallback to searching all movies
  console.log(`Category ${categorySlug} not found in any type, using comprehensive search`);
  
  // Load all movies
  const allMovies = [];
  for (let i = 0; i < cache.manifest.moviesChunks; i++) {
    const chunk = getMoviesChunk(i);
    if (chunk) {
      allMovies.push(...chunk);
    }
  }
  
  // Convert slug to search term
  const searchTerm = categorySlug.split('-').join(' ').toLowerCase();
  
  // Comprehensive search across all fields
  const matchingMovies = allMovies.filter(movie => {
    // Check title
    if (movie.title.toLowerCase().includes(searchTerm)) {
      return true;
    }
    
    // Check tags
    if (movie.tags && Array.isArray(movie.tags)) {
      if (movie.tags.some(tag => tag.toLowerCase().includes(searchTerm))) {
        return true;
      }
    }
    
    // Check info fields
    if (movie.info && movie.info.length > 0) {
      const info = movie.info[0];
      
      // Check each field that might contain relevant information
      if (info.genre && typeof info.genre === 'string' && info.genre.toLowerCase().includes(searchTerm)) {
        return true;
      }
      if (info.genres && Array.isArray(info.genres) && info.genres.some(g => g.toLowerCase().includes(searchTerm))) {
        return true;
      }
      if (info.quality && info.quality.toLowerCase().includes(searchTerm)) {
        return true;
      }
      if (info.language && info.language.toLowerCase().includes(searchTerm)) {
        return true;
      }
      if (info.platform && info.platform.toLowerCase().includes(searchTerm)) {
        return true;
      }
      if (info.synopsis && info.synopsis.toLowerCase().includes(searchTerm)) {
        return true;
      }
      if (info.notes && info.notes.toLowerCase().includes(searchTerm)) {
        return true;
      }
    }
    
    return false;
  });
  
  // Sort by date
  const sortedMovies = sortMovies(matchingMovies, 'newest');
  
  // Apply pagination
  const paginatedMovies = paginateMovies(sortedMovies, page, limit);
  
  return {
    movies: paginatedMovies,
    page: parseInt(page),
    limit: parseInt(limit),
    totalItems: matchingMovies.length,
    totalPages: Math.ceil(matchingMovies.length / limit)
  };
}

// No database connection to close in this implementation
async function closeDatabase() {
  // Clear the cache to free memory
  cache.moviesChunks = {};
  cache.moviesLookup = null;
  cache.filters = null;
  cache.categories = null;
  cache.stats = null;
  cache.manifest = null;
  
  return true;
}

module.exports = {
  getAllMovies,
  searchMovies,
  getMovieById,
  getFilters,
  getMovieStats,
  getMoviesByCustomQuery,
  getMoviesByTag,
  getCategories,
  getMoviesByCategory,
  searchMoviesByCategory,
  closeDatabase
}; 