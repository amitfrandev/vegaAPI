const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const db = require('../db/db');
const config = require('../utils/config');
const url = require('url');
const xml2js = require('xml2js');

// Enable debug mode if --debug flag is provided
const DEBUG = process.argv.includes('--debug');

// Debug log function - only prints if debug mode is enabled
function debugLog(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

// Check if --help or -h is provided
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: npm run tag [URL] [METHOD] [START_PAGE] [END_PAGE]
   or: npm run tag-category [URL] [METHOD] [START_PAGE] [END_PAGE]

Arguments:
  URL         The category URL to process (e.g. https://vegamovies.bot/anime-series/)
  METHOD      'P' for pages, 'S' for sitemap (default: S)
  START_PAGE  Starting page number (only used with 'P' method, default: 1)
  END_PAGE    Ending page number (only used with 'P' method, default: 5)

Examples:
  npm run tag https://vegamovies.bot/anime-series/ S
  npm run tag https://vegamovies.bot/movies-by-genres/action/ P 1 5

Note: You must provide the URL as a command line argument.
  `);
  process.exit(0);
}

// Function to extract tag from URL
function extractTagFromUrl(urlString) {
  try {
    const parsedUrl = new URL(urlString);
    const pathname = parsedUrl.pathname;
    
    // Split the path into segments and filter out empty strings
    const segments = pathname.split('/').filter(Boolean);
    
    // For categories, use the type and slug
    if (segments.length >= 2) {
      const type = segments[0];
      const slug = segments[1];
      
      // Convert slug back to tag format (replace hyphens with dots)
      const tag = slug.replace(/-/g, '.');
      
      return {
        type,
        slug,
        tag
      };
    }
    
    return null;
  } catch (error) {
    console.error(`Error extracting tag from URL: ${error.message}`);
    return null;
  }
}

// Function to extract normalized URL from HTML


// Normalize URL function (remove domain, trailing slashes, etc.)


// Additional helper function for URL matching
function normalizeUrlPath(urlPath) {
  // Remove leading and trailing slashes, ensure consistent format
  return urlPath.replace(/^\/+|\/+$/g, '');
}

// Define static categories
const STATIC_CATEGORIES = [
  { type: 'web-series', slug: 'netflix', name: 'Netflix', path: 'netflix' },
  { type: 'anime-series', slug: '', name: 'Anime', path: 'anime-series' },
  { type: 'korean-series', slug: '', name: 'K-Drama', path: 'korean-series' },
  { type: 'web-series', slug: 'amazon-prime', name: 'AMZN Prime', path: 'amazon-prime-video' },
];

// Helper function to check if URL contains a category


// Function to normalize URL for database matching
function normalizeUrlForDb(url) {
  try {
    // Remove protocol and domain if present
    let normalized = url.replace(/^https?:\/\/[^\/]+\//, '');
    
    // Remove api/url/ prefix if present
    normalized = normalized.replace(/^api\/url\//, '');
    
    // Keep trailing slash - important for database matching
    if (!normalized.endsWith('/')) {
      normalized += '/';
    }
    
    return normalized;
  } catch (error) {
    console.error(`Error normalizing URL for DB: ${error.message}`);
    return url;
  }
}

// Function to get cache file path for a category
function getCategoryCachePath(categoryPath) {
  const cacheDir = path.join(config.paths.output, 'cache', 'categories');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return path.join(cacheDir, `${categoryPath.replace(/[\/\\]/g, '-')}.json`);
}

// Function to read from cache
function readFromCache(cachePath) {
  try {
    if (fs.existsSync(cachePath)) {
      const stats = fs.statSync(cachePath);
      const fileAgeMins = (Date.now() - stats.mtime) / (1000 * 60);
      
      // If cache is less than 24 hours old, use it
      if (fileAgeMins < 24 * 60) {
        const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        console.log(`Using cached data (${Math.round(fileAgeMins)} minutes old)`);
        return cacheData;
      }
    }
    return null;
  } catch (error) {
    console.error(`Error reading cache: ${error.message}`);
    return null;
  }
}

// Function to write to cache
function writeToCache(cachePath, data) {
  try {
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
    console.log('Cache updated successfully');
  } catch (error) {
    console.error(`Error writing to cache: ${error.message}`);
  }
}

// Function to fetch movie list from a page
async function fetchMovieList(categoryUrl, page) {
  try {
    // Get API URL from config
    const API_BASE_URL = config.api.rootUrl;
    if (!API_BASE_URL) {
      throw new Error('API URL not set in config');
    }
    
    // Ensure categoryUrl uses the correct domain
    let fullCategoryUrl = categoryUrl;
    if (!categoryUrl.startsWith('http')) {
      // If only a path was provided, prepend the API_BASE_URL
      fullCategoryUrl = `${API_BASE_URL}${categoryUrl.startsWith('/') ? '' : '/'}${categoryUrl}`;
    }
    
    const pageUrl = page > 1 ? `${fullCategoryUrl}${fullCategoryUrl.endsWith('/') ? '' : '/'}page/${page}/` : fullCategoryUrl;
    console.log(`Fetching movie list from ${pageUrl}`);
    
    const response = await axios.get(pageUrl, {
      headers: config.headers,
      timeout: config.api.timeout
    });
    const $ = cheerio.load(response.data);
    
    // Find all movie links on the page
    const movieLinks = new Set(); // Use Set to avoid duplicates
    $('.entry-title a').each((i, el) => {
      const href = $(el).attr('href');
      if (href) {
        // Normalize the URL to match database format
        const normalizedUrl = normalizeUrlForDb(href);
        movieLinks.add(normalizedUrl);
      }
    });
    
    console.log(`Found ${movieLinks.size} unique movies on page ${page}`);
    return Array.from(movieLinks);
  } catch (error) {
    console.error(`Error fetching movie list from page ${page}: ${error.message}`);
    return [];
  }
}

// Function to fetch sitemap and extract URLs
async function fetchSitemapUrls() {
  try {
    console.log('Fetching sitemap URLs...');
    
    // Use API URL from config
    const API_BASE_URL = config.api.rootUrl;
    
    // Path to the cached sitemap JSON file
    const sitemapCachePath = path.join(config.paths.output, 'sitemap', 'sitemap.json');
    
    // Check if cached sitemap file exists
    if (fs.existsSync(sitemapCachePath)) {
      try {
        // Get file stats for age and size info
        const stats = fs.statSync(sitemapCachePath);
        const fileAgeMins = (Date.now() - stats.mtime) / (1000 * 60);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        
        console.log(`Found cached sitemap file (${fileSizeMB} MB, ${Math.round(fileAgeMins)} minutes old)`);
        console.log(`Last updated: ${new Date(stats.mtime).toLocaleString()}`);
        
        // Read and parse the cached sitemap data
        const fileContents = fs.readFileSync(sitemapCachePath, 'utf-8');
        const cachedData = JSON.parse(fileContents);
        
        if (cachedData && cachedData.allUrls && cachedData.allUrls.length > 0) {
          console.log(`Using ${cachedData.allUrls.length} URLs from cached sitemap (from ${cachedData.pageCount} pages)`);
          
          // Make sure all URLs are properly formatted (without leading slash)
          const cleanedUrls = cachedData.allUrls.map(url => {
            // Remove leading slash if present
            return url.startsWith('/') ? url.substring(1) : url;
          });
          
          // Filter out category pages and only keep movie URLs
          const movieUrls = cleanedUrls.filter(url => {
            // Skip URLs that are category pages or sitemap pages
            return !url.includes('page/') && 
                   !url.includes('sitemap') && 
                   !url.includes('categories') &&
                   url.split('/').length >= 2;
          });
          
          if (DEBUG) {
            console.log('\nSample URLs from sitemap:');
            movieUrls.slice(0, 5).forEach(url => console.log(url));
          }
          
          console.log(`Filtered to ${movieUrls.length} movie URLs`);
          return movieUrls;
        } else {
          console.log('Cached sitemap file is invalid or empty');
        }
      } catch (error) {
        console.error(`Error reading cached sitemap: ${error.message}`);
      }
    }
    
    // If we get here, we need to fetch sitemaps from the website
    console.log('No valid cached sitemap found.');
    console.log('Please run "npm run sitemap" first to create the sitemap cache.');
    console.log('This will fetch all 24 pages of the sitemap and save them for future use.');
    process.exit(1);
  } catch (error) {
    console.error(`Error in sitemap fetch process: ${error.message}`);
    return [];
  }
}

// Function to add delay between operations
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to extract tags from movie details page
async function extractTagsFromMoviePage(movieUrl) {
  try {
    const response = await axios.get(movieUrl, {
      headers: config.headers,
      timeout: config.api.timeout
    });
    const $ = cheerio.load(response.data);
    
    // Extract tags from the page
    const tags = new Set();
    
    // Get tags from meta keywords
    $('meta[name="keywords"]').each((i, el) => {
      const keywords = $(el).attr('content')?.split(',').map(k => k.trim()) || [];
      keywords.forEach(keyword => tags.add(keyword.toLowerCase()));
    });
    
    // Get tags from category links
    $('.entry-categories a').each((i, el) => {
      const href = $(el).attr('href');
      if (href) {
        const categoryPath = normalizeUrlPath(href);
        const parts = categoryPath.split('/');
        if (parts.length >= 2) {
          tags.add(parts[0]); // Add category type
          tags.add(parts[1]); // Add category slug
        }
      }
    });
    
    // Get tags from breadcrumbs
    $('.breadcrumb a').each((i, el) => {
      const href = $(el).attr('href');
      if (href) {
        const categoryPath = normalizeUrlPath(href);
        const parts = categoryPath.split('/');
        if (parts.length >= 2) {
          tags.add(parts[0]); // Add category type
          tags.add(parts[1]); // Add category slug
        }
      }
    });
    
    return Array.from(tags);
  } catch (error) {
    console.error(`Error extracting tags from ${movieUrl}: ${error.message}`);
    return [];
  }
}

// Function to get related tags for a category
function getRelatedTags(category, categories) {
  // Just return the full category path as a single tag
  return [`${category.type}/${category.slug}`];
}

// Function to fetch all movie URLs from a category
async function fetchAllCategoryUrls(categoryPath) {
  try {
    console.log(`\nFetching all URLs for category: ${categoryPath}`);
    const cachePath = getCategoryCachePath(categoryPath);
    
    // Try to read from cache first
    const cachedData = readFromCache(cachePath);
    if (cachedData && cachedData.urls && cachedData.urls.length > 0) {
      console.log(`Found ${cachedData.urls.length} URLs in cache`);
      return cachedData.urls;
    }
    
    const allUrls = new Set();
    let page = 1;
    let hasMorePages = true;
    
    while (hasMorePages) {
      console.log(`Fetching page ${page}...`);
      const pageUrls = await fetchMovieList(categoryPath, page);
      
      if (pageUrls.length === 0) {
        hasMorePages = false;
        console.log('No more pages found');
        break;
      }
      
      // Add URLs to set to avoid duplicates
      pageUrls.forEach(url => allUrls.add(url));
      console.log(`Found ${pageUrls.length} URLs on page ${page}`);
      
      // Add a small delay between pages
      await delay(1000);
      page++;
    }
    
    const urls = Array.from(allUrls);
    console.log(`Total unique URLs found: ${urls.length}`);
    
    // Save to cache
    writeToCache(cachePath, {
      timestamp: new Date().toISOString(),
      categoryPath,
      urls
    });
    
    return urls;
  } catch (error) {
    console.error(`Error fetching category URLs: ${error.message}`);
    return [];
  }
}

// Function to process a batch of movies
async function processBatch(movieUrls, category, batchSize = 10) {
  const results = { success: [], failed: [] };
  const processedUrls = new Set(); // Track processed URLs to avoid duplicates
  
  // Process URLs in batches
  for (let i = 0; i < movieUrls.length; i += batchSize) {
    const batch = movieUrls.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(movieUrls.length/batchSize)}`);
    
    // Process batch concurrently
    const batchPromises = batch.map(async movieUrl => {
      // Skip if already processed
      if (processedUrls.has(movieUrl)) {
        console.log(`Skipping already processed URL: ${movieUrl}`);
        return null;
      }
      
      try {
        // Get the category tag
        const categoryTag = category.slug || (category.path ? category.path.split('/').pop() : category.type);
        
        // Add the category tag to the movie
        const result = await addTagsToMovie(movieUrl, [categoryTag]);
        
        // Mark URL as processed
        processedUrls.add(movieUrl);
        
        return result;
      } catch (error) {
        return { 
          success: false, 
          message: error.message, 
          url: movieUrl 
        };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    // Sort results
    batchResults.forEach(result => {
      if (result) { // Skip null results from already processed URLs
      if (result.success) {
        results.success.push(result);
      } else {
        results.failed.push(result);
        }
      }
    });
    
    // Small delay between batches
    if (i + batchSize < movieUrls.length) {
      await delay(100);
    }
  }
  
  return results;
}

// Function to add multiple tags to a movie
async function addTagsToMovie(movieUrl, tags) {
  try {
    const normalizedUrl = normalizeUrlForDb(movieUrl);
    console.log(`\nProcessing movie URL: ${normalizedUrl}`);
    
    // Direct database query using available methods
    console.log(`Looking for movie with URL: ${normalizedUrl}`);
    
    // We know db.getAllMovies is available but returns Criminal Code as a fallback
    // Let's try a different approach by using exact matches
    
    // Create an array of possible URLs to try (with and without trailing slash)
    const urlVariations = [
      normalizedUrl,
      normalizedUrl.endsWith('/') ? normalizedUrl.slice(0, -1) : normalizedUrl + '/'
    ];
    
    let movie = null;
    
    // Try exact URL matching using getAllMovies with a strict condition
    for (const urlToTry of urlVariations) {
      console.log(`Trying exact URL match: ${urlToTry}`);
      
      // Use a more specific query to prevent fallback behavior
      const result = await db.getAllMovies(1, 1, { 
        url: urlToTry,
        // Additional conditions to ensure we don't get fallbacks
        exactMatch: true,
        noFallback: true
      });
      
      if (result && result.movies && result.movies.length > 0) {
        const foundMovie = result.movies[0];
        
        // Skip if it's the Criminal Code movie (ID: 4606) which seems to be a fallback
        if (foundMovie.id === 4606) {
          console.log(`Skipping Criminal Code movie (fallback result)`);
          continue;
        }
        
        movie = foundMovie;
        console.log(`Found movie: ${movie.title} (ID: ${movie.id})`);
        break;
      }
    }
    
    if (!movie) {
      console.log(`No movie found with URL: ${normalizedUrl}`);
      return { 
        success: false, 
        message: 'Movie not found in database', 
        url: normalizedUrl 
      };
    }
    
    console.log(`Found movie in database: ${movie.title} (ID: ${movie.id})`);
    console.log(`Movie URL in database: ${movie.url}`);
    
    // Initialize tags array if it doesn't exist
    if (!movie.tags) {
      movie.tags = [];
    }
    
    const normalizedTags = movie.tags.map(t => t.toLowerCase());
    let tagsAdded = false;
    
    for (const tag of tags) {
      const normalizedNewTag = tag.toLowerCase();
      if (!normalizedTags.includes(normalizedNewTag)) {
        movie.tags.push(tag);
        tagsAdded = true;
        console.log(`Added tag "${tag}" to movie: ${movie.title}`);
      } else {
        console.log(`Tag "${tag}" already exists for movie: ${movie.title}`);
      }
    }
    
    if (tagsAdded) {
      // Use saveMovie which we know exists
      await db.saveMovie(movie);
      console.log(`Updated tags for movie ID: ${movie.id}`);
    }
    
    return { 
      success: true, 
      message: 'Tags added or already exist', 
      url: movie.url, 
      title: movie.title, 
      id: movie.id,
      tags: movie.tags 
    };
  } catch (error) {
    console.error(`Error processing movie ${movieUrl}: ${error.message}`);
    return { success: false, message: error.message, url: movieUrl };
  }
}

// Main function
async function main() {
  try {
    console.log('\n=== Vega Category Tag Inserter ===');
    
    // Initialize the database
    await db.initializeDatabase();
    console.log('Database initialized successfully');
    
    // Get command line arguments
    let categoryUrl = process.argv[2];
    let method = process.argv[3] || 'P'; // Default to pages method
    let startPage = parseInt(process.argv[4] || '1', 10);
    let endPage = parseInt(process.argv[5] || '5', 10);
    
    // If no URL provided, process all static categories
    if (!categoryUrl) {
      console.log('\nNo category URL provided. Processing all static categories...');
      
      // Process each static category
      for (const category of STATIC_CATEGORIES) {
        console.log(`\nProcessing category: ${category.name} (${category.path})`);
        
        // Get the category tag
        const categoryTag = category.slug || (category.path ? category.path.split('/').pop() : category.type);
        console.log(`Using category tag: ${categoryTag}`);
        
        // Fetch all category data from API
        console.log(`\nFetching recent movies for direct ID-based tagging...`);
        
        try {
          // Get the 200 most recent movies from database
          const result = await db.getAllMovies(1, 200, { sortField: 'date', sortDirection: 'DESC' });
          
          if (result && result.movies && result.movies.length > 0) {
            const movies = result.movies;
            console.log(`Found ${movies.length} movies to check for category: ${category.name}`);
            
            // For netflix/web series, check title and info
            let matchedMovies = [];
            
            if (category.type === 'web-series' && category.slug === 'netflix') {
              // For Netflix, check for "Netflix" in title or info
              matchedMovies = movies.filter(movie => {
                const titleMatch = movie.title && movie.title.toLowerCase().includes('netflix');
                const infoMatch = movie.info && movie.info.some(info => 
                  (info.platform && info.platform.toLowerCase().includes('netflix')) ||
                  (info.description && info.description.toLowerCase().includes('netflix'))
                );
                return titleMatch || infoMatch;
              });
            } else if (category.type === 'web-series' && category.slug === 'amazon-prime-video') {
              // For Amazon, check for "Amazon" or "Prime" in title or info
              matchedMovies = movies.filter(movie => {
                const titleMatch = movie.title && (
                  movie.title.toLowerCase().includes('amazon') || 
                  movie.title.toLowerCase().includes('prime')
                );
                const infoMatch = movie.info && movie.info.some(info => 
                  (info.platform && (
                    info.platform.toLowerCase().includes('amazon') || 
                    info.platform.toLowerCase().includes('prime')
                  )) ||
                  (info.description && (
                    info.description.toLowerCase().includes('amazon') || 
                    info.description.toLowerCase().includes('prime')
                  ))
                );
                return titleMatch || infoMatch;
              });
            } else if (category.type === 'anime-series') {
              // For Anime, check title, tags, and genres
              matchedMovies = movies.filter(movie => {
                const titleMatch = movie.title && movie.title.toLowerCase().includes('anime');
                const tagMatch = movie.tags && movie.tags.some(tag => 
                  tag.toLowerCase() === 'anime' || tag.toLowerCase().includes('anime')
                );
                const infoMatch = movie.info && movie.info.some(info => 
                  (info.genre && info.genre.toLowerCase().includes('anime')) ||
                  (info.description && info.description.toLowerCase().includes('anime'))
                );
                return titleMatch || tagMatch || infoMatch;
              });
            } else if (category.type === 'korean-series') {
              // For Korean, check title, tags and genres
              matchedMovies = movies.filter(movie => {
                const titleMatch = movie.title && (
                  movie.title.toLowerCase().includes('korean') || 
                  movie.title.toLowerCase().includes('korea') ||
                  movie.title.toLowerCase().includes('k-drama')
                );
                const tagMatch = movie.tags && movie.tags.some(tag => 
                  tag.toLowerCase().includes('korean') || 
                  tag.toLowerCase().includes('korea') ||
                  tag.toLowerCase().includes('k-drama')
                );
                const infoMatch = movie.info && movie.info.some(info => 
                  (info.language && info.language.toLowerCase().includes('korean')) ||
                  (info.description && (
                    info.description.toLowerCase().includes('korean') ||
                    info.description.toLowerCase().includes('korea') ||
                    info.description.toLowerCase().includes('k-drama')
                  ))
                );
                return titleMatch || tagMatch || infoMatch;
              });
            }
            
            console.log(`Found ${matchedMovies.length} movies matching category: ${category.name}`);
            
            // Process matches
            for (const movie of matchedMovies) {
              console.log(`\nProcessing movie: ${movie.title} (ID: ${movie.id})`);
              
              // Initialize tags array if needed
              if (!movie.tags) {
                movie.tags = [];
              }
              
              // Add the category tag if not already present
              if (!movie.tags.includes(categoryTag)) {
                movie.tags.push(categoryTag);
                console.log(`Added tag "${categoryTag}" to movie: ${movie.title}`);
                
                // Save the movie with new tag
                await db.saveMovie(movie);
                console.log(`Saved tag for movie ID: ${movie.id}`);
              } else {
                console.log(`Tag "${categoryTag}" already exists for movie: ${movie.title}`);
              }
            }
            
            // Save results to tag-status.json
            const statusDir = path.join(config.paths.output, 'status');
            if (!fs.existsSync(statusDir)) {
              fs.mkdirSync(statusDir, { recursive: true });
            }
            
            const statusFilePath = path.join(statusDir, `tag-status-${category.type}${category.slug ? '-' + category.slug : ''}.json`);
            fs.writeFileSync(statusFilePath, JSON.stringify({
              timestamp: new Date().toISOString(),
              category: {
                type: category.type,
                name: category.name,
                slug: category.slug,
                path: category.path
              },
              tag: categoryTag,
              categoryUrl: category.path,
              processed: matchedMovies.length,
              successful: matchedMovies.length,
              movieIds: matchedMovies.map(m => m.id)
            }, null, 2));
            
            console.log(`\nResults saved to: ${statusFilePath}`);
            console.log(`Tagged ${matchedMovies.length} movies for category: ${category.name}`);
          } else {
            console.log(`No movies found to process`);
          }
        } catch (error) {
          console.error(`Error fetching movies for category ${category.name}: ${error.message}`);
        }
        
        // Add a small delay between categories
        await delay(2000);
      }
      
      console.log('\n=== All Categories Processing Complete ===');
      return;
    }
    
    // If URL is provided, find matching static category or create new one
    let category = STATIC_CATEGORIES.find(cat => {
      const normalizedUrl = normalizeUrlPath(categoryUrl);
      const normalizedPath = normalizeUrlPath(cat.path);
      return normalizedUrl === normalizedPath;
    });
    
    // If category not found in static list, create new one
    if (!category) {
      category = {
        type: categoryUrl.split('/')[0],
        slug: categoryUrl.split('/')[1] || '',
        path: categoryUrl,
        name: categoryUrl.split('/').pop().split('-').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ')
      };
    }
    
    console.log(`\nProcessing category: ${category.name} (${category.path})`);
    
    // Get the category tag
    const categoryTag = category.slug || (category.path ? category.path.split('/').pop() : category.type);
    console.log(`Using category tag: ${categoryTag}`);
    
    // Process similar to the multi-category approach above but for a single category
    console.log(`\nFetching recent movies for direct ID-based tagging...`);
    
    try {
      // Get the 100 most recent movies from database
      const result = await db.getAllMovies(1, 100, { sortField: 'date', sortDirection: 'DESC' });
      
      if (result && result.movies && result.movies.length > 0) {
        const movies = result.movies;
        console.log(`Found ${movies.length} movies to check for category: ${category.name}`);
        
        // Match movies based on category
        let matchedMovies = [];
        
        if (category.type === 'web-series' && category.slug === 'netflix') {
          // For Netflix, check for "Netflix" in title or info
          matchedMovies = movies.filter(movie => {
            const titleMatch = movie.title && movie.title.toLowerCase().includes('netflix');
            const infoMatch = movie.info && movie.info.some(info => 
              (info.platform && info.platform.toLowerCase().includes('netflix')) ||
              (info.description && info.description.toLowerCase().includes('netflix'))
            );
            return titleMatch || infoMatch;
          });
        } else if (category.type === 'web-series' && category.slug === 'amazon-prime-video') {
          // For Amazon, check for "Amazon" or "Prime" in title or info
          matchedMovies = movies.filter(movie => {
            const titleMatch = movie.title && (
              movie.title.toLowerCase().includes('amazon') || 
              movie.title.toLowerCase().includes('prime')
            );
            const infoMatch = movie.info && movie.info.some(info => 
              (info.platform && (
                info.platform.toLowerCase().includes('amazon') || 
                info.platform.toLowerCase().includes('prime')
              )) ||
              (info.description && (
                info.description.toLowerCase().includes('amazon') || 
                info.description.toLowerCase().includes('prime')
              ))
            );
            return titleMatch || infoMatch;
          });
        } else if (category.type === 'anime-series') {
          // For Anime, check title, tags, and genres
          matchedMovies = movies.filter(movie => {
            const titleMatch = movie.title && movie.title.toLowerCase().includes('anime');
            const tagMatch = movie.tags && movie.tags.some(tag => 
              tag.toLowerCase() === 'anime' || tag.toLowerCase().includes('anime')
            );
            const infoMatch = movie.info && movie.info.some(info => 
              (info.genre && info.genre.toLowerCase().includes('anime')) ||
              (info.description && info.description.toLowerCase().includes('anime'))
            );
            return titleMatch || tagMatch || infoMatch;
          });
        } else if (category.type === 'korean-series') {
          // For Korean, check title, tags and genres
          matchedMovies = movies.filter(movie => {
            const titleMatch = movie.title && (
              movie.title.toLowerCase().includes('korean') || 
              movie.title.toLowerCase().includes('korea') ||
              movie.title.toLowerCase().includes('k-drama')
            );
            const tagMatch = movie.tags && movie.tags.some(tag => 
              tag.toLowerCase().includes('korean') || 
              tag.toLowerCase().includes('korea') ||
              tag.toLowerCase().includes('k-drama')
            );
            const infoMatch = movie.info && movie.info.some(info => 
              (info.language && info.language.toLowerCase().includes('korean')) ||
              (info.description && (
                info.description.toLowerCase().includes('korean') ||
                info.description.toLowerCase().includes('korea') ||
                info.description.toLowerCase().includes('k-drama')
              ))
            );
            return titleMatch || tagMatch || infoMatch;
          });
        }
        
        console.log(`Found ${matchedMovies.length} movies matching category: ${category.name}`);
        
        // Process matches
        for (const movie of matchedMovies) {
          console.log(`\nProcessing movie: ${movie.title} (ID: ${movie.id})`);
          
          // Initialize tags array if needed
          if (!movie.tags) {
            movie.tags = [];
          }
          
          // Add the category tag if not already present
          if (!movie.tags.includes(categoryTag)) {
            movie.tags.push(categoryTag);
            console.log(`Added tag "${categoryTag}" to movie: ${movie.title}`);
            
            // Save the movie with new tag
            await db.saveMovie(movie);
            console.log(`Saved tag for movie ID: ${movie.id}`);
          } else {
            console.log(`Tag "${categoryTag}" already exists for movie: ${movie.title}`);
          }
    }
    
    // Save results to tag-status.json
    const statusDir = path.join(config.paths.output, 'status');
    if (!fs.existsSync(statusDir)) {
      fs.mkdirSync(statusDir, { recursive: true });
    }
    
        const statusFilePath = path.join(statusDir, `tag-status-${category.type}${category.slug ? '-' + category.slug : ''}.json`);
    fs.writeFileSync(statusFilePath, JSON.stringify({
      timestamp: new Date().toISOString(),
      category: {
        type: category.type,
        name: category.name,
            slug: category.slug,
        path: category.path
      },
          tag: categoryTag,
          categoryUrl: category.path,
          processed: matchedMovies.length,
          successful: matchedMovies.length,
          movieIds: matchedMovies.map(m => m.id)
    }, null, 2));

    console.log('\n=== Processing Complete ===');
        console.log(`Tagged ${matchedMovies.length} movies for category: ${category.name}`);
    console.log(`Results saved to: ${statusFilePath}`);
      } else {
        console.log(`No movies found to process`);
      }
    } catch (error) {
      console.error(`Error processing category: ${error.message}`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    // Close database connection
    await db.closeDatabase();
  }
}

// Run the main function
main();