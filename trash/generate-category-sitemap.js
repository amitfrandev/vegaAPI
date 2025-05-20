const axios = require('axios');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const config = require('../src/utils/config');
const db = require('../src/db/db');

// Path to save the sitemap JSONs
const SITEMAP_DIR = path.join(config.paths.output, 'sitemap');
const CATEGORIES_FILE_PATH = path.join(SITEMAP_DIR, 'categories.json');

// Function to extract category metadata
function extractCategoryMetadata(url) {
  const parts = url.split('/').filter(Boolean);
  const lastPart = parts[parts.length - 1];
  const basePath = parts[0];
  
  // Create slug array from path parts
  const slugParts = parts.slice(1).map(part => part.replace(/\./g, '-'));
  const slug = slugParts.length > 0 ? slugParts : [basePath];
  
  return {
    slug: slug,
    path: url,
    basePath: basePath,
    name: lastPart.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' '),
    isMainCategory: parts.length === 2
  };
}

// Function to organize categories by type
function organizeCategories(urls) {
  const categories = {
    "movies-by-genres": {
      title: "Movie Genres",
      description: "Categories based on movie genres",
      slugs: []
    },
    "movies-by-quality": {
      title: "Video Quality",
      description: "Categories based on video quality and format",
      slugs: []
    },
    "movies-by-year": {
      title: "Release Years",
      description: "Categories based on movie release years",
      slugs: []
    },
    "web-series": {
      title: "Web Series",
      description: "Categories for web series and streaming platforms",
      slugs: []
    },
    "tv-series": {
      title: "TV Series",
      description: "Categories for TV series and networks",
      slugs: []
    },
    "special": {
      title: "Special Categories",
      description: "Other special movie categories",
      slugs: []
    },
    "adult": {
      title: "Adult Content",
      description: "Adult content categories",
      slugs: []
    }
  };

  // First pass: organize URLs into categories
  urls.forEach(url => {
    const parts = url.split('/').filter(Boolean);
    const basePath = parts[0];
    const slug = parts[1]?.replace(/\./g, '-');
    
    if (slug && categories[basePath]) {
      if (!categories[basePath].slugs.includes(slug)) {
        categories[basePath].slugs.push(slug);
      }
    }
  });

  // Sort slugs within each category
  Object.keys(categories).forEach(key => {
    if (key === 'movies-by-year') {
      // Sort years in descending order
      categories[key].slugs.sort((a, b) => {
        const yearA = parseInt(a);
        const yearB = parseInt(b);
        return yearB - yearA;
      });
    } else {
      // Sort other categories alphabetically
      categories[key].slugs.sort();
    }
  });

  return categories;
}

// Function to fetch only category sitemap
async function fetchAndSaveCategorySitemap() {
  try {
    console.log('\n=== Generating Category Sitemap ===');
    
    // Get API URL from config
    const API_BASE_URL = config.api.rootUrl;
    if (!API_BASE_URL) {
      console.error('Error: API URL not set in config');
      process.exit(1);
    }
    
    console.log(`Using API URL from config: ${API_BASE_URL}`);
    
    // Function to strip domain from URLs
    const stripDomain = (url) => {
      try {
        const parsedUrl = new URL(url);
        // Get pathname and remove leading slash
        let path = parsedUrl.pathname;
        // Remove leading slash if present
        if (path.startsWith('/')) {
          path = path.substring(1);
        }
        return path;
      } catch (e) {
        // Just in case the URL can't be parsed, try to strip domain manually
        let strippedUrl = url;
        // Remove protocol and domain if present
        if (strippedUrl.includes('://')) {
          strippedUrl = strippedUrl.split('://')[1];
          if (strippedUrl.includes('/')) {
            strippedUrl = strippedUrl.substring(strippedUrl.indexOf('/') + 1);
          }
        }
        // Final check to remove any leading slash
        if (strippedUrl.startsWith('/')) {
          strippedUrl = strippedUrl.substring(1);
        }
        return strippedUrl;
      }
    };
    
    // Ensure output directories exist
    if (!fs.existsSync(SITEMAP_DIR)) {
      fs.mkdirSync(SITEMAP_DIR, { recursive: true });
      console.log(`Created sitemap directory: ${SITEMAP_DIR}`);
    }
    
    // Fetch category sitemap
    console.log('\nFetching category sitemap...');
    const categoryUrls = [];
    try {
      const categorySitemapUrl = `${API_BASE_URL}/sitemap-categories.xml`;
      console.log(`Fetching category sitemap from: ${categorySitemapUrl}`);
      
      const response = await axios.get(categorySitemapUrl, {
        timeout: config.api.timeout,
        headers: config.headers
      });
      
      // Parse XML
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(response.data);
      
      // Extract category URLs
      if (result.urlset && result.urlset.url) {
        const fullCategoryUrls = result.urlset.url.map(item => item.loc[0]);
        const strippedUrls = fullCategoryUrls.map(stripDomain);
        categoryUrls.push(...strippedUrls);
        
        // Organize categories
        const organizedCategories = organizeCategories(strippedUrls);
        
        console.log(`Found ${strippedUrls.length} total category URLs`);
        console.log('\nCategory breakdown:');
        Object.entries(organizedCategories).forEach(([type, data]) => {
          console.log(`- ${data.title}: ${data.slugs.length} slugs`);
        });
        
        // Save category URLs to file with organized structure
        const categoryData = {
          timestamp: new Date().toISOString(),
          totalCategories: strippedUrls.length,
          categories: organizedCategories,
          stats: {
            total: strippedUrls.length,
            byType: Object.fromEntries(
              Object.entries(organizedCategories).map(([key, data]) => [
                key,
                {
                  total: data.slugs.length
                }
              ])
            )
          }
        };
        
        fs.writeFileSync(CATEGORIES_FILE_PATH, JSON.stringify(categoryData, null, 2));
        console.log(`\nSaved organized category URLs to ${CATEGORIES_FILE_PATH}`);
        
        // Save to database (if available)
        try {
          await db.initializeDatabase();
          await db.saveCategorySitemap(categoryData);
          console.log('Category data saved to database');
        } catch (dbError) {
          console.error(`Error saving to database: ${dbError.message}`);
          console.log('Continuing with file-based storage only');
        }
        
        return categoryData;
      } else {
        console.log('No category URLs found in sitemap');
        return null;
      }
    } catch (error) {
      console.error(`Error fetching category sitemap: ${error.message}`);
      return null;
    }
  } catch (error) {
    console.error(`Error in category sitemap generation: ${error.message}`);
    return null;
  }
}

// Run the category sitemap generation
fetchAndSaveCategorySitemap()
  .then(result => {
    if (result) {
      console.log('\nCategory sitemap generation completed successfully');
    } else {
      console.error('\nCategory sitemap generation completed with errors');
      process.exit(1);
    }
    
    // Close database connection if it was opened
    if (db.closeDatabase) {
      db.closeDatabase()
        .then(() => console.log('Database connection closed'))
        .catch(err => console.error('Error closing database:', err));
    }
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  }); 