const fs = require('fs');
const path = require('path');
const config = require('./config');

// Initialize log structure with better progress tracking for UI
let logData = {
  timestamp: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  status: "idle",
  fetch: {
    startPage: 0,
    endPage: 0,
    currentPage: 0,
    direction: "none", // "ascending" or "descending"
    pagesCompleted: 0,
    pagesTotal: 0,
    pageProgress: 0 // percentage 0-100
  },
  movies: {
    found: 0,
    processed: 0,
    inDb: 0,
    moviesCompleted: 0, // Unique movies that have been fully processed
    sectionsTotal: 0, // Total number of sections/download links across all movies
    linksFound: 0, // Total number of nexdrive links found
    linksProcessed: 0, // Total number of nexdrive links processed
    progress: 0, // percentage 0-100
    currentMovie: {
      index: 0,
      title: "",
      url: ""
    }
  },
  currentOperation: "",
  lastError: null,
  currentPage: {
    number: 0,
    found: 0,
    processed: 0,
    inDb: 0,
    moviesCompleted: 0,
    sectionsTotal: 0,
    linksFound: 0,
    linksProcessed: 0,
    status: "pending",
    progress: 0
  }
};

// Path to log file
const logFilePath = path.join(config.paths.json, 'log.json');

// Initialize the log file - DISABLED since we're not using JSON files anymore
const initializeLogger = () => {
  try {
    // Reset log data
    logData = {
      timestamp: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      status: "idle",
      fetch: {
        startPage: 0,
        endPage: 0,
        currentPage: 0,
        direction: "none",
        pagesCompleted: 0,
        pagesTotal: 0,
        pageProgress: 0
      },
      movies: {
        found: 0,
        processed: 0,
        inDb: 0,
        moviesCompleted: 0,
        sectionsTotal: 0,
        linksFound: 0,
        linksProcessed: 0,
        progress: 0,
        currentMovie: {
          index: 0,
          title: "",
          url: ""
        }
      },
      currentOperation: "",
      lastError: null,
      currentPage: {
        number: 0,
        found: 0,
        processed: 0,
        inDb: 0,
        moviesCompleted: 0,
        sectionsTotal: 0,
        linksFound: 0,
        linksProcessed: 0,
        status: "pending",
        progress: 0
      }
    };
    
    return true;
  } catch (error) {
    console.error('Error initializing logger:', error);
    return false;
  }
};

// Save log data to file - DISABLED since we're not using JSON files anymore
const saveLogData = () => {
  try {
    logData.lastUpdated = new Date().toISOString();
    // Disabled file writing
    // fs.writeFileSync(logFilePath, JSON.stringify(logData, null, 2));
    return true;
  } catch (error) {
    // Just log to console instead of erroring out
    console.error('Logger: file writing disabled');
    return false;
  }
};

// Log an error
const logError = (message, error = null) => {
  logData.lastError = {
    timestamp: new Date().toISOString(),
    message,
    stack: error?.stack || null
  };
  
  // For critical errors, still show in console
  console.error(message);
  if (error) {
    console.error(error);
  }
  
  saveLogData();
};

// Set the page range for the current fetch operation
const setPageRange = (startPage, endPage) => {
  // Calculate direction and total pages
  const isAscending = startPage <= endPage;
  const totalPages = Math.abs(endPage - startPage) + 1;
  
  logData.fetch = {
    ...logData.fetch,
    startPage,
    endPage,
    direction: isAscending ? "ascending" : "descending",
    pagesTotal: totalPages,
    pagesCompleted: 0,
    pageProgress: 0
  };
  
  // Reset movie counts for new fetch
  logData.movies = {
    found: 0,
    processed: 0,
    inDb: 0,
    moviesCompleted: 0,
    sectionsTotal: 0,
    linksFound: 0,
    linksProcessed: 0,
    progress: 0,
    currentMovie: {
      index: 0,
      title: "",
      url: ""
    }
  };
  
  // Set current page to the start page
  logData.currentPage = {
    number: startPage,
    found: 0,
    processed: 0,
    inDb: 0,
    moviesCompleted: 0,
    sectionsTotal: 0,
    linksFound: 0,
    linksProcessed: 0,
    status: "pending",
    progress: 0
  };
  
  saveLogData();
};

// Update current page being processed
const updateCurrentPage = (page) => {
  logData.fetch.currentPage = page;
  
  // Update current page object
  logData.currentPage.number = page;
  
  // Initialize current page stats if needed
  if (logData.pageDetails && logData.pageDetails[page]) {
    // Copy existing page data from pageDetails to currentPage (for backward compatibility)
    const pageData = logData.pageDetails[page];
    logData.currentPage = {
      number: page,
      found: pageData.found || 0,
      processed: pageData.processed || 0,
      inDb: pageData.inDb || 0,
      moviesCompleted: pageData.moviesCompleted || 0,
      sectionsTotal: pageData.sectionsTotal || 0,
      linksFound: pageData.linksFound || 0,
      linksProcessed: pageData.linksProcessed || 0,
      status: "processing",
      progress: pageData.progress || 0
    };
  } else {
    // Just reset to default values if no pageDetails or this page doesn't exist
    logData.currentPage = {
      number: page,
      found: 0,
      processed: 0,
      inDb: 0,
      moviesCompleted: 0,
      sectionsTotal: 0,
      linksFound: 0,
      linksProcessed: 0,
      status: "processing",
      progress: 0
    };
  }
  
  saveLogData();
};

// Update movie counts for the current page
const updatePageMovies = (page, data) => {
  // Update current page
  if (logData.currentPage.number !== page) {
    updateCurrentPage(page);
  }
  
  // Update counts
  if (data.found !== undefined) {
    logData.currentPage.found = data.found;
  }
  
  if (data.processed !== undefined) {
    logData.currentPage.processed = data.processed;
  }
  
  if (data.inDb !== undefined) {
    logData.currentPage.inDb = data.inDb;
  }

  if (data.moviesCompleted !== undefined) {
    logData.currentPage.moviesCompleted = data.moviesCompleted;
  }

  if (data.sectionsTotal !== undefined) {
    logData.currentPage.sectionsTotal = data.sectionsTotal;
  }
  
  if (data.linksFound !== undefined) {
    logData.currentPage.linksFound = data.linksFound;
  }
  
  if (data.linksProcessed !== undefined) {
    logData.currentPage.linksProcessed = data.linksProcessed;
  }
  
  // Update page status
  if (data.status) {
    logData.currentPage.status = data.status;
  } else if (logData.currentPage.moviesCompleted === logData.currentPage.found && 
             logData.currentPage.found > 0) {
    logData.currentPage.status = "completed";
  }
  
  // Calculate page progress percentage based on completed movies, not sections
  if (logData.currentPage.found > 0) {
    logData.currentPage.progress = Math.round(
      (logData.currentPage.moviesCompleted / logData.currentPage.found) * 100
    );
  }
  
  // Update page completion count
  if (logData.currentPage.status === "completed" && 
      logData.currentPage.progress === 100) {
    // Count completed pages
    logData.fetch.pagesCompleted = Math.min(
      logData.fetch.pagesCompleted + 1, 
      logData.fetch.pagesTotal || 1
    );
  }
  
  // Update overall progress
  updateOverallProgress();
  
  saveLogData();
};

// Track link discovery and processing
const updateLinkProgress = (found = 0, processed = 0) => {
  if (found > 0) {
    logData.currentPage.linksFound += found;
    logData.movies.linksFound += found;
  }
  
  if (processed > 0) {
    logData.currentPage.linksProcessed += processed;
    logData.movies.linksProcessed += processed;
  }
  
  saveLogData();
};

// Update current movie being processed
const updateCurrentMovie = (index, title = "", url = "") => {
  logData.movies.currentMovie = {
    index,
    title,
    url
  };
  
  saveLogData();
};

// Update overall progress
const updateOverallProgress = () => {
  // Use current page stats as totals
  logData.movies.found = logData.currentPage.found;
  logData.movies.processed = logData.currentPage.processed;
  logData.movies.inDb = logData.currentPage.inDb;
  logData.movies.moviesCompleted = logData.currentPage.moviesCompleted;
  logData.movies.sectionsTotal = logData.currentPage.sectionsTotal;
  
  // Calculate progress percentages based on completed movies
  if (logData.movies.found > 0) {
    logData.movies.progress = Math.round((logData.movies.moviesCompleted / logData.movies.found) * 100);
  }
  
  if (logData.fetch.pagesTotal > 0) {
    logData.fetch.pageProgress = Math.round(
      (logData.fetch.pagesCompleted / logData.fetch.pagesTotal) * 100
    );
  }
  
  saveLogData();
};

// Simplified log function that updates the progress
const log = (message, level = 'info', category = 'general', data = null) => {
  // For page progress updates
  if (category === 'page_processing' && data && data.page) {
    updateCurrentPage(data.page);
  }
  // For movie count updates
  else if (category === 'movies_found' && data && data.count) {
    updatePageMovies(data.page || logData.fetch.currentPage, { found: data.count });
  }
  // For movie processing updates
  else if (category === 'movie_processed' && data) {
    // Update page movie count
    const page = data.page || logData.fetch.currentPage;
    updatePageMovies(page, { 
      processed: (logData.currentPage.processed || 0) + 1,
      moviesCompleted: (logData.currentPage.moviesCompleted || 0) + 1
    });
    
    // Update current movie
    updateCurrentMovie(
      data.index || logData.movies.currentMovie.index + 1,
      data.title || "",
      data.url || ""
    );
  }
  // For database updates
  else if (category === 'movie_db_fetched' && data) {
    const page = data.page || logData.fetch.currentPage;
    updatePageMovies(page, { 
      inDb: (logData.currentPage.inDb || 0) + 1 
    });
  }
  // For page completed
  else if (category === 'page_complete' && data && data.page) {
    updatePageMovies(data.page, { status: "completed" });
  }
  
  // Critical errors should be logged
  if (level === 'error') {
    logError(message, data?.error);
  }
  
  // Console log based on level
  if (level === 'info') {
    console.log(message);
  } else if (level === 'warn') {
    console.warn(message);
  }
  
  return true;
};

// Update status with a single call
const updateStatus = (status, progress = null) => {
  logData.status = status;
  saveLogData();
};

// Update current operation
const updateOperation = (operation, status = null) => {
  logData.currentOperation = operation;
  if (status) {
    logData.status = status;
  }
  saveLogData();
};

// Reset progress for a new fetch operation
const resetProgress = () => {
  logData = {
    timestamp: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    status: "idle",
    fetch: {
      startPage: 0,
      endPage: 0,
      currentPage: 0,
      direction: "none",
      pagesCompleted: 0,
      pagesTotal: 0,
      pageProgress: 0
    },
    movies: {
      found: 0,
      processed: 0,
      inDb: 0,
      moviesCompleted: 0,
      sectionsTotal: 0,
      progress: 0,
      currentMovie: {
        index: 0,
        title: "",
        url: ""
      }
    },
    currentOperation: "",
    lastError: null,
    currentPage: {
      number: 0,
      found: 0,
      processed: 0,
      inDb: 0,
      moviesCompleted: 0,
      sectionsTotal: 0,
      linksFound: 0,
      linksProcessed: 0,
      status: "pending",
      progress: 0
    }
  };
  
  saveLogData();
};

// Export functions
module.exports = {
  initializeLogger,
  log,
  updateStatus,
  updateOperation,
  setPageRange,
  updateCurrentPage,
  updatePageMovies,
  updateCurrentMovie,
  updateLinkProgress,
  resetProgress,
  logError,
  getLogData: () => logData,
  // For backward compatibility
  updateProgress: (data) => {
    // Handle legacy calls
    return true;
  },
  compactLogFile: () => true
}; 