/**
 * Database to JSON exporter
 * This script exports SQLite data to JSON files for serverless deployment
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const config = require('../utils/config');

// Import image downloader
const { downloadImagesForMovies, getFullThumbnailUrl } = require('../scripts/image-downloader');

// Create output directory
const JSON_OUTPUT_DIR = path.join(process.cwd(), 'api', 'data');
if (!fs.existsSync(JSON_OUTPUT_DIR)) {
  fs.mkdirSync(JSON_OUTPUT_DIR, { recursive: true });
  console.log(`Created directory: ${JSON_OUTPUT_DIR}`);
}

// Use environment variable if set, otherwise use config
const dbPath = process.env.DB_PATH ? 
  path.join(process.cwd(), process.env.DB_PATH) : 
  config.db.path;

console.log(`Using database path: ${dbPath}`);

// Connect to database
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    process.exit(1);
  }
  console.log(`Connected to SQLite database at ${dbPath}`);
});

// Helper function to run SQL queries as promises
function runQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
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

// Helper function to generate local image URL
function generateLocalImageUrl(movieId, title, originalThumbnail, chunkNumber, info) {
  if (!originalThumbnail) return null;
  
  // Parse info to get actual movie title
  let actualTitle = title; // fallback to full title
  try {
    const infoData = JSON.parse(info || '[]');
    if (infoData && infoData[0] && infoData[0].title) {
      actualTitle = infoData[0].title;
    }
  } catch (error) {
    console.log(`Warning: Could not parse info for movie ${movieId}, using full title`);
  }
  
  const extension = getFileExtension(originalThumbnail);
  const sanitizedTitle = actualTitle
    .replace(/[<>:"/\\|?*]/g, '_') // Remove invalid characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/[^\w\-_.]/g, '') // Keep only alphanumeric, hyphens, underscores, dots
    .substring(0, 100); // Limit length
  const filename = `${sanitizedTitle}_${movieId}${extension}`;
  
  // Return local path relative to public directory (images are now in public/data/img-source/chunkX)
  return `/data/img-source/chunk${chunkNumber}/${filename}`;
}

// Main export function
async function exportData() {
  try {
    console.log('Starting database export to JSON...');
    
    // 1. Export all movies (paginated)
    const totalMoviesResult = await runQuery('SELECT COUNT(*) as total FROM movies');
    const totalMovies = totalMoviesResult[0].total;
    console.log(`Total movies: ${totalMovies}`);
    
    // Calculate number of chunks (1000 movies per file)
    const moviesPerFile = 1000;
    const totalChunks = Math.ceil(totalMovies / moviesPerFile);
    
    // Check if there are any movies with thumbnails at all
    const moviesWithThumbnailsResult = await runQuery('SELECT COUNT(*) as total FROM movies WHERE thumbnail IS NOT NULL AND thumbnail != ""');
    const totalMoviesWithThumbnails = moviesWithThumbnailsResult[0].total;
    
    console.log(`Total movies with thumbnails: ${totalMoviesWithThumbnails}`);
    
    // Track total images downloaded across all chunks
    let totalImagesDownloaded = 0;
    let totalImagesSkipped = 0;
    let totalImagesFailed = 0;
    let totalManualDownloads = 0;
    
    console.log(`Processing ${totalChunks} chunks of ${moviesPerFile} movies each...`);
    console.log('='.repeat(60));
    
    for (let chunk = 0; chunk < totalChunks; chunk++) {
      const offset = chunk * moviesPerFile;
      console.log(`\n📦 CHUNK ${chunk + 1}/${totalChunks} (Movies ${offset + 1}-${Math.min(offset + moviesPerFile, totalMovies)})`);
      console.log('='.repeat(60));
      
      // Step 1: Fetch movies for this chunk from database
      console.log(`📋 Step 1: Fetching movies for chunk ${chunk + 1} from database...`);
      const movies = await runQuery(
        `SELECT id, title, url, thumbnail, date, info, tags 
         FROM movies 
         ORDER BY id 
         LIMIT ? OFFSET ?`, 
        [moviesPerFile, offset]
      );
      
      console.log(`✓ Fetched ${movies.length} movies from database`);
      
      // Step 2: Process JSON data with local image URLs FIRST
      console.log(`📄 Step 2: Processing JSON data with local image URLs for chunk ${chunk + 1}...`);
      const processedMovies = movies.map(movie => {
        // Generate local image URL for downloaded images
        const localImageUrl = generateLocalImageUrl(movie.id, movie.title, movie.thumbnail, chunk + 1, movie.info);
        
        return {
          id: movie.id,
          title: movie.title,
          url: movie.url,
          thumbnail: localImageUrl, // Use local URL instead of DB URL
          date: movie.date,
          info: JSON.parse(movie.info || '[]'),
          tags: JSON.parse(movie.tags || '[]')
        };
      });
      
      // Step 3: Write JSON file for this chunk with local image URLs FIRST
      const outputFile = path.join(JSON_OUTPUT_DIR, `movies_${chunk}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(processedMovies));
      console.log(`✅ Exported ${processedMovies.length} movies to ${outputFile} with local image URLs`);
      
      // Step 4: Check if we need to download images (only if there are movies with thumbnails)
      const moviesWithThumbnails = movies.filter(movie => movie.thumbnail);
      
      if (moviesWithThumbnails.length === 0) {
        console.log(`🖼️ Step 4: Skipping image download for chunk ${chunk + 1} - No movies with thumbnails`);
      } else {
        // Check which images already exist locally to avoid unnecessary downloads
        const chunkDir = path.join(process.cwd(), 'public', 'data', 'img-source', `chunk${chunk + 1}`);
        const existingImages = new Set();
        const manualDownloadFiles = new Set();
        
        if (fs.existsSync(chunkDir)) {
          const files = fs.readdirSync(chunkDir);
          files.forEach(file => {
            const ext = path.extname(file).toLowerCase();
            if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
              existingImages.add(file);
            } else if (ext === '.txt') {
              // Add the corresponding image filename (without .txt extension)
              const imageFilename = file.replace('.txt', '');
              manualDownloadFiles.add(imageFilename);
            }
          });
        }
        
        // Filter movies to only download missing images
        const moviesNeedingImages = moviesWithThumbnails.filter(movie => {
          const localImageUrl = generateLocalImageUrl(movie.id, movie.title, movie.thumbnail, chunk + 1, movie.info);
          if (!localImageUrl) return false;
          
          const filename = path.basename(localImageUrl);
          // Skip if image exists OR if manual download file exists (404 error)
          return !existingImages.has(filename) && !manualDownloadFiles.has(filename);
        });
        
        if (moviesNeedingImages.length === 0) {
          console.log(`🖼️ Step 4: Skipping image download for chunk ${chunk + 1} - All images already exist locally or have manual download files`);
        } else {
          console.log(`🖼️ Step 4: Downloading ${moviesNeedingImages.length} missing images for chunk ${chunk + 1} to public/data/img-source/chunk${chunk + 1}/...`);
          console.log(`   - Total movies with thumbnails: ${moviesWithThumbnails.length}`);
          console.log(`   - Images already exist: ${existingImages.size}`);
          console.log(`   - Manual download files (404 errors): ${manualDownloadFiles.size}`);
          console.log(`   - Images to download: ${moviesNeedingImages.length}`);
          
          const imageResult = await downloadImagesForMovies(moviesNeedingImages, dbPath, chunk + 1);
          
          if (imageResult.success) {
            totalImagesDownloaded += imageResult.stats.downloaded;
            totalImagesSkipped += imageResult.stats.skipped;
            totalImagesFailed += imageResult.stats.failed;
            totalManualDownloads += imageResult.stats.manualDownloads || 0;
            console.log(`✅ Chunk ${chunk + 1} images completed:`);
            console.log(`   - Downloaded: ${imageResult.stats.downloaded}`);
            console.log(`   - Skipped (exists): ${imageResult.stats.skipped}`);
            console.log(`   - Failed: ${imageResult.stats.failed}`);
            if (imageResult.stats.manualDownloads > 0) {
              console.log(`   - Manual downloads: ${imageResult.stats.manualDownloads} (text files created)`);
            }
          } else {
            console.error(`❌ Chunk ${chunk + 1} image download failed:`, imageResult.error);
          }
        }
      }
      
      // Step 5: Show chunk summary
      console.log(`\n📊 Chunk ${chunk + 1} Summary:`);
      console.log(`   - Database: ${movies.length} movies fetched`);
      console.log(`   - JSON: ${processedMovies.length} movies exported with local URLs`);
      if (moviesWithThumbnails.length > 0) {
        if (moviesNeedingImages && moviesNeedingImages.length === 0) {
          const existingCount = existingImages ? existingImages.size : 0;
          const manualCount = manualDownloadFiles ? manualDownloadFiles.size : 0;
          console.log(`   - Images: All ${moviesWithThumbnails.length} images handled (${existingCount} exist, ${manualCount} manual downloads)`);
        } else if (moviesNeedingImages && moviesNeedingImages.length > 0) {
          console.log(`   - Images: ${imageResult && imageResult.success ? imageResult.stats.downloaded : 0} downloaded to public/data/img-source/chunk${chunk + 1}/`);
        } else {
          console.log(`   - Images: ${moviesWithThumbnails.length} with thumbnails, processing...`);
        }
      } else {
        console.log(`   - Images: Skipped (no thumbnails)`);
      }
      console.log(`   - Progress: ${chunk + 1}/${totalChunks} chunks completed`);
      
      // Add a small delay between chunks (except for the last one)
      if (chunk < totalChunks - 1) {
        console.log('\n⏳ Waiting before next chunk...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('JSON EXPORT COMPLETED');
    console.log('='.repeat(60));
    
    // 2. Export movies lookup by ID
    console.log('\n📋 Creating movies lookup by ID...');
    const movieIds = await runQuery('SELECT id FROM movies');
    const moviesLookup = {};
    
    // Create a map of movie IDs to their chunk file
    movieIds.forEach((movie, index) => {
      const chunkIndex = Math.floor(index / moviesPerFile);
      if (!moviesLookup[chunkIndex]) {
        moviesLookup[chunkIndex] = [];
      }
      moviesLookup[chunkIndex].push(movie.id);
    });
    
    fs.writeFileSync(
      path.join(JSON_OUTPUT_DIR, 'movies_lookup.json'), 
      JSON.stringify(moviesLookup)
    );
    console.log('✅ Movies lookup exported');
    
    // 3. Export filters data
    console.log('\n🔍 Exporting filters data...');
    
    // Years
    const years = await runQuery(`
      SELECT DISTINCT json_extract(info, '$[0].release_year') as year 
      FROM movies 
      WHERE json_extract(info, '$[0].release_year') IS NOT NULL
      ORDER BY year DESC
    `);
    
    // Qualities
    const qualities = await runQuery(`
      SELECT DISTINCT json_extract(info, '$[0].quality') as quality 
      FROM movies 
      WHERE json_extract(info, '$[0].quality') IS NOT NULL
      ORDER BY quality
    `);
    
    // Languages
    const languages = await runQuery(`
      SELECT DISTINCT json_extract(info, '$[0].language') as language 
      FROM movies 
      WHERE json_extract(info, '$[0].language') IS NOT NULL
      ORDER BY language
    `);
    
    const filters = {
      years: years.map(y => y.year).filter(Boolean),
      qualities: qualities.map(q => q.quality).filter(Boolean),
      languages: languages.map(l => l.language).filter(Boolean)
    };
    
    fs.writeFileSync(
      path.join(JSON_OUTPUT_DIR, 'filters.json'), 
      JSON.stringify(filters)
    );
    console.log('✅ Filters data exported');
    
    // 4. Export categories
    console.log('\n📂 Exporting categories data...');
    
    // Get all unique category types
    const categoryTypes = await runQuery(`
      SELECT DISTINCT type FROM categories
    `);
    
    const categories = {
      timestamp: new Date().toISOString(),
      totalCategories: 0,
      categories: {}
    };
    
    // Process each category type
    for (const { type } of categoryTypes) {
      const categoriesOfType = await runQuery(`
        SELECT * FROM categories WHERE type = ?
      `, [type]);
      
      if (categoriesOfType.length > 0) {
        // Each type should have only one row with multiple slugs
        const categoryData = categoriesOfType[0];
        
        // Parse slugs from JSON string
        let slugs = [];
        try {
          slugs = JSON.parse(categoryData.slugs || '[]');
          console.log(`Successfully parsed ${slugs.length} slugs for type: ${type}`);
        } catch (error) {
          console.error(`Error parsing slugs for type ${type}:`, error.message);
          console.log('Raw slugs value:', categoryData.slugs);
          slugs = [];
        }
        
        categories.categories[type] = {
          title: categoryData.title || `${type.charAt(0).toUpperCase() + type.slice(1)}`,
          description: categoryData.description || `${type.charAt(0).toUpperCase() + type.slice(1)} categories`,
          slugs: slugs
        };
        
        categories.totalCategories += slugs.length;
      }
    }
    
    // Add stats for categories
    categories.stats = {
      total: Object.values(categories.categories).reduce(
        (sum, category) => sum + category.slugs.length, 0
      ),
      byType: {}
    };
    
    // Populate byType stats
    Object.entries(categories.categories).forEach(([type, data]) => {
      categories.stats.byType[type] = {
        total: data.slugs.length
      };
    });
    
    fs.writeFileSync(
      path.join(JSON_OUTPUT_DIR, 'categories.json'), 
      JSON.stringify(categories, null, 2)
    );
    console.log('✅ Categories data exported');
    
    // 5. Export stats
    console.log('\n📊 Exporting stats data...');
    
    const moviesCount = await runQuery('SELECT COUNT(*) as count FROM movies');
    const seriesCount = await runQuery(`
      SELECT COUNT(*) as count FROM movies 
      WHERE json_extract(info, '$[0].movie_or_series') = 'series'
    `);
    const movieCount = await runQuery(`
      SELECT COUNT(*) as count FROM movies 
      WHERE json_extract(info, '$[0].movie_or_series') = 'movie'
    `);
    
    const stats = {
      totalMovies: moviesCount[0].count,
      totalSeries: seriesCount[0].count,
      totalMoviesOnly: movieCount[0].count,
      lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync(
      path.join(JSON_OUTPUT_DIR, 'stats.json'), 
      JSON.stringify(stats)
    );
    console.log('✅ Stats data exported');
    
    // Create a manifest file
    const manifest = {
      totalFiles: totalChunks + 4, // movies chunks + lookup + filters + categories + stats
      moviesChunks: totalChunks,
      moviesPerChunk: moviesPerFile,
      totalMovies: totalMovies,
      generatedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(
      path.join(JSON_OUTPUT_DIR, 'manifest.json'), 
      JSON.stringify(manifest)
    );
    
    console.log('\n' + '='.repeat(60));
    console.log('EXPORT COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log(`📁 All data exported to: ${JSON_OUTPUT_DIR}`);
    console.log(`🖼️ All images downloaded to: public/data/img-source/ (organized by chunks)`);
    
    // Print final image download summary
    console.log('\n' + '='.repeat(60));
    console.log('FINAL IMAGE DOWNLOAD SUMMARY');
    console.log('='.repeat(60));
    if (totalMoviesWithThumbnails > 0) {
      console.log(`Total images downloaded: ${totalImagesDownloaded}`);
      console.log(`Total images skipped (already exist): ${totalImagesSkipped}`);
      console.log(`Total images failed: ${totalImagesFailed}`);
      if (totalManualDownloads > 0) {
        console.log(`Total manual downloads: ${totalManualDownloads} (text files created)`);
      }
      console.log(`Images saved to: public/data/img-source/ (chunk1, chunk2, etc.)`);
      console.log(`JSON files contain local image URLs: /data/img-source/chunkX/[title].[ext]`);
      if (totalManualDownloads > 0) {
        console.log(`\n📝 Manual Download Instructions:`);
        console.log(`- Text files have been created for failed downloads (404 errors)`);
        console.log(`- Check each chunk folder for .txt files`);
        console.log(`- Follow instructions in text files to manually download images`);
        console.log(`- Delete text files after successful manual download`);
      }
    } else {
      console.log(`No movies with thumbnails found - Image download process skipped entirely`);
      console.log(`JSON files contain local image URLs: /data/img-source/chunkX/[title].[ext]`);
      console.log(`Images will be downloaded when new movies with thumbnails are added`);
    }
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('Error exporting data:', error);
  } finally {
    // Close the database connection
    db.close();
  }
}

// Run the export
exportData(); 