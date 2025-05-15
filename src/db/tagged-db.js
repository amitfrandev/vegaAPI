const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const config = require('../utils/config');

// Create output/db directory if it doesn't exist
const dbDir = config.paths.db;
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database connection
const db = new sqlite3.Database(config.db.taggedMoviesPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err);
  } else {
    console.log(`Connected to SQLite database at ${config.db.taggedMoviesPath}`);
  }
});

// Initialize database tables
async function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Create movies table (same as original)
      db.run(`CREATE TABLE IF NOT EXISTS movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        url TEXT UNIQUE,
        thumbnail TEXT,
        date TEXT,
        info TEXT,
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

      // Create sections table (same as original)
      db.run(`CREATE TABLE IF NOT EXISTS sections (
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
        }
      });

      // Create tags table
      db.run(`CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) {
          console.error('Error creating tags table:', err);
          reject(err);
        } else {
          console.log('Tags table initialized');
        }
      });

      // Create movie_tags junction table
      db.run(`CREATE TABLE IF NOT EXISTS movie_tags (
        movie_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (movie_id, tag_id),
        FOREIGN KEY (movie_id) REFERENCES movies (id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
      )`, (err) => {
        if (err) {
          console.error('Error creating movie_tags table:', err);
          reject(err);
        } else {
          console.log('Movie tags table initialized');
          resolve();
        }
      });
    });
  });
}

// Migrate data from old database
async function migrateFromOldDatabase(oldDbPath) {
  return new Promise((resolve, reject) => {
    const oldDb = new sqlite3.Database(oldDbPath);
    
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // Copy movies
      oldDb.all('SELECT * FROM movies', [], (err, movies) => {
        if (err) {
          db.run('ROLLBACK');
          return reject(err);
        }
        
        const stmt = db.prepare(`
          INSERT OR IGNORE INTO movies (id, title, url, thumbnail, date, info, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        movies.forEach(movie => {
          stmt.run([
            movie.id,
            movie.title,
            movie.url,
            movie.thumbnail,
            movie.date,
            movie.info,
            movie.created_at,
            movie.updated_at
          ]);
        });
        
        stmt.finalize();
        
        // Copy sections
        oldDb.all('SELECT * FROM sections', [], (err, sections) => {
          if (err) {
            db.run('ROLLBACK');
            return reject(err);
          }
          
          const stmt = db.prepare(`
            INSERT OR IGNORE INTO sections (id, movie_id, heading, created_at, updated_at)
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
          db.run('COMMIT');
          oldDb.close();
          resolve();
        });
      });
    });
  });
}

// Add a tag to a movie
async function addTagToMovie(movieId, tagName) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // First ensure tag exists
      db.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [tagName], function(err) {
        if (err) {
          db.run('ROLLBACK');
          return reject(err);
        }
        
        const tagId = this.lastID || null;
        
        if (!tagId) {
          // Tag already existed, get its ID
          db.get('SELECT id FROM tags WHERE name = ?', [tagName], (err, row) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }
            
            // Add movie-tag relationship
            db.run('INSERT OR IGNORE INTO movie_tags (movie_id, tag_id) VALUES (?, ?)',
              [movieId, row.id], (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                db.run('COMMIT');
                resolve();
              });
          });
        } else {
          // Add movie-tag relationship for new tag
          db.run('INSERT OR IGNORE INTO movie_tags (movie_id, tag_id) VALUES (?, ?)',
            [movieId, tagId], (err) => {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }
              db.run('COMMIT');
              resolve();
            });
        }
      });
    });
  });
}

// Get all tags for a movie
async function getMovieTags(movieId) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT t.name 
      FROM tags t
      JOIN movie_tags mt ON t.id = mt.tag_id
      WHERE mt.movie_id = ?
      ORDER BY t.name
    `, [movieId], (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(rows.map(row => row.name));
    });
  });
}

// Get all movies with a specific tag
async function getMoviesByTag(tagName, page = 1, limit = 20) {
  return new Promise((resolve, reject) => {
    const offset = (page - 1) * limit;
    
    db.get(`
      SELECT COUNT(*) as total
      FROM movies m
      JOIN movie_tags mt ON m.id = mt.movie_id
      JOIN tags t ON mt.tag_id = t.id
      WHERE t.name = ?
    `, [tagName], (err, countRow) => {
      if (err) {
        return reject(err);
      }
      
      const totalMovies = countRow.total;
      const totalPages = Math.ceil(totalMovies / limit);
      
      db.all(`
        SELECT m.*
        FROM movies m
        JOIN movie_tags mt ON m.id = mt.movie_id
        JOIN tags t ON mt.tag_id = t.id
        WHERE t.name = ?
        ORDER BY m.date DESC
        LIMIT ? OFFSET ?
      `, [tagName, limit, offset], (err, rows) => {
        if (err) {
          return reject(err);
        }
        
        const movies = rows.map(row => ({
          ...row,
          info: JSON.parse(row.info)
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

// Close the database connection
function closeDatabase() {
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

module.exports = {
  initializeDatabase,
  migrateFromOldDatabase,
  addTagToMovie,
  getMovieTags,
  getMoviesByTag,
  closeDatabase
}; 