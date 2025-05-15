const fs = require('fs');
const path = require('path');
const config = require('../utils/config');
const db = require('./db');
const urlUtils = require('../utils/urlUtils');

// Function to migrate tags
async function migrateTags() {
  try {
    console.log('\n=== Starting Tag Migration ===');
    
    // Get all movies
    const result = await db.getAllMovies(1, 1000000); // Get all movies
    const movies = result.movies;
    console.log(`Found ${movies.length} movies to process`);
    
    // Process each movie
    let updated = 0;
    let skipped = 0;
    
    for (const movie of movies) {
      // Check if movie has tags property and it's an array
      if (!movie.tags || !Array.isArray(movie.tags)) {
        console.log(`Adding empty tags array for movie: ${movie.title}`);
        movie.tags = [];
        await db.saveMovie(movie, { forceTagUpdate: true });
        updated++;
      } else {
        skipped++;
      }
    }
    
    console.log('\n=== Tag Migration Complete ===');
    console.log(`Updated: ${updated} movies (added empty tags array)`);
    console.log(`Skipped: ${skipped} movies (already had tags)`);
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await db.closeDatabase();
  }
}

// Function to run database URL normalization
async function normalizeDbUrls() {
  try {
    console.log('\n=== Starting URL Normalization ===');
    
    // Initialize the database
    await db.initializeDatabase();
    
    // Get all movies
    const result = await db.getAllMovies(1, 1000000); // Get all movies
    const movies = result.movies;
    console.log(`Found ${movies.length} movies to process`);
    
    // Process each movie
    let updated = 0;
    let skipped = 0;
    
    for (const movie of movies) {
      const originalUrl = movie.url;
      const normalizedUrl = urlUtils.normalizeUrl(originalUrl);
      
      // Only update if URL has changed
      if (originalUrl !== normalizedUrl) {
        console.log(`Normalizing URL: "${originalUrl}" -> "${normalizedUrl}"`);
        movie.url = normalizedUrl;
        await db.saveMovie(movie, { forceTagUpdate: true });
        updated++;
      } else {
        skipped++;
      }
    }
    
    console.log('\n=== URL Normalization Complete ===');
    console.log(`Updated: ${updated} movie URLs`);
    console.log(`Skipped: ${skipped} movie URLs`);
    
  } catch (error) {
    console.error('URL normalization failed:', error);
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  // First normalize all URLs in database
  normalizeDbUrls().then(() => {
    // Then migrate tags
    migrateTags();
  });
} else {
  // If required as a module, export functions
  module.exports = {
    migrateTags,
    normalizeDbUrls
  };
} 