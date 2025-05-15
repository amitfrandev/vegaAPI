const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const config = require('../utils/config');

// Path to backup database
const BACKUP_DB_PATH = path.join(__dirname, '../../backup-db/movies.db');
// Path to new database
const NEW_DB_PATH = path.join(__dirname, '../../output/db/movies.db');

// Function to extract tags from movie info
function extractTagsFromInfo(info) {
  // Always return an empty array if no info
  if (!info || !info[0]) return [];
  
  const movieInfo = info[0];
  
  // If movieInfo.tags exists and is an array, use it
  if (Array.isArray(movieInfo.tags)) {
    return [...new Set(movieInfo.tags)];
  }
  
  // If movieInfo.tags exists but isn't an array, try to parse it
  if (movieInfo.tags) {
    try {
      const parsedTags = JSON.parse(movieInfo.tags);
      if (Array.isArray(parsedTags)) {
        return [...new Set(parsedTags)];
      }
    } catch (e) {
      console.error('Error parsing tags:', e.message);
    }
  }
  
  // Return empty array as fallback
  return [];
}

// Function to clean thumbnail path by removing domain
function cleanThumbnailPath(thumbnail) {
  if (!thumbnail) return null;
  
  // If it's already a relative path (starts with wp-content), return as is
  if (thumbnail.startsWith('wp-content/')) {
    return thumbnail;
  }
  
  try {
    // If it's a full URL, extract the path after the domain
    const url = new URL(thumbnail);
    const path = url.pathname;
    // Remove leading slash if present
    return path.startsWith('/') ? path.substring(1) : path;
  } catch (e) {
    // If URL parsing fails, return the original thumbnail
    console.log(`Warning: Could not parse thumbnail URL: ${thumbnail}`);
    return thumbnail;
  }
}

// Initialize databases and migrate
async function migrate() {
  console.log('=== Database Migration Tool ===');
  
  // Check if backup database exists
  if (!fs.existsSync(BACKUP_DB_PATH)) {
    console.error(`Error: Backup database not found at ${BACKUP_DB_PATH}`);
    process.exit(1);
  }
  
  // Check if output directory exists, create if not
  const outputDir = path.dirname(NEW_DB_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  }
  
  // Connect to databases
  const backupDb = new sqlite3.Database(BACKUP_DB_PATH, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
      console.error('Error connecting to backup database:', err.message);
      process.exit(1);
    }
    console.log(`Connected to backup database at ${BACKUP_DB_PATH}`);
  });
  
  const newDb = new sqlite3.Database(NEW_DB_PATH, (err) => {
    if (err) {
      console.error('Error connecting to new database:', err.message);
      process.exit(1);
    }
    console.log(`Connected to new database at ${NEW_DB_PATH}`);
  });
  
  try {
    // Initialize new database schema
    await initializeNewDb(newDb);
    
    // Get total movies count
    const totalMovies = await getTotalMovieCount(backupDb);
    console.log(`Found ${totalMovies} movies in backup database`);
    
    // Process movies in batches
    const batchSize = 100;
    let processed = 0;
    let migrated = 0;
    
    console.log(`Migrating data in batches of ${batchSize} movies...`);
    
    for (let offset = 0; offset < totalMovies; offset += batchSize) {
      const movies = await getMovieBatch(backupDb, batchSize, offset);
      
      for (const movie of movies) {
        try {
          // Generate tags from movie info
          let info;
          try {
            info = JSON.parse(movie.info);
          } catch (e) {
            console.error(`Error parsing info for movie ${movie.id}: ${e.message}`);
            info = [];
          }
          
          const tags = extractTagsFromInfo(info);
          
          // Save movie to new database
          await saveMovie(newDb, {
            ...movie,
            info: info,
            tags: tags
          });
          
          migrated++;
        } catch (error) {
          console.error(`Error migrating movie ${movie.id}: ${error.message}`);
        }
      }
      
      processed += movies.length;
      console.log(`Processed ${processed}/${totalMovies} movies, Migrated: ${migrated}`);
    }
    
    console.log('\n=== Migration Complete ===');
    console.log(`Total movies processed: ${processed}`);
    console.log(`Successfully migrated: ${migrated}`);
    
  } catch (error) {
    console.error('Migration error:', error.message);
  } finally {
    // Close database connections
    await closeDatabase(backupDb);
    await closeDatabase(newDb);
  }
}

// Initialize the new database schema
function initializeNewDb(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Create movies table if it doesn't exist
      db.run(`CREATE TABLE IF NOT EXISTS movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        url TEXT UNIQUE NOT NULL,
        thumbnail TEXT,
        date TEXT,
        info TEXT,
        tags TEXT DEFAULT '[]',
        created_at TEXT,
        updated_at TEXT
      )`, (err) => {
        if (err) return reject(err);
        
        // Create sections table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS sections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          movie_id INTEGER,
          heading TEXT,
          created_at TEXT,
          updated_at TEXT,
          FOREIGN KEY (movie_id) REFERENCES movies(id)
        )`, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  });
}

// Get total number of movies in the database
function getTotalMovieCount(db) {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM movies', (err, row) => {
      if (err) return reject(err);
      resolve(row.count);
    });
  });
}

// Get a batch of movies
function getMovieBatch(db, limit, offset) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM movies LIMIT ? OFFSET ?`, [limit, offset], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// Save movie to the new database
function saveMovie(db, movie) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    
    // Ensure tags is always an array
    const tags = Array.isArray(movie.tags) ? movie.tags : [];
    
    // Convert info and tags to JSON strings
    const infoJson = JSON.stringify(movie.info || []);
    const tagsJson = JSON.stringify(tags);
    
    // Clean thumbnail path by removing domain
    const thumbnail = cleanThumbnailPath(movie.thumbnail);
    
    const insertQuery = `
      INSERT INTO movies (
        id, title, url, thumbnail, date, info, tags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const insertParams = [
      movie.id, // Preserve original ID
      movie.title,
      movie.url,
      thumbnail,
      movie.date || null,
      infoJson,
      tagsJson,
      movie.created_at || now,
      now
    ];
    
    db.run(insertQuery, insertParams, function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          console.log(`Movie already exists in new database: ${movie.title}`);
          return resolve(movie.id);
        }
        return reject(err);
      }
      
      console.log(`Migrated movie: ${movie.title} [ID: ${movie.id}]`);
      
      // If there are sections in the movie info, migrate them too
      if (movie.info && movie.info[0] && movie.info[0].sections) {
        const sections = movie.info[0].sections;
        const sectionPromises = sections.map(section => {
          return new Promise((resolveSection, rejectSection) => {
            const sectionQuery = `
              INSERT INTO sections (
                movie_id, heading, created_at, updated_at
              ) VALUES (?, ?, ?, ?)
            `;
            
            const sectionParams = [
              movie.id,
              section.heading || null,
              now,
              now
            ];
            
            db.run(sectionQuery, sectionParams, function(err) {
              if (err) {
                return rejectSection(err);
              }
              resolveSection();
            });
          });
        });
        
        Promise.all(sectionPromises)
          .then(() => resolve(movie.id))
          .catch(reject);
      } else {
        resolve(movie.id);
      }
    });
  });
}

// Close database connection
function closeDatabase(db) {
  return new Promise((resolve, reject) => {
    db.close(err => {
      if (err) {
        console.error('Error closing database:', err.message);
        return reject(err);
      }
      console.log('Database connection closed');
      resolve();
    });
  });
}

// Run the migration
migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
}); 