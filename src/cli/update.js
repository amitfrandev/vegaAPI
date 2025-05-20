const movieListService = require('../utils/movieListService');
const config = require('../utils/config');
const db = require('../db/db');
const fs = require('fs');
const path = require('path');
const urlUtils = require('../utils/urlUtils');

// Function to check if a movie exists by URL and return it if found
async function getMovieFromDb(url) {
  try {
    // First normalize the URL to match how it's stored
    const normalizedUrl = urlUtils.normalizeUrl(url);
    console.log(`Checking if movie exists: ${normalizedUrl}`);
    
    // Use getMovieByUrl from the db module if available
    if (typeof db.getMovieByUrl === 'function') {
      const movie = await db.getMovieByUrl(normalizedUrl);
      return movie; // Return the movie object or null
    }
    
    // Fallback to getAllMovies with URL filter
    const result = await db.getAllMovies(1, 1, { url: normalizedUrl });
    if (result && result.movies && result.movies.length > 0) {
      return result.movies[0]; // Return the first movie
    }
    
    return null; // Not found
  } catch (error) {
    console.error(`Error checking if movie exists: ${error.message}`);
    return null;
  }
}

// Function to check if movie dates are different and needs updating
function needsUpdate(existingMovie, newMovieDate) {
  if (!existingMovie || !existingMovie.date || !newMovieDate) {
    return true; // If any date is missing, assume it needs update
  }
  
  try {
    const dbDate = new Date(existingMovie.date);
    const newDate = new Date(newMovieDate);
    
    // If dates are valid, compare them
    if (!isNaN(dbDate.getTime()) && !isNaN(newDate.getTime())) {
      // If the new date is newer than the existing date, movie needs update
      console.log(`Comparing dates - DB: ${dbDate.toISOString()} vs New: ${newDate.toISOString()}`);
      return newDate > dbDate;
    }
  } catch (error) {
    console.error(`Error comparing dates: ${error.message}`);
  }
  
  // Default to false if comparison fails
  return false;
}

// Function to load tracking data
function loadTrackingData() {
  try {
    const trackingDir = path.join(config.paths.output, 'tracking');
    const trackingFile = path.join(trackingDir, 'update-status.json');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(trackingDir)) {
      fs.mkdirSync(trackingDir, { recursive: true });
    }
    
    // Check if tracking file exists
    if (fs.existsSync(trackingFile)) {
      const data = JSON.parse(fs.readFileSync(trackingFile, 'utf-8'));
      return data;
    }
    
    // Return default empty data
    return {
      lastUpdated: null,
      lastPage: 0,
      fetchedPages: []
    };
  } catch (error) {
    console.error(`Error loading tracking data: ${error.message}`);
    return {
      lastUpdated: null,
      lastPage: 0,
      fetchedPages: []
    };
  }
}

// Function to save tracking data
function saveTrackingData(data) {
  try {
    const trackingDir = path.join(config.paths.output, 'tracking');
    const trackingFile = path.join(trackingDir, 'update-status.json');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(trackingDir)) {
      fs.mkdirSync(trackingDir, { recursive: true });
    }
    
    // Save data
    fs.writeFileSync(trackingFile, JSON.stringify({
      ...data,
      lastUpdated: new Date().toISOString()
    }, null, 2));
    
    return true;
  } catch (error) {
    console.error(`Error saving tracking data: ${error.message}`);
    return false;
  }
}

// Function to display database status
async function displayDatabaseStatus() {
  try {
    const stats = await db.getMovieStats();
    console.log('\n=== Current Database Status ===');
    console.log(`Total Movies in Database: ${stats.totalMovies}`);
    
    // Get the most recent movie
    const result = await db.getAllMovies(1, 1, { sortField: 'date', sortDirection: 'DESC' });
    if (result && result.movies && result.movies.length > 0) {
      console.log('Latest Movie:');
      console.log(`- ${result.movies[0].title}`);
    }
    
    return stats;
  } catch (error) {
    console.error(`Error displaying database status: ${error.message}`);
    return { totalMovies: 0 };
  }
}

// Function to check if a movie has download links
function hasDownloadLinks(movieDetails) {
  if (!movieDetails || !movieDetails.info || !movieDetails.info.length) {
    return false;
  }
  
  // Find the first info entry with sections
  const info = movieDetails.info.find(i => i.sections && i.sections.length > 0);
  if (!info) {
    return false;
  }
  
  // Count total links
  let totalLinks = 0;
  info.sections.forEach(section => {
    section.links.forEach(linkGroup => {
      totalLinks += linkGroup.links ? linkGroup.links.length : 0;
    });
  });
  
  return totalLinks > 0;
}

async function main() {
  try {
    console.log('\n=== Vega Movies Updater ===');
    console.log('Running update mode - checking pages sequentially for new movies');
    
    // Initialize the database
    await db.initializeDatabase();
    console.log('Database initialized successfully');
    
    // Load tracking data
    const trackingData = loadTrackingData();
    console.log(`Last update: ${trackingData.lastUpdated || 'Never'}`);
    
    if (trackingData.fetchedPages.length > 0) {
      console.log(`Fully processed pages: ${trackingData.fetchedPages.join(', ')}`);
    }
    
    // Display initial status
    await displayDatabaseStatus();
    
    // Start from page 1 and continue until we find only existing movies
    let currentPage = 1;
    let continueUpdating = true;
    let totalProcessed = 0;
    let newMoviesFound = 0;
    let existingMovies = 0;
    let updatedMovies = 0;
    
    while (continueUpdating) {
      console.log(`\n=== Processing Page ${currentPage} for new movies ===`);
      
      // Get movie list for this page
      console.log(`\nFetching movie list from page ${currentPage}...`);
      const result = await movieListService.getMovieList(currentPage);
      
      // If no movies found, stop update process
      if (!result || !result.movies || result.movies.length === 0) {
        console.log(`No movies found on page ${currentPage}, stopping update process.`);
        continueUpdating = false;
        continue;
      }
      
      // Counter to track how many existing movies we've found in sequence
      let sequentialExistingMovies = 0;
      
      // Flag to track if any movie on this page has download links
      let pageHasDownloadLinks = false;
      
      // Process each movie on this page
      for (let i = 0; i < result.movies.length; i++) {
        const pageMovie = result.movies[i];
        totalProcessed++;
        
        console.log(`\nChecking movie ${i + 1}/${result.movies.length}: ${pageMovie.title}`);
        console.log(`URL: ${pageMovie.url}, Date: ${pageMovie.date || 'unknown'}`);
        
        // Check if movie already exists
        const existingMovie = await getMovieFromDb(pageMovie.url);
        
        if (existingMovie) {
          console.log(`Movie exists in database with ID: ${existingMovie.id}`);
          
          // Check if the movie has a newer date (meaning content might have changed)
          if (needsUpdate(existingMovie, pageMovie.date)) {
            console.log(`Movie appears to have been updated (date changed), fetching latest details...`);
            
            // Get detailed movie information to get updates
            const movieDetails = await movieListService.getMovieDetails(pageMovie, { forceUpdate: true });
            
            if (movieDetails) {
              // Check if movie has download links
              const movieHasLinks = hasDownloadLinks(movieDetails);
              console.log(`Movie has download links: ${movieHasLinks ? 'Yes' : 'No'}`);
              
              // Update the page flag if links are found
              if (movieHasLinks) {
                pageHasDownloadLinks = true;
              }
              
              // Preserve ID and created_at from existing movie
              movieDetails.id = existingMovie.id;
              
              // Use empty tags array
              movieDetails.tags = [];
              
              // Save updated movie to database
              await db.saveMovie(movieDetails, { forceUpdate: true });
              updatedMovies++;
              console.log(`Updated movie "${movieDetails.title}" in database`);
              
              // Reset sequential counter since we found a movie to update
              sequentialExistingMovies = 0;
            } else {
              console.log(`Failed to fetch new details, skipping update`);
              existingMovies++;
              sequentialExistingMovies++;
            }
          } else {
            console.log(`Movie has not changed (same date), skipping update`);
            existingMovies++;
            sequentialExistingMovies++;
          }
        } else {
          // New movie found, fetch details and save
          console.log(`New movie found: ${pageMovie.title}`);
          
          // Get detailed movie information
          const movieDetails = await movieListService.getMovieDetails(pageMovie);
          
          if (movieDetails) {
            // Log movie details
            console.log(`=== Movie ${i + 1}/${result.movies.length} ===`);
            console.log(`Title: ${movieDetails.title}`);
            console.log(`URL: ${movieDetails.url}`);
            console.log(`Date: ${movieDetails.date || ''}`);
            
            // Display movie info if available
            if (movieDetails.info && movieDetails.info.length > 0) {
              const info = movieDetails.info[0];
              console.log('Movie Info:');
              if (info.imdb_rating) console.log(`👉 IMDb Rating: ${info.imdb_rating}`);
              if (info.movie_or_series) console.log(`Type: ${info.movie_or_series}`);
              if (info.release_year) console.log(`Release Year: ${info.release_year}`);
              if (info.language) console.log(`Language: ${info.language}`);
              if (info.quality) console.log(`Quality: ${info.quality}`);
              
              // Display download sections count
              if (info.sections && info.sections.length > 0) {
                let totalLinks = 0;
                info.sections.forEach(section => {
                  section.links.forEach(linkGroup => {
                    totalLinks += linkGroup.links ? linkGroup.links.length : 0;
                  });
                });
                console.log(`Download Sections: ${info.sections.length} with ${totalLinks} total links`);
                
                // Update the page flag if links are found
                if (totalLinks > 0) {
                  pageHasDownloadLinks = true;
                }
              }
            }
            
            // Check if movie has download links
            const movieHasLinks = hasDownloadLinks(movieDetails);
            console.log(`Movie has download links: ${movieHasLinks ? 'Yes' : 'No'}`);
            
            // Update the page flag if links are found
            if (movieHasLinks) {
              pageHasDownloadLinks = true;
            }
            
            // Use empty tags array
            movieDetails.tags = [];
            
            // Save movie to database
            await db.saveMovie(movieDetails);
            newMoviesFound++;
            console.log(`Movie "${movieDetails.title}" saved to database`);
            
            // Reset sequential counter since we found a new movie
            sequentialExistingMovies = 0;
          }
        }
        
        // Update tracking data after each movie
        trackingData.lastPage = currentPage;
        saveTrackingData(trackingData);
        
        // Stop if we've found a certain number of consecutive existing movies
        // This indicates we're reaching older content that's already in the database
        if (sequentialExistingMovies >= 10) {
          console.log(`Found ${sequentialExistingMovies} consecutive existing movies, stopping update process.`);
          continueUpdating = false;
          break;
        }
      }
      
      // Check if any movie on this page had download links
      console.log(`\n=== Page ${currentPage} summary ===`);
      console.log(`Page has movies with download links: ${pageHasDownloadLinks ? 'Yes' : 'No'}`);
      
      if (!pageHasDownloadLinks) {
        console.log(`No movies with download links found on page ${currentPage}, assuming all subsequent pages are already updated.`);
        continueUpdating = false;
        // Add this page to the list of fully processed pages
        if (!trackingData.fetchedPages.includes(currentPage)) {
          trackingData.fetchedPages.push(currentPage);
        }
        saveTrackingData(trackingData);
        break;
      }
      
      // Add this page to the list of fully processed pages
      if (!trackingData.fetchedPages.includes(currentPage)) {
        trackingData.fetchedPages.push(currentPage);
      }
      
      // Move to next page unless we need to stop
      if (continueUpdating) {
        currentPage++;
        
        // If we've processed 5 pages, stop to avoid excessive requests
        if (currentPage > 5) {
          console.log('Reached maximum page limit (5) for this update session.');
          continueUpdating = false;
        }
      }
    }
    
    console.log('\n=== Update Process Complete ===');
    console.log(`Total movies processed: ${totalProcessed}`);
    console.log(`New movies found and added: ${newMoviesFound}`);
    console.log(`Movies updated with new content: ${updatedMovies}`);
    console.log(`Existing movies unchanged: ${existingMovies}`);
    
    // Update tracking data
    trackingData.lastUpdated = new Date().toISOString();
    saveTrackingData(trackingData);
    
    // Get and display database statistics
    await displayDatabaseStatus();
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    // Close database connection
    await db.closeDatabase();
  }
}

// Extract title from URL
function extractTitleFromUrl(url) {
  try {
    // Use urlUtils to normalize the URL first
    let urlPath = urlUtils.normalizeUrl(url);
    
    // Remove download- prefix if present
    urlPath = urlPath.replace(/^download-/, '');
    
    // Replace hyphens with spaces
    const title = urlPath.replace(/-/g, ' ');
    
    // Clean up: remove quality indicators, years, etc.
    return title
      .replace(/\b(480p|720p|1080p|web-?dl|blu-?ray)\b/gi, '') // Remove quality
      .replace(/\b\d{4}\b/g, '')                               // Remove years
      .replace(/\b(hindi|english|dubbed|org)\b/gi, '')         // Remove language indicators
      .replace(/\s+/g, ' ')                                    // Replace multiple spaces with single space
      .trim();
  } catch (error) {
    console.error(`Error extracting title from URL: ${error.message}`);
    return '';
  }
}

main(); 