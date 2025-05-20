/**
 * Generate Categories Tag Fetcher
 * This script tags movies in the database with standardized category tags
 * instead of generating static category files.
 * 
 * Tags are in the format:
 * - movies-by-genres@action
 * - movies-by-quality@1080p
 * - movies-by-year@2024
 * - web-series@netflix
 */

const fs = require('fs');
const path = require('path');
const db = require('../db/db');
const config = require('../utils/config');

// Log function with timestamp
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// Load categories data from JSON file
function loadCategoriesData() {
  try {
    const categoriesPath = path.join(process.cwd(), 'api', 'data', 'categories.json');
    const staticCategoriesPath = path.join(process.cwd(), 'static_data', 'categories.json');
    
    let categoriesFilePath = '';
    
    if (fs.existsSync(categoriesPath)) {
      log(`Loading categories from: ${categoriesPath}`);
      categoriesFilePath = categoriesPath;
    } else if (fs.existsSync(staticCategoriesPath)) {
      log(`Loading categories from: ${staticCategoriesPath}`);
      categoriesFilePath = staticCategoriesPath;
    } else {
      log('Error: categories.json not found in api/data or static_data!');
      return null;
    }
    
    const data = fs.readFileSync(categoriesFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    log(`Error loading categories data: ${error.message}`);
    return null;
  }
}

// Load movies data from database or JSON files
async function loadMoviesData() {
  try {
    log('Loading movies from database...');
    const result = await db.getAllMovies(1, 1000); // Get first 1000 movies for processing
    const movies = result.movies || [];
    log(`Loaded ${movies.length} movies from database`);
    return movies;
  } catch (dbError) {
    log(`Could not load from database, trying JSON files: ${dbError.message}`);
    
    try {
      const manifestPath = path.join(process.cwd(), 'api', 'data', 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        log('Error: manifest.json not found in api/data!');
        log('Make sure to run npm run export-db first');
        return null;
      }
      
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      log(`Found ${manifest.moviesChunks} movie chunks with ${manifest.totalMovies} total movies`);
      
      // Load all movie chunks
      const allMovies = [];
      for (let i = 0; i < manifest.moviesChunks; i++) {
        const chunkPath = path.join(process.cwd(), 'api', 'data', `movies_${i}.json`);
        if (fs.existsSync(chunkPath)) {
          log(`Loading movies chunk ${i + 1}/${manifest.moviesChunks}...`);
          const chunkData = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
          allMovies.push(...chunkData);
        } else {
          log(`Warning: Missing chunk file ${chunkPath}`);
        }
      }
      
      log(`Loaded ${allMovies.length} movies from JSON files`);
      return allMovies;
    } catch (jsonError) {
      log(`Error loading movies data from JSON: ${jsonError.message}`);
      return null;
    }
  }
}

// Helper function to check if a movie matches a category
function movieMatchesCategory(movie, categoryType, categorySlug) {
  try {
    // Convert slug to a readable form for text matching
    const searchTerm = categorySlug.split('-').join(' ').toLowerCase();
    
    // Check for explicit tag matching the category (in case it's already tagged)
    if (movie.tags && Array.isArray(movie.tags)) {
      const tagFormat = `${categoryType}@${categorySlug}`;
      if (movie.tags.includes(tagFormat)) {
        return true;
      }
      
      // Look for tag that matches just the slug
      if (movie.tags.includes(categorySlug)) {
        return true;
      }
      
      // Check if any tag contains the search term
      if (movie.tags.some(tag => tag.toLowerCase().includes(searchTerm))) {
        return true;
      }
    }
    
    // Special handling for adult content
    if (categoryType === 'adult') {
      // Look for [18+] in the title
      if (movie.title && movie.title.includes('[18+]')) {
        return true;
      }
      
      // Check for adult content keywords in all data
      const movieStr = JSON.stringify(movie).toLowerCase();
      if (movieStr.includes('18+') || 
          (movieStr.includes('adult') && !movieStr.includes('young adult'))) {
        return true;
      }
    }
    
    // Title search for all categories (basic matching)
    if (movie.title && movie.title.toLowerCase().includes(searchTerm)) {
      return true;
    }
    
    // For movies-by-year, check release year in info
    if (categoryType === 'movies-by-year' && movie.info && movie.info.length > 0) {
      const releaseYear = movie.info[0].release_year;
      if (releaseYear === categorySlug) {
        return true;
      }
    }
    
    // For movies-by-quality, check quality in info 
    if (categoryType === 'movies-by-quality' && movie.info && movie.info.length > 0) {
      const quality = movie.info[0].quality;
      if (quality && quality.toLowerCase().includes(searchTerm)) {
        return true;
      }
    }
    
    // For movies-by-genres, check genres in info
    if (categoryType === 'movies-by-genres' && movie.info && movie.info.length > 0) {
      // Some sites store genres as comma-separated strings, others as arrays
      const genres = movie.info[0].genre || movie.info[0].genres;
      if (typeof genres === 'string' && genres.toLowerCase().includes(searchTerm)) {
        return true;
      } else if (Array.isArray(genres) && genres.some(g => g.toLowerCase().includes(searchTerm))) {
        return true;
      }
      
      // For genres, also check content in synopsis/plot
      if (movie.info[0].synopsis && movie.info[0].synopsis.toLowerCase().includes(searchTerm)) {
        return true;
      }
      
      if (movie.info[0].plot && movie.info[0].plot.toLowerCase().includes(searchTerm)) {
        return true;
      }
    }
    
    // For web-series or tv-series, check type and match by platform
    if ((categoryType === 'web-series' || categoryType === 'tv-series') && 
        movie.info && movie.info.length > 0 && movie.info[0].movie_or_series === 'series') {
      // Check if title or platform contains the category slug
      const title = movie.title ? movie.title.toLowerCase() : '';
      const platform = movie.info[0].platform ? movie.info[0].platform.toLowerCase() : '';
      
      // Convert slug to readable format for matching
      const readableSlug = categorySlug.replace(/-/g, ' ').toLowerCase();
      
      if (title.includes(readableSlug) || platform.includes(readableSlug)) {
        return true;
      }
      
      // Special cases
      if (categorySlug === 'netflix' && (title.includes('netflix') || platform.includes('netflix'))) {
        return true;
      }
      if (categorySlug === 'amazon-prime-video' && 
          (title.includes('amazon') || title.includes('prime') || 
           platform.includes('amazon') || platform.includes('prime'))) {
        return true;
      }
    }
    
    // Check URL for the search term
    if (movie.url && movie.url.toLowerCase().includes(searchTerm)) {
      return true;
    }
    
    // Check info fields content
    if (movie.info && movie.info.length > 0) {
      // Get all the text content from info fields for searching
      const infoText = JSON.stringify(movie.info).toLowerCase();
      if (infoText.includes(searchTerm)) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    log(`Error matching movie ${movie.id} with category ${categoryType}/${categorySlug}: ${error.message}`);
    return false;
  }
}

// Process a movie and add category tags
function processMovieTags(movie, categories) {
  try {
    if (!movie.tags) {
      movie.tags = [];
    } else if (typeof movie.tags === 'string') {
      // Convert string tags to array if needed
      movie.tags = movie.tags.split(',').map(tag => tag.trim());
    }
    
    // Track original and new tags
    const originalTags = [...movie.tags];
    const newTags = [];
    
    // Process each category type
    for (const [categoryType, categoryData] of Object.entries(categories.categories)) {
      for (const slug of categoryData.slugs) {
        const tagFormat = `${categoryType}@${slug}`;
        
        // Skip if tag already exists
        if (movie.tags.includes(tagFormat)) {
          continue;
        }
        
        // Check if movie matches this category
        if (movieMatchesCategory(movie, categoryType, slug)) {
          newTags.push(tagFormat);
          movie.tags.push(tagFormat);
        }
      }
    }
    
    return {
      movie,
      originalTags,
      newTags,
      updated: newTags.length > 0
    };
  } catch (error) {
    log(`Error processing tags for movie ${movie.id}: ${error.message}`);
    return {
      movie,
      originalTags: movie.tags || [],
      newTags: [],
      updated: false,
      error: error.message
    };
  }
}

// Update movie tags in database
async function updateMovieTags(movieId, tags) {
  try {
    await db.updateMovieTags(movieId, tags);
    return true;
  } catch (error) {
    log(`Error updating tags for movie ${movieId}: ${error.message}`);
    return false;
  }
}

// Main function
async function main() {
  try {
    log('=== Vega Categories Tag Fetcher ===');
    
    // Check command line arguments
    const dryRun = process.argv.includes('--dry-run');
    const processLimit = process.argv.find(arg => arg.startsWith('--limit='));
    const limit = processLimit ? parseInt(processLimit.substring('--limit='.length)) : 0;
    
    if (dryRun) {
      log('DRY RUN MODE: No changes will be saved to the database');
    }
    
    if (limit > 0) {
      log(`Processing limit: ${limit} movies`);
    }
    
    // Load categories
    const categoriesData = loadCategoriesData();
    if (!categoriesData) {
      log('Failed to load categories data, aborting');
      return;
    }
    
    // Load movies
    const allMovies = await loadMoviesData();
    if (!allMovies) {
      log('Failed to load movies data, aborting');
      return;
    }
    
    // Process each movie
    log(`Processing ${limit > 0 ? limit : allMovies.length} movies...`);
    
    let processed = 0;
    let updated = 0;
    let errors = 0;
    let totalNewTags = 0;
    
    const moviesToProcess = limit > 0 ? allMovies.slice(0, limit) : allMovies;
    
    for (const movie of moviesToProcess) {
      processed++;
      if (processed % 100 === 0) {
        log(`Processed ${processed}/${moviesToProcess.length} movies...`);
      }
      
      // Process movie tags
      const result = processMovieTags(movie, categoriesData);
      
      if (result.updated) {
        totalNewTags += result.newTags.length;
        
        if (!dryRun) {
          // Update movie tags in database
          const success = await updateMovieTags(movie.id, result.movie.tags);
          if (success) {
            updated++;
            if (result.newTags.length > 0) {
              log(`Updated movie ${movie.id} with ${result.newTags.length} new tags: ${result.newTags.join(', ')}`);
            }
          } else {
            errors++;
          }
        } else {
          updated++;
          if (result.newTags.length > 0) {
            log(`[DRY RUN] Would update movie ${movie.id} with ${result.newTags.length} new tags: ${result.newTags.join(', ')}`);
          }
        }
      }
    }
    
    // Print summary
    log('\n=== Categories Tag Fetcher Summary ===');
    log(`Total movies processed: ${processed}`);
    log(`Movies updated with tags: ${updated}`);
    log(`Total new tags added: ${totalNewTags}`);
    log(`Errors encountered: ${errors}`);
    if (dryRun) {
      log('DRY RUN MODE: No changes were saved to the database');
    }
    
  } catch (error) {
    log(`Error in main process: ${error.message}`);
  } finally {
    // Close database connection
    try {
      await db.closeDatabase();
      log('Database connection closed');
    } catch (error) {
      log(`Error closing database: ${error.message}`);
    }
  }
}

// Run the script
main(); 