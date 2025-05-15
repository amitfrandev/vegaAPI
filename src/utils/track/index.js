// Simple in-memory tracking system for movies
const logger = require('../logger');

// In-memory tracking of fetched movies
let fetchedMovies = [];

// Get current DB status - just return the fetched movies
async function getDbStatus() {
  try {
    return {
      fetchedMovies,
      count: fetchedMovies.length
    };
  } catch (error) {
    console.error('Error getting DB status:', error.message);
    return { fetchedMovies: [], count: 0 };
  }
}

// Track a movie as fetched to DB
async function trackMovieFetched(movie, dbResult) {
  try {
    // Get database result if provided
    const id = dbResult ? dbResult.id : movie.id;
    const isNew = dbResult ? dbResult.isNew : false;
    const wasUpdated = dbResult ? dbResult.updated : false;
    
    // Only add if not already in the list
    const exists = fetchedMovies.some(m => m.id === id || m.title === movie.title);
    
    if (!exists) {
      fetchedMovies.push({
        id: id,
        title: movie.title,
        url: movie.url,
        date: movie.date,
        isNew: isNew,
        updated: wasUpdated
      });
      console.log(`Tracked movie as fetched: ${movie.title}`);
    } else if (wasUpdated) {
      // Update the existing entry if it was updated
      const index = fetchedMovies.findIndex(m => m.id === id || m.title === movie.title);
      if (index >= 0) {
        fetchedMovies[index] = {
          ...fetchedMovies[index],
          date: movie.date,
          updated: true
        };
        console.log(`Updated tracking for movie: ${movie.title}`);
      }
    }
    return true;
  } catch (error) {
    console.error('Error tracking fetched movie:', error.message);
    return false;
  }
}

// Display current DB status after page processing
async function displayCurrentDbStatus() {
  try {
    const status = await getDbStatus();
    console.log(`\n=== Current Database Status ===`);
    console.log(`Total Movies Fetched: ${status.count}`);
    
    // Display the 5 most recent movies
    const recentMovies = status.fetchedMovies.slice(-5).reverse();
    if (recentMovies.length > 0) {
      console.log(`Latest Movies:`);
      recentMovies.forEach(movie => {
        console.log(`- ${movie.title}`);
      });
    }
    
    return true;
  } catch (error) {
    console.error('Error displaying status:', error.message);
    return false;
  }
}

// Clear all tracking data
async function resetTracking() {
  try {
    fetchedMovies = [];
    console.log('Tracking data has been reset');
    return true;
  } catch (error) {
    console.error('Error resetting tracking:', error.message);
    return false;
  }
}

// Dummy functions to maintain compatibility with existing code
async function startPageProcessing(page) {
  console.log(`Processing page ${page}...`);
  return true;
}

async function updateMoviesFound(page, count) {
  console.log(`Found ${count} movies on page ${page}`);
  return true;
}

async function updateMovieProcessed(page, movie) {
  return true;
}

async function updateMovieDbFetched(page, movie, dbResult) {
  try {
    return await trackMovieFetched(movie, dbResult);
  } catch (error) {
    console.error('Error updating movie as DB fetched:', error.message);
    return false;
  }
}

async function trackNotFetched(movie) {
  console.log(`Movie not fetched: ${movie.title}`);
  return true;
}

async function updatePageError(page) {
  console.log(`Error processing page ${page}`);
  return true;
  }
  
async function isPageIndexed(page) {
  return { indexed: false, isComplete: false };
}

async function getProcessingDirection(customStartPage, customEndPage) {
  if (customStartPage !== undefined && customEndPage !== undefined) {
    return {
      ascending: customStartPage < customEndPage,
      descending: customStartPage >= customEndPage,
      startPage: customStartPage,
      endPage: customEndPage
    };
  }
  
  const defaultStartPage = 5;
  const defaultEndPage = 1;
  
  return {
    ascending: defaultStartPage < defaultEndPage,
    descending: defaultStartPage >= defaultEndPage,
    startPage: defaultStartPage,
    endPage: defaultEndPage
  };
}

async function displayStatus() {
  return displayCurrentDbStatus();
}

async function getSuggestedPaginationRange() {
  return { startPage: 1, endPage: 5, suggestion: "Fetch pages 1-5" };
}

// Export all functions
module.exports = {
  startPageProcessing,
  updateMoviesFound,
  updateMovieProcessed,
  updateMovieDbFetched,
  updatePageError,
  displayStatus,
  isPageIndexed,
  getProcessingDirection,
  getSuggestedPaginationRange,
  resetTracking,
  getDbStatus,
  displayCurrentDbStatus,
  trackMovieFetched,
  trackNotFetched
}; 