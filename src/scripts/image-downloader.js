const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const sqlite3 = require('sqlite3').verbose();
const config = require('../utils/config');

// Configuration
const DOWNLOAD_CONFIG = {
  outputDir: path.join(process.cwd(), 'api', 'data', 'img-source'),
  concurrentDownloads: 10, // Process 10 items at a time
  retryAttempts: 3,
  retryDelay: 1000,
  timeout: 30000,
  humanDelay: {
    min: 100,
    max: 300
  },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

// Use environment variable if set, otherwise use config
const dbPath = process.env.DB_PATH ? 
  path.join(process.cwd(), process.env.DB_PATH) : 
  config.db.path;

// Statistics tracking
let stats = {
  total: 0,
  downloaded: 0,
  failed: 0,
  skipped: 0,
  manualDownloads: 0, // Track manual download files created
  startTime: null,
  endTime: null
};

// Database connection
let db;

// Helper function to run SQL queries as promises
function runQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// Helper function to get full thumbnail URL
function getFullThumbnailUrl(thumbnailPath) {
  if (!thumbnailPath) {
    return null;
  }
  
  // If the path already starts with http:// or https://, return it as is
  if (thumbnailPath.startsWith('http://') || thumbnailPath.startsWith('https://')) {
    return thumbnailPath;
  }
  
  // Extract the path after /wp-content/ if it exists
  const wpContentIndex = thumbnailPath.indexOf('/wp-content/');
  const imagePath = wpContentIndex !== -1 ? thumbnailPath.substring(wpContentIndex) : thumbnailPath;
  
  // Ensure the image path starts with a forward slash
  const normalizedPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  
  // Use the fixed domain from config
  const fullUrl = `${config.api.rootUrl}${normalizedPath}`;
  
  return fullUrl;
}

// Helper function to get file extension from URL
function getFileExtension(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const extension = path.extname(pathname);
    return extension || '.jpg'; // Default to .jpg if no extension found
  } catch (error) {
    return '.jpg'; // Default fallback
  }
}

// Helper function to sanitize filename for filesystem
function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*]/g, '_') // Remove invalid characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/[^\w\-_.]/g, '') // Keep only alphanumeric, hyphens, underscores, dots
    .substring(0, 100); // Limit length
}

// Helper function to create directory if it doesn't exist
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Helper function to add human-like delay
function humanDelay() {
  const delay = Math.floor(Math.random() * (DOWNLOAD_CONFIG.humanDelay.max - DOWNLOAD_CONFIG.humanDelay.min + 1)) + DOWNLOAD_CONFIG.humanDelay.min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Helper function to download file
function downloadFile(url, filePath, retryCount = 0) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': DOWNLOAD_CONFIG.userAgent,
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: DOWNLOAD_CONFIG.timeout
    };

    const request = client.request(options, (response) => {
      if (response.statusCode === 200) {
        const fileStream = fs.createWriteStream(filePath);
        response.pipe(fileStream);
        
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(filePath);
        });
        
        fileStream.on('error', (error) => {
          fs.unlink(filePath, () => {}); // Delete the file if it exists
          reject(error);
        });
      } else if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirects
        const newUrl = response.headers.location;
        if (newUrl && retryCount < DOWNLOAD_CONFIG.retryAttempts) {
          setTimeout(() => {
            downloadFile(newUrl, filePath, retryCount + 1)
              .then(resolve)
              .catch(reject);
          }, DOWNLOAD_CONFIG.retryDelay);
        } else {
          reject(new Error(`HTTP ${response.statusCode}: Redirect limit exceeded`));
        }
      } else {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      }
    });

    request.on('error', (error) => {
      reject(error);
    });

    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });

    request.end();
  });
}

// Helper function to download image with retry logic
async function downloadImageWithRetry(url, filePath) {
  for (let attempt = 1; attempt <= DOWNLOAD_CONFIG.retryAttempts; attempt++) {
    try {
      await downloadFile(url, filePath);
      return filePath;
    } catch (error) {
      console.log(`  Attempt ${attempt}/${DOWNLOAD_CONFIG.retryAttempts} failed: ${error.message}`);
      
      if (attempt === DOWNLOAD_CONFIG.retryAttempts) {
        throw error;
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, DOWNLOAD_CONFIG.retryDelay * attempt));
    }
  }
}

// Helper function to process a single movie
async function processMovie(movie, chunkNumber) {
  const { id, title, thumbnail, info } = movie;
  
  if (!thumbnail) {
    console.log(`[${id}] Skipping "${title}" - No thumbnail`);
    stats.skipped++;
    return;
  }

  const fullUrl = getFullThumbnailUrl(thumbnail);
  if (!fullUrl) {
    console.log(`[${id}] Skipping "${title}" - Invalid thumbnail URL`);
    stats.skipped++;
    return;
  }

  // Create directory for this chunk
  const chunkDir = path.join(DOWNLOAD_CONFIG.outputDir, `chunk${chunkNumber}`);
  ensureDirectoryExists(chunkDir);

  // Parse info to get actual movie title
  let actualTitle = title; // fallback to full title
  try {
    const infoData = JSON.parse(info || '[]');
    if (infoData && infoData[0] && infoData[0].title) {
      actualTitle = infoData[0].title;
    }
  } catch (error) {
    console.log(`[${id}] Warning: Could not parse info for "${title}", using full title`);
  }

  // Determine filename using actual movie title + ID
  const extension = getFileExtension(fullUrl);
  const sanitizedTitle = actualTitle
    .replace(/[<>:"/\\|?*]/g, '_') // Remove invalid characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/[^\w\-_.]/g, '') // Keep only alphanumeric, hyphens, underscores, dots
    .substring(0, 100); // Limit length
  const filename = `${sanitizedTitle}_${id}${extension}`;
  const filePath = path.join(chunkDir, filename);

  // Check if file already exists
  if (fs.existsSync(filePath)) {
    console.log(`[${id}] Skipping "${actualTitle}" - File already exists`);
    stats.skipped++;
    return;
  }

  try {
    console.log(`[${id}] Downloading "${actualTitle}" from ${fullUrl}`);
    await downloadImageWithRetry(fullUrl, filePath);
    console.log(`[${id}] ✓ Downloaded "${actualTitle}" to ${filePath}`);
    stats.downloaded++;
    
    // Add human-like delay after successful download
    await humanDelay();
  } catch (error) {
    console.error(`[${id}] ✗ Failed to download "${actualTitle}": ${error.message}`);
    stats.failed++;
    
    // Clean up partial file if it exists
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Check if it's a 404 error and create a text file for manual download
    if (error.message.includes('404') || error.message.includes('Not Found')) {
      const txtFilePath = path.join(chunkDir, `${sanitizedTitle}_${id}.txt`);
      
      // Create text file with download information
      const txtContent = `Manual Download Required
=======================

Movie ID: ${id}
Title: ${actualTitle}
Full Title: ${title}
Original URL: ${fullUrl}
Error: ${error.message}
Date: ${new Date().toISOString()}

Instructions:
1. Manually download the image from: ${fullUrl}
2. Save it as: ${filename}
3. Place it in this directory: ${chunkDir}
4. Delete this text file after successful download

Note: This text file was created because the automatic download failed with a 404 error.
`;
      
      try {
        fs.writeFileSync(txtFilePath, txtContent);
        console.log(`[${id}] 📝 Created manual download file: ${txtFilePath}`);
        stats.manualDownloads++;
      } catch (txtError) {
        console.error(`[${id}] ✗ Failed to create manual download file: ${txtError.message}`);
      }
    }
  }
}

// Helper function to process movies in batches
async function processMoviesInBatches(movies, chunkNumber) {
  const batches = [];
  for (let i = 0; i < movies.length; i += DOWNLOAD_CONFIG.concurrentDownloads) {
    batches.push(movies.slice(i, i + DOWNLOAD_CONFIG.concurrentDownloads));
  }

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`\nProcessing batch ${i + 1}/${batches.length} (${batch.length} movies)`);
    
    const promises = batch.map(movie => processMovie(movie, chunkNumber));
    await Promise.all(promises);
    
    // Small delay between batches to be respectful
    if (i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Helper function to print statistics
function printStats() {
  const duration = stats.endTime - stats.startTime;
  const durationSeconds = Math.floor(duration / 1000);
  const durationMinutes = Math.floor(durationSeconds / 60);
  
  console.log('\n' + '='.repeat(60));
  console.log('DOWNLOAD STATISTICS');
  console.log('='.repeat(60));
  console.log(`Total movies processed: ${stats.total}`);
  console.log(`Successfully downloaded: ${stats.downloaded}`);
  console.log(`Failed downloads: ${stats.failed}`);
  console.log(`Skipped (no thumbnail/exists): ${stats.skipped}`);
  console.log(`Manual downloads: ${stats.manualDownloads}`);
  console.log(`Duration: ${durationMinutes}m ${durationSeconds % 60}s`);
  if (stats.total > 0) {
    console.log(`Average time per download: ${Math.round(duration / stats.total)}ms`);
  }
  console.log('='.repeat(60));
}

// Function to download images for specific movies (for integration)
async function downloadImagesForMovies(movies, customDbPath = null, chunkNumber = 1) {
  try {
    const useDbPath = customDbPath || dbPath;
    
    // Connect to database
    db = new sqlite3.Database(useDbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        console.error('Error connecting to database:', err);
        throw err;
      }
    });

    // Create output directory
    ensureDirectoryExists(DOWNLOAD_CONFIG.outputDir);

    // Filter movies with thumbnails
    const moviesWithThumbnails = movies.filter(movie => movie.thumbnail);
    
    if (moviesWithThumbnails.length === 0) {
      console.log('⚠️ No movies with thumbnails found in the provided list');
      return {
        success: true,
        stats: { total: 0, downloaded: 0, failed: 0, skipped: 0, manualDownloads: 0 }
      };
    }

    // Initialize statistics
    stats.total = moviesWithThumbnails.length;
    stats.startTime = Date.now();

    console.log(`🔄 Starting image downloads for ${moviesWithThumbnails.length} movies with thumbnails...`);
    console.log(`📁 Images will be saved to: ${path.join(DOWNLOAD_CONFIG.outputDir, `chunk${chunkNumber}`)}`);
    await processMoviesInBatches(moviesWithThumbnails, chunkNumber);

    // Finalize statistics
    stats.endTime = Date.now();
    printStats();

    return {
      success: true,
      stats: { ...stats }
    };

  } catch (error) {
    console.error('❌ Error downloading images:', error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    // Close database connection
    if (db) {
      db.close();
    }
  }
}

// Export functions for potential reuse
module.exports = {
  downloadImage: processMovie,
  downloadImagesForMovies,
  getFullThumbnailUrl,
  DOWNLOAD_CONFIG
};

// Run main function if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
} 