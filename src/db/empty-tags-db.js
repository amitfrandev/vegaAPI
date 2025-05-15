const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const config = require('../utils/config');
const db = require('./db');

// Create output/db directory if it doesn't exist
const dbDir = config.paths.db;
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database connection
const dbConnection = new sqlite3.Database(config.db.emptyTagsPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err);
  } else {
    console.log(`Connected to SQLite database at ${config.db.emptyTagsPath}`);
  }
});

// Initialize database tables
async function initializeDatabase() {
  return new Promise((resolve, reject) => {
    dbConnection.serialize(() => {
      // Create movies table with tags array
      dbConnection.run(`CREATE TABLE IF NOT EXISTS movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        url TEXT UNIQUE,
        thumbnail TEXT,
        date TEXT,
        info TEXT,
        tags TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) {
          console.error('Error creating movies table:', err);
          reject(err);
        } else {
          console.log('Movies table initialized');
        }
      });

      // Create sections table
      dbConnection.run(`CREATE TABLE IF NOT EXISTS sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        movie_id INTEGER NOT NULL,
        heading TEXT NOT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        FOREIGN KEY (movie_id) REFERENCES movies (id) ON DELETE CASCADE
      )`, (err) => {
        if (err) {
          console.error('Error creating sections table:', err);
          reject(err);
        } else {
          console.log('Sections table initialized');
          resolve();
        }
      });
    });
  });
}

// Helper function to extract language tags from info
function extractLanguageTags(info) {
  try {
    const movieInfo = JSON.parse(info);
    if (Array.isArray(movieInfo) && movieInfo.length > 0) {
      const info = movieInfo[0];
      const tags = [];
      
      // Add language tags
      if (info.language) {
        const languageStr = info.language.toLowerCase();
        if (languageStr.includes('english')) {
          tags.push('english');
        }
        if (languageStr.includes('hindi')) {
          tags.push('hindi');
        }
        if (languageStr.includes('dual audio')) {
          tags.push('dual audio');
        }
      }
      
      // Add type tag (movie/series)
      if (info.movie_or_series) {
        tags.push(info.movie_or_series.toLowerCase());
      }
      
      // Add year tag
      if (info.release_year) {
        tags.push(info.release_year);
      }
      
      return tags;
    }
  } catch (error) {
    console.error('Error parsing movie info for tags:', error);
  }
  return [];
}

// Migrate data from old database with language-based tags
async function migrateWithEmptyTags(oldDbPath) {
  return new Promise((resolve, reject) => {
    const oldDb = new sqlite3.Database(oldDbPath);
    
    dbConnection.serialize(() => {
      dbConnection.run('BEGIN TRANSACTION');
      
      // Copy movies with language-based tags
      oldDb.all('SELECT * FROM movies', [], (err, movies) => {
        if (err) {
          dbConnection.run('ROLLBACK');
          return reject(err);
        }
        
        const stmt = dbConnection.prepare(`
          INSERT OR IGNORE INTO movies (
            id, title, url, thumbnail, date, info, tags, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        movies.forEach(movie => {
          // Extract tags based on language and other info
          const tags = extractLanguageTags(movie.info);
          const tagsJson = JSON.stringify(tags);
          
          stmt.run([
            movie.id,
            movie.title,
            movie.url,
            movie.thumbnail,
            movie.date,
            movie.info,
            tagsJson, // Add language-based tags
            movie.created_at,
            movie.updated_at
          ]);
        });
        
        stmt.finalize();
        
        // Copy sections
        oldDb.all('SELECT * FROM sections', [], (err, sections) => {
          if (err) {
            dbConnection.run('ROLLBACK');
            return reject(err);
          }
          
          const stmt = dbConnection.prepare(`
            INSERT OR IGNORE INTO sections (
              id, movie_id, heading, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?)
          `);
          
          sections.forEach(section => {
            stmt.run([
              section.id,
              section.movie_id,
              section.heading,
              section.created_at,
              section.updated_at
            ]);
          });
          
          stmt.finalize();
          dbConnection.run('COMMIT');
          oldDb.close();
          resolve();
        });
      });
    });
  });
}

// Get all movies with pagination
async function getAllMovies(page = 1, limit = 20, filters = {}) {
  return new Promise((resolve, reject) => {
    const offset = (page - 1) * limit;
    let whereConditions = [];
    let queryParams = [];
    
    // Apply filters
    if (filters.year) {
      whereConditions.push("json_extract(info, '$[0].release_year') = ?");
      queryParams.push(filters.year);
    }
    
    if (filters.language) {
      whereConditions.push("json_extract(info, '$[0].language') = ?");
      queryParams.push(filters.language);
    }
    
    if (filters.quality) {
      whereConditions.push("json_extract(info, '$[0].quality') = ?");
      queryParams.push(filters.quality);
    }
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';
    
    const query = `
      SELECT id, title, url, thumbnail, date, info, tags
      FROM movies 
      ${whereClause}
      ORDER BY date DESC
      LIMIT ? OFFSET ?
    `;
    
    const countQuery = `
      SELECT COUNT(*) as total
      FROM movies
      ${whereClause}
    `;
    
    dbConnection.get(countQuery, queryParams, (err, countRow) => {
      if (err) {
        console.error('Error counting movies:', err.message);
        return reject(err);
      }
      
      const totalMovies = countRow.total;
      const totalPages = Math.ceil(totalMovies / limit);
      const paginatedParams = [...queryParams, limit, offset];
      
      dbConnection.all(query, paginatedParams, (err, rows) => {
        if (err) {
          console.error('Error getting movies:', err.message);
          return reject(err);
        }
        
        const movies = rows.map(row => ({
          id: row.id,
          title: row.title,
          url: row.url,
          thumbnail: row.thumbnail,
          date: row.date,
          info: JSON.parse(row.info),
          tags: JSON.parse(row.tags)
        }));
        
        resolve({
          movies,
          page,
          limit,
          totalItems: totalMovies,
          totalPages
        });
      });
    });
  });
}

// Update tags for a movie
async function updateMovieTags(movieId, tags) {
  return new Promise((resolve, reject) => {
    const tagsJson = JSON.stringify(tags);
    const now = new Date().toISOString();
    
    dbConnection.run(
      `UPDATE movies SET tags = ?, updated_at = ? WHERE id = ?`,
      [tagsJson, now, movieId],
      function(err) {
        if (err) {
          console.error('Error updating movie tags:', err.message);
          return reject(err);
        }
        resolve(this.changes > 0);
      }
    );
  });
}

// Close database connection
function closeDatabase() {
  return new Promise((resolve, reject) => {
    dbConnection.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
        reject(err);
      } else {
        console.log('Database connection closed');
        resolve();
      }
    });
  });
}

async function emptyAllTags() {
  console.log('\n=== Emptying All Tags in Database ===');
  
  try {
    // Initialize the database
    await initializeDatabase();
    console.log('Database initialized successfully');
    
    // Get database connection
    const database = dbConnection;
    
    // Count total movies before update
    const totalMovies = await new Promise((resolve, reject) => {
      database.get('SELECT COUNT(*) as count FROM movies', (err, row) => {
        if (err) {
          console.error('Error counting movies:', err.message);
          return reject(err);
        }
        resolve(row.count);
      });
    });
    
    console.log(`Found ${totalMovies} movies in database`);
    
    // Update all movies to have empty tags
    const result = await new Promise((resolve, reject) => {
      database.run(
        'UPDATE movies SET tags = ?',
        ['[]'],
        function(err) {
          if (err) {
            console.error('Error updating tags:', err);
            return reject(err);
          }
          
          resolve(this.changes);
        }
      );
    });
    
    console.log(`\n=== Tag Update Complete ===`);
    console.log(`Updated ${result} movies with empty tags`);
    
    // Get the database status after update
    const stats = await getAllMovies();
    console.log('\n=== Current Database Status ===');
    console.log(`Total Movies in Database: ${stats.totalItems}`);
    
    return { success: true, updatedCount: result };
  } catch (error) {
    console.error('Error emptying tags:', error);
    return { success: false, error: error.message };
  } finally {
    // Close database connection
    await closeDatabase();
  }
}

// Run the function if this script is executed directly
if (require.main === module) {
  emptyAllTags()
    .then(result => {
      if (result.success) {
        console.log('Tags successfully emptied');
        process.exit(0);
      } else {
        console.error('Failed to empty tags:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
} else {
  // Export the function if the script is required as a module
  module.exports = { emptyAllTags };
} 