const db = require('../db/db');
const sqlite3 = require('sqlite3').verbose();
const config = require('../utils/config');

async function emptyAllTags() {
  console.log('\n=== Emptying All Tags in Database ===');
  
  try {
    // Initialize the database
    await db.initializeDatabase();
    console.log('Database initialized successfully');
    
    // Count total movies before update
    const totalMovies = await db.getMovieCount();
    console.log(`Found ${totalMovies} movies in database`);
    
    // Direct access to the database file
    const database = new sqlite3.Database(config.db.path);
    
    // Update all movies to have empty tags
    const result = await new Promise((resolve, reject) => {
      database.run(
        'UPDATE movies SET tags = ?',
        ['[]'],
        function(err) {
          if (err) {
            console.error('Error updating tags:', err);
            return reject(err);
          }
          
          resolve(this.changes);
        }
      );
    });
    
    // Close this specific connection
    await new Promise(resolve => database.close(resolve));
    
    console.log(`\n=== Tag Update Complete ===`);
    console.log(`Updated ${result} movies with empty tags`);
    
    // Get the database status after update
    const stats = await db.getMovieStats();
    console.log('\n=== Current Database Status ===');
    console.log(`Total Movies in Database: ${stats.totalMovies}`);
    
    return { success: true, updatedCount: result };
  } catch (error) {
    console.error('Error emptying tags:', error);
    return { success: false, error: error.message };
  } finally {
    // Close database connection
    await db.closeDatabase();
  }
}

// Run the function if this script is executed directly
if (require.main === module) {
  emptyAllTags()
    .then(result => {
      if (result.success) {
        console.log('Tags successfully emptied');
        process.exit(0);
      } else {
        console.error('Failed to empty tags:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
} else {
  // Export the function if the script is required as a module
  module.exports = { emptyAllTags };
} 