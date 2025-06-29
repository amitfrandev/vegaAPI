const db = require('./db');

// Function to delete movies inserted in the last 3 days
async function deleteLastThreeDaysData() {
  try {
    console.log('\n=== Starting Cleanup: Delete Last 3 Days Data ===');
    
    // Initialize the database
    await db.initializeDatabase();
    
    // Calculate the date 3 days ago
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoISO = threeDaysAgo.toISOString();
    
    console.log(`Deleting movies inserted after: ${threeDaysAgoISO}`);
    
    // Get movies inserted in the last 3 days
    const result = await db.getAllMovies(1, 1000000); // Get all movies
    const movies = result.movies;
    
    console.log(`Found ${movies.length} total movies in database`);
    
    // Filter movies inserted in the last 3 days
    const recentMovies = movies.filter(movie => {
      if (!movie.created_at) return false;
      const createdDate = new Date(movie.created_at);
      return createdDate > threeDaysAgo;
    });
    
    console.log(`Found ${recentMovies.length} movies inserted in the last 3 days`);
    
    if (recentMovies.length === 0) {
      console.log('No movies found to delete from the last 3 days');
      return;
    }
    
    // Show the movies that will be deleted
    console.log('\nMovies to be deleted:');
    recentMovies.forEach((movie, index) => {
      console.log(`${index + 1}. ${movie.title} (ID: ${movie.id}) - Created: ${movie.created_at}`);
    });
    
    // Ask for confirmation (you can modify this to auto-confirm if needed)
    console.log('\n⚠️  WARNING: This will permanently delete the above movies from the database!');
    console.log('To proceed, you need to manually confirm by setting autoConfirm = true in the code');
    
    // Set this to true to auto-confirm the deletion
    const autoConfirm = false;
    
    if (!autoConfirm) {
      console.log('\n❌ Deletion cancelled. Set autoConfirm = true to proceed automatically.');
      return;
    }
    
    // Delete each movie
    let deletedCount = 0;
    let errorCount = 0;
    
    for (const movie of recentMovies) {
      try {
        // Use a direct SQL delete since we don't have a delete function in db.js
        await new Promise((resolve, reject) => {
          db.getDatabase().run(
            'DELETE FROM movies WHERE id = ?',
            [movie.id],
            function(err) {
              if (err) {
                console.error(`Error deleting movie ${movie.id}:`, err.message);
                errorCount++;
                reject(err);
              } else {
                if (this.changes > 0) {
                  console.log(`✅ Deleted: ${movie.title} (ID: ${movie.id})`);
                  deletedCount++;
                } else {
                  console.log(`⚠️  No changes for: ${movie.title} (ID: ${movie.id})`);
                }
                resolve();
              }
            }
          );
        });
      } catch (error) {
        console.error(`Failed to delete movie ${movie.id}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n=== Cleanup Complete ===');
    console.log(`Successfully deleted: ${deletedCount} movies`);
    console.log(`Errors: ${errorCount} movies`);
    console.log(`Total processed: ${recentMovies.length} movies`);
    
  } catch (error) {
    console.error('Cleanup failed:', error);
  } finally {
    await db.closeDatabase();
  }
}

// Function to show statistics before deletion
async function showCleanupStats() {
  try {
    console.log('\n=== Cleanup Statistics ===');
    
    // Initialize the database
    await db.initializeDatabase();
    
    // Calculate the date 3 days ago
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoISO = threeDaysAgo.toISOString();
    
    console.log(`Checking movies inserted after: ${threeDaysAgoISO}`);
    
    // Get all movies
    const result = await db.getAllMovies(1, 1000000);
    const movies = result.movies;
    
    console.log(`Total movies in database: ${movies.length}`);
    
    // Filter movies inserted in the last 3 days
    const recentMovies = movies.filter(movie => {
      if (!movie.created_at) return false;
      const createdDate = new Date(movie.created_at);
      return createdDate > threeDaysAgo;
    });
    
    console.log(`Movies inserted in last 3 days: ${recentMovies.length}`);
    
    if (recentMovies.length > 0) {
      console.log('\nRecent movies (last 3 days):');
      recentMovies.forEach((movie, index) => {
        console.log(`${index + 1}. ${movie.title} (ID: ${movie.id}) - Created: ${movie.created_at}`);
      });
    } else {
      console.log('No movies found in the last 3 days');
    }
    
  } catch (error) {
    console.error('Failed to get cleanup stats:', error);
  } finally {
    await db.closeDatabase();
  }
}

// Run cleanup if this file is executed directly
if (require.main === module) {
  // First show statistics
  showCleanupStats().then(() => {
    // Then run the cleanup (uncomment the line below to actually delete)
    // deleteLastThreeDaysData();
  });
} else {
  // If required as a module, export functions
  module.exports = {
    deleteLastThreeDaysData,
    showCleanupStats
  };
} 