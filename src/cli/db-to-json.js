/**
 * Database to JSON exporter
 * This script exports SQLite data to JSON files for serverless deployment
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const config = require('../utils/config');

// Import image downloader
const { downloadImagesForMovies } = require('../scripts/image-downloader');

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
    
    // Track total images downloaded across all chunks
    let totalImagesDownloaded = 0;
    let totalImagesSkipped = 0;
    let totalImagesFailed = 0;
    
    console.log(`Processing ${totalChunks} chunks of ${moviesPerFile} movies each...`);
    console.log('='.repeat(60));
    
    for (let chunk = 0; chunk < totalChunks; chunk++) {
      const offset = chunk * moviesPerFile;
      console.log(`\n📦 CHUNK ${chunk + 1}/${totalChunks} (Movies ${offset + 1}-${Math.min(offset + moviesPerFile, totalMovies)})`);
      console.log('='.repeat(60));
      
      // Step 1: Fetch movies for this chunk
      console.log(`📋 Fetching movies for chunk ${chunk + 1}...`);
      const movies = await runQuery(
        `SELECT id, title, url, thumbnail, date, info, tags 
         FROM movies 
         ORDER BY id 
         LIMIT ? OFFSET ?`, 
        [moviesPerFile, offset]
      );
      
      console.log(`✓ Fetched ${movies.length} movies from database`);
      
      // Step 2: Process and export JSON data for this chunk
      console.log(`📄 Processing JSON data for chunk ${chunk + 1}...`);
      const processedMovies = movies.map(movie => ({
        id: movie.id,
        title: movie.title,
        url: movie.url,
        thumbnail: movie.thumbnail,
        date: movie.date,
        info: JSON.parse(movie.info || '[]'),
        tags: JSON.parse(movie.tags || '[]')
      }));
      
      // Write JSON file for this chunk
      const outputFile = path.join(JSON_OUTPUT_DIR, `movies_${chunk}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(processedMovies));
      console.log(`✅ Exported ${processedMovies.length} movies to ${outputFile}`);
      
      // Step 3: Download images for this specific chunk immediately
      console.log(`🖼️ Downloading images for chunk ${chunk + 1}...`);
      const imageResult = await downloadImagesForMovies(movies, dbPath);
      
      if (imageResult.success) {
        totalImagesDownloaded += imageResult.stats.downloaded;
        totalImagesSkipped += imageResult.stats.skipped;
        totalImagesFailed += imageResult.stats.failed;
        console.log(`✅ Chunk ${chunk + 1} images completed:`);
        console.log(`   - Downloaded: ${imageResult.stats.downloaded}`);
        console.log(`   - Skipped (exists): ${imageResult.stats.skipped}`);
        console.log(`   - Failed: ${imageResult.stats.failed}`);
      } else {
        console.error(`❌ Chunk ${chunk + 1} image download failed:`, imageResult.error);
      }
      
      // Step 4: Show chunk summary
      console.log(`\n📊 Chunk ${chunk + 1} Summary:`);
      console.log(`   - JSON: ${processedMovies.length} movies exported`);
      console.log(`   - Images: ${imageResult.success ? imageResult.stats.downloaded : 0} downloaded`);
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
    
    // Print final image download summary
    console.log('\n' + '='.repeat(60));
    console.log('FINAL IMAGE DOWNLOAD SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total images downloaded: ${totalImagesDownloaded}`);
    console.log(`Total images skipped (already exist): ${totalImagesSkipped}`);
    console.log(`Total images failed: ${totalImagesFailed}`);
    console.log(`Images saved to: api/img-source/`);
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