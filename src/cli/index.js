const movieListService = require('../utils/movieListService');
const config = require('../utils/config');
const db = require('../db/db');
const path = require('path');
const fs = require('fs');
const track = require('../utils/track');
const logger = require('../utils/logger');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to prompt for user input with proper waiting
function askQuestion(query) {
  return new Promise(resolve => {
    // Use process.stdout directly to ensure flushing
    process.stdout.write(query);
    // Add a timeout to ensure the prompt is displayed
    setTimeout(() => {
      rl.once('line', (input) => {
        resolve(input);
      });
    }, 100);
  });
}

// Helper function to normalize URLs for consistent comparison
function normalizeUrl(url) {
  if (!url) return '';
  
  try {
    // Make sure we have a proper URL to work with
    const apiUrl = config.api.rootUrl || process.env.API_URL || 'https://vegamovies.bot';
    
    // First try to parse as URL
    try {
      const parsedUrl = new URL(url);
      // Remove trailing slashes
      let path = parsedUrl.pathname.replace(/\/+$/, '');
      // Convert to lowercase
      return path.toLowerCase();
    } catch (e) {
      // If it's not a valid URL, just clean up the string
      // Remove trailing slashes
      url = url.replace(/\/+$/, '');
      // Remove common prefixes
      url = url.replace(/^https?:\/\/(www\.)?/, '');
      // Convert to lowercase
      return url.toLowerCase();
    }
  } catch (error) {
    console.error('Error normalizing URL:', error.message);
    return url ? url.toLowerCase() : '';
  }
}

async function main() {
  try {
    console.log('\n=== Vega Movies Fetcher ===');
    
    // Initialize the database
    await db.initializeDatabase();
    console.log('Database initialized successfully');

    // Ensure output directories exist
    const outputDir = config.paths.output;
    const dbDir = config.paths.db;
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`Created output directory: ${outputDir}`);
    }
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`Created database directory: ${dbDir}`);
    }
    
    // Get pagination parameters
    let startPage, endPage;
    
    if (process.env.FETCH_START_PAGE && process.env.FETCH_END_PAGE) {
      // Use environment variables if set
      startPage = parseInt(process.env.FETCH_START_PAGE, 10);
      endPage = parseInt(process.env.FETCH_END_PAGE, 10);
    } else {
      // Ask user for input
      startPage = parseInt(await askQuestion('Enter start page: '), 10);
      endPage = parseInt(await askQuestion('Enter end page: '), 10);
    }
    
    // Validate inputs
    if (isNaN(startPage) || isNaN(endPage)) {
      console.error('Error: Pages must be valid numbers');
      process.exit(1);
    }
    
    console.log(`\nFetching pages (${startPage} to ${endPage})...`);
    
    // Process pages
    const { totalMovies, processedMovies, moviesCompleted } = await processPagesInOrder(startPage, endPage);
    
    // Only show minimal completion message
    console.log('\n=== Processing Complete ===');
    console.log(`Total movies found: ${totalMovies}`);
    console.log(`Total movies processed: ${processedMovies}`);
    console.log(`Total movies saved to database: ${moviesCompleted}`);
    
    // Get and display database statistics
    const stats = await db.getMovieStats();
    console.log(`Total Movies in Database: ${stats.totalMovies}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    // Close database connection
    await db.closeDatabase();
    // Close readline interface
    rl.close();
  }
}

// Function to process pages in the configured order
async function processPagesInOrder(startPage, endPage) {
  const isDescending = startPage > endPage;
  
  // Determine the range and increment based on direction
  const increment = isDescending ? -1 : 1;
  const shouldContinue = isDescending 
    ? (page) => page >= endPage 
    : (page) => page <= endPage;
  
  let totalMovies = 0;
  let processedMovies = 0;
  let moviesCompleted = 0;
  
  // Track processed URLs to avoid duplicates in a single fetch run
  const processedUrls = new Set();
  
  // Process pages in the configured order
  for (let page = startPage; shouldContinue(page); page += increment) {
    console.log(`\nProcessing Page ${page}`);
    
    // Get movie list for this page
    const result = await movieListService.getMovieList(page);
    
    if (result && result.movies && result.movies.length > 0) {
      totalMovies += result.movies.length;
      
      // Process each movie
      for (let i = 0; i < result.movies.length; i++) {
        const movie = result.movies[i];
        processedMovies++;
        
        // Get detailed movie information
        const movieDetails = await movieListService.getMovieDetails(movie);
        
        if (movieDetails) {
          // Process and save movie
          const result = await processMovie(movieDetails, processedUrls);
          
          if (result.success && (result.isNew || result.updated)) {
            moviesCompleted++;
          }
        }
      }
      
      // Show minimal status after each page
      console.log(`Page ${page} completed. Movies processed: ${processedMovies}, saved: ${moviesCompleted}`);
      
    } else {
      console.log(`No movies found on page ${page}`);
    }
  }
  
  return { totalMovies, processedMovies, moviesCompleted };
}

// Function to process a single movie and save it to the database
async function processMovie(movieDetails, processedUrls) {
  try {
    const normalizedUrl = normalizeUrl(movieDetails.url);
    
    // Skip if already processed in this run
    if (processedUrls.has(normalizedUrl)) {
      return { success: false, reason: 'duplicate' };
    }
    
    // Add to processed URLs
    processedUrls.add(normalizedUrl);
    
    // Use empty tags instead of extracting from movie info
    // This allows tag-category-inserter.js to handle all tagging
    movieDetails.tags = [];
    
    // Save movie to database with empty tags
    const saveResult = await db.saveMovie(movieDetails, { forceTagUpdate: true });
    
    // Track the movie as fetched - removed as tracking functionality not needed
    // track.addFetchedMovie(movieDetails.url);
    
    return { success: true, ...saveResult };
  } catch (error) {
    console.error(`Error processing movie ${movieDetails.title}:`, error.message);
    return { success: false, reason: 'error', error: error.message };
  }
}

main(); 