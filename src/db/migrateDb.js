const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const config = require("../utils/config");

// Source database path
const sourceDbPath = config.db.path;

// Create target database path
const dbDir = config.paths.db;
const targetDbPath = path.join(dbDir, "migration.db");

console.log(`Source DB: ${sourceDbPath}`);
console.log(`Target DB: ${targetDbPath}`);

// Make sure the db directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Delete target database file if it exists
if (fs.existsSync(targetDbPath)) {
  console.log(`Removing existing target database: ${targetDbPath}`);
  fs.unlinkSync(targetDbPath);
}

// Connect to source and target databases
const sourceDb = new sqlite3.Database(sourceDbPath, sqlite3.OPEN_READONLY, err => {
  if (err) {
    console.error('Error opening source database:', err);
    process.exit(1);
  }
  console.log('Connected to source database');
});

const targetDb = new sqlite3.Database(targetDbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, err => {
  if (err) {
    console.error('Error opening target database:', err);
    process.exit(1);
  }
  console.log('Connected to target database');
});

// Run a query and return a promise
function runQuery(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// Get all rows and return a promise
function getAllRows(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// Check if a table exists
function tableExists(db, tableName) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      [tableName],
      (err, row) => {
        if (err) return reject(err);
        resolve(!!row);
      }
    );
  });
}

// Function to migrate the database
async function migrateDatabase() {
  try {
    // Start transaction
    await runQuery(targetDb, "BEGIN TRANSACTION");
    
    // Create tables
    await runQuery(targetDb, `CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT UNIQUE NOT NULL,
      thumbnail TEXT,
      date TEXT,
      info TEXT,
      tags TEXT DEFAULT '[]',
      created_at TEXT,
      updated_at TEXT
    )`);
    
    await runQuery(targetDb, `CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movie_id INTEGER,
      heading TEXT,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (movie_id) REFERENCES movies(id)
    )`);
    
    // Create categories table if it exists in source
    const hasCategoriesTable = await tableExists(sourceDb, 'categories');
    if (hasCategoriesTable) {
      await runQuery(targetDb, `CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        slugs TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
      
      // Get categories from source
      const categories = await getAllRows(sourceDb, "SELECT * FROM categories");
      if (categories.length > 0) {
        // Insert categories with prepared statement
        const stmt = targetDb.prepare(`
          INSERT INTO categories (type, title, description, slugs, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        for (const category of categories) {
          stmt.run(
            category.type,
            category.title,
            category.description,
            category.slugs,
            category.created_at || new Date().toISOString(),
            category.updated_at || new Date().toISOString()
          );
        }
        
        stmt.finalize();
        console.log(`Migrated ${categories.length} categories`);
      }
    }
    
    // Get all movies
    const movies = await getAllRows(sourceDb, "SELECT * FROM movies");
    console.log(`Found ${movies.length} movies to migrate`);
    
    // Prepare statement for movies
    const movieStmt = targetDb.prepare(`
      INSERT INTO movies (title, url, thumbnail, date, info, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    let migratedCount = 0;
    let errorCount = 0;
    let processedCount = 0;
    
    // Process movies in batches to avoid memory issues
    const batchSize = 100;
    const totalBatches = Math.ceil(movies.length / batchSize);
    
    for (let batch = 0; batch < totalBatches; batch++) {
      const start = batch * batchSize;
      const end = Math.min(start + batchSize, movies.length);
      const batchMovies = movies.slice(start, end);
      
      console.log(`Processing batch ${batch + 1}/${totalBatches} (${start}-${end} of ${movies.length})`);
      
      for (const movie of batchMovies) {
        try {
          // Parse info JSON and add section IDs
          let infoObj = JSON.parse(movie.info || "[]");
          
          if (infoObj.length > 0 && infoObj[0].sections && infoObj[0].sections.length > 0) {
            // Add ID to each section
            infoObj[0].sections.forEach(section => {
              // Generate a unique ID based on timestamp + random number
              section.id = (Date.now() + Math.floor(Math.random() * 1000)).toString();
            });
          }
          
          // Stringify the modified info
          const updatedInfo = JSON.stringify(infoObj);
          
          // Insert movie
          movieStmt.run(
            movie.title,
            movie.url,
            movie.thumbnail,
            movie.date,
            updatedInfo,
            movie.tags,
            movie.created_at || new Date().toISOString(),
            movie.updated_at || new Date().toISOString()
          );
          
          migratedCount++;
        } catch (error) {
          console.error(`Error migrating movie ${movie.id} (${movie.title}):`, error);
          errorCount++;
        }
        
        processedCount++;
        if (processedCount % 500 === 0) {
          console.log(`Processed ${processedCount}/${movies.length} movies...`);
        }
      }
    }
    
    movieStmt.finalize();
    console.log(`Finished migrating movies: ${migratedCount} successful, ${errorCount} errors`);
    
    // Check and migrate sections table if it exists
    const hasSectionsTable = await tableExists(sourceDb, 'sections');
    if (hasSectionsTable) {
      const sections = await getAllRows(sourceDb, "SELECT * FROM sections");
      
      if (sections.length > 0) {
        const sectionStmt = targetDb.prepare(`
          INSERT INTO sections (movie_id, heading, created_at, updated_at)
          VALUES (?, ?, ?, ?)
        `);
        
        for (const section of sections) {
          sectionStmt.run(
            section.movie_id,
            section.heading,
            section.created_at || new Date().toISOString(),
            section.updated_at || new Date().toISOString()
          );
        }
        
        sectionStmt.finalize();
        console.log(`Migrated ${sections.length} sections`);
      }
    }
    
    // Commit transaction
    await runQuery(targetDb, "COMMIT");
    console.log("Migration completed successfully");
    
    return { migratedCount, errorCount };
  } catch (error) {
    console.error("Migration failed:", error);
    await runQuery(targetDb, "ROLLBACK").catch(() => {});
    throw error;
  }
}

// Run the migration
migrateDatabase()
  .then(result => {
    console.log("Migration complete!", result);
    // Close database connections
    sourceDb.close();
    targetDb.close();
  })
  .catch(error => {
    console.error("Migration failed with error:", error);
    // Close database connections
    sourceDb.close();
    targetDb.close();
    process.exit(1);
  }); 