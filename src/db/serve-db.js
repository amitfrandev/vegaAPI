const sqlite3 = require('sqlite3').verbose();

const config = require('../utils/config');

// Singleton database connection
let db = null;

// Get database connection
function getDatabase() {
  if (!db) {
    // Use environment variable if set, otherwise use config
    const dbPath = process.env.DB_PATH ? 
      require('path').join(process.cwd(), process.env.DB_PATH) : 
      config.db.path;
    
    console.log(`Using database path: ${dbPath}`);
    
    db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        console.error('Error connecting to database:', err);
        throw err;
      }
      console.log(`Connected to SQLite database at ${dbPath}`);
    });
  }
  return db;
}

// Get all movies with pagination
async function getAllMovies(page = 1, limit = 20, filters = {}) {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    const offset = (page - 1) * limit;
    let whereConditions = [];
    let queryParams = [];
    
    // Apply filters
    if (filters.id) {
      whereConditions.push("id = ?");
      queryParams.push(filters.id);
    }
    
    if (filters.url) {
      // Use exact URL matching instead of normalization
      whereConditions.push("url = ?");
      queryParams.push(filters.url);
    }
    
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
    
    if (filters.type && filters.type !== 'all') {
      whereConditions.push("json_extract(info, '$[0].movie_or_series') = ?");
      queryParams.push(filters.type);
    }
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';
    
    const sortClause = 'ORDER BY date DESC';
    
    const query = `
      SELECT id, title, url, thumbnail, date, info, tags
      FROM movies 
      ${whereClause}
      ${sortClause}
      LIMIT ? OFFSET ?
    `;
    
    const countQuery = `
      SELECT COUNT(*) as total
      FROM movies
      ${whereClause}
    `;
    
    database.get(countQuery, queryParams, (err, countRow) => {
      if (err) {
        console.error('Error counting movies:', err.message);
        return reject(err);
      }
      
      const totalMovies = countRow.total;
      const totalPages = Math.ceil(totalMovies / limit);
      const paginatedParams = [...queryParams, limit, offset];
      
      database.all(query, paginatedParams, (err, rows) => {
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
          tags: JSON.parse(row.tags || '[]')
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

// Search movies
async function searchMovies(query, page = 1, limit = 20, filters = {}) {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    const offset = (page - 1) * limit;
    let whereConditions = ["title LIKE ?"];
    let queryParams = [`%${query}%`];
    
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
    
    if (filters.type && filters.type !== 'all') {
      whereConditions.push("json_extract(info, '$[0].movie_or_series') = ?");
      queryParams.push(filters.type);
    }
    
    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
    const sortClause = 'ORDER BY date DESC';
    
    const query = `
      SELECT id, title, url, thumbnail, date, info, tags
      FROM movies 
      ${whereClause}
      ${sortClause}
      LIMIT ? OFFSET ?
    `;
    
    const countQuery = `
      SELECT COUNT(*) as total
      FROM movies
      ${whereClause}
    `;
    
    database.get(countQuery, queryParams, (err, countRow) => {
      if (err) {
        console.error('Error counting search results:', err.message);
        return reject(err);
      }
      
      const totalMovies = countRow.total;
      const totalPages = Math.ceil(totalMovies / limit);
      const paginatedParams = [...queryParams, limit, offset];
      
      database.all(query, paginatedParams, (err, rows) => {
        if (err) {
          console.error('Error searching movies:', err.message);
          return reject(err);
        }
        
        const movies = rows.map(row => ({
          id: row.id,
          title: row.title,
          url: row.url,
          thumbnail: row.thumbnail,
          date: row.date,
          info: JSON.parse(row.info),
          tags: JSON.parse(row.tags || '[]')
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

// Get movie by URL
async function getMovieByUrl(url) {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    // Use exact URL matching without normalization
    database.get(`SELECT * FROM movies WHERE url = ?`, [url], (err, movieRow) => {
      if (err) {
        console.error('Error getting movie by URL:', err.message);
        return reject(err);
      }
      
      if (!movieRow) {
        return resolve(null);
      }
      
      try {
        const movie = {
          id: movieRow.id,
          title: movieRow.title,
          url: movieRow.url,
          thumbnail: movieRow.thumbnail,
          date: movieRow.date,
          info: JSON.parse(movieRow.info),
          tags: JSON.parse(movieRow.tags || '[]'),
          created_at: movieRow.created_at,
          updated_at: movieRow.updated_at
        };
        resolve(movie);
      } catch (parseError) {
        console.error('Error parsing movie info:', parseError);
        reject(parseError);
      }
    });
  });
}

// Get available filters
async function getFilters() {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    const queries = {
      years: "SELECT DISTINCT json_extract(info, '$[0].release_year') AS value FROM movies WHERE json_extract(info, '$[0].release_year') IS NOT NULL ORDER BY value DESC",
      languages: "SELECT DISTINCT json_extract(info, '$[0].language') AS value FROM movies WHERE json_extract(info, '$[0].language') IS NOT NULL ORDER BY value",
      qualities: "SELECT DISTINCT json_extract(info, '$[0].quality') AS value FROM movies WHERE json_extract(info, '$[0].quality') IS NOT NULL ORDER BY value",
      types: "SELECT DISTINCT json_extract(info, '$[0].movie_or_series') AS value FROM movies WHERE json_extract(info, '$[0].movie_or_series') IS NOT NULL ORDER BY value"
    };
    
    const results = {};
    const promises = Object.entries(queries).map(([key, query]) => {
      return new Promise((resolve, reject) => {
        database.all(query, [], (err, rows) => {
          if (err) {
            console.error(`Error fetching ${key}:`, err);
            reject(err);
          } else {
            results[key] = rows.map(row => row.value).filter(Boolean);
            resolve();
          }
        });
      });
    });
    
    Promise.all(promises)
      .then(() => resolve(results))
      .catch(reject);
  });
}

// Get movie statistics
async function getMovieStats() {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    database.get(`SELECT COUNT(*) as totalMovies FROM movies`, [], (err, statsRow) => {
      if (err) {
        console.error('Error getting movie stats:', err.message);
        return reject(err);
      }
      
      database.all(`SELECT info FROM movies`, [], (err, rows) => {
        if (err) {
          console.error('Error getting movie info:', err.message);
          return reject(err);
        }
        
        let totalLinks = 0;
        let uniqueMovies = new Set();
        let uniqueSeries = new Set();
        let yearStats = {};
        
        rows.forEach(row => {
          try {
            const info = JSON.parse(row.info);
            if (Array.isArray(info) && info.length > 0) {
              const movieInfo = info[0];
              
              if (movieInfo.sections) {
                movieInfo.sections.forEach(section => {
                  if (section.links) {
                    totalLinks += section.links.length;
                  }
                });
              }
              
              if (movieInfo.movie_name) {
                uniqueMovies.add(movieInfo.movie_name);
              }
              if (movieInfo.series_name) {
                uniqueSeries.add(movieInfo.series_name);
              }
              
              if (movieInfo.release_year) {
                yearStats[movieInfo.release_year] = (yearStats[movieInfo.release_year] || 0) + 1;
              }
            }
          } catch (parseError) {
            console.error('Error parsing movie info:', parseError);
          }
        });
        
        const yearStatsArray = Object.entries(yearStats)
          .map(([year, count]) => ({ release_year: year, count }))
          .sort((a, b) => b.release_year - a.release_year);
        
        resolve({
          totalMovies: statsRow.totalMovies,
          uniqueMovies: uniqueMovies.size,
          uniqueSeries: uniqueSeries.size,
          totalLinks: totalLinks,
          yearStats: yearStatsArray
        });
      });
    });
  });
}

// Close database connection
async function closeDatabase() {
  if (!db) return;
  
  return new Promise((resolve, reject) => {
    db.close(err => {
      if (err) {
        console.error('Error closing database:', err.message);
        return reject(err);
      }
      console.log('Database connection closed');
      db = null;
      resolve();
    });
  });
}

// Get movies by custom query with custom sort
async function getMoviesByCustomQuery(page = 1, limit = 20, options = {}) {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    const offset = (page - 1) * limit;
    let whereConditions = [];
    let queryParams = [];
    
    // Apply filters
    if (options.type && options.type !== 'all') {
      whereConditions.push("json_extract(info, '$[0].movie_or_series') = ?");
      queryParams.push(options.type);
    }
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';
    
    // Build the sort clause based on the provided options
    let sortField = options.sortField || 'date';
    let sortDirection = options.sortDirection || 'DESC';
    let secondarySortField = options.secondarySortField || null;
    let secondarySortDirection = options.secondarySortDirection || 'DESC';
    
    // Build the ORDER BY clause
    let sortClause;
    
    if (sortField === 'release_year') {
      // For release year, we need to extract it from the JSON
      // This handles both simple years and compound years like "2022 / 2025"
      sortClause = `ORDER BY
        CAST(
          CASE 
            WHEN instr(json_extract(info, '$[0].release_year'), '/') > 0 
            THEN trim(substr(json_extract(info, '$[0].release_year'), instr(json_extract(info, '$[0].release_year'), '/') + 1))
            ELSE json_extract(info, '$[0].release_year')
          END
          AS INTEGER
        ) ${sortDirection}`;
      
      // Add secondary sort if provided
      if (secondarySortField === 'date') {
        sortClause += `, date ${secondarySortDirection}`;
      }
    } else if (sortField === 'date') {
      sortClause = `ORDER BY date ${sortDirection}`;
      
      // Add secondary sort if provided
      if (secondarySortField === 'release_year') {
        sortClause += `, 
        CAST(
          CASE 
            WHEN instr(json_extract(info, '$[0].release_year'), '/') > 0 
            THEN trim(substr(json_extract(info, '$[0].release_year'), instr(json_extract(info, '$[0].release_year'), '/') + 1))
            ELSE json_extract(info, '$[0].release_year')
          END
          AS INTEGER
        ) ${secondarySortDirection}`;
      }
    } else {
      // Default sort
      sortClause = `ORDER BY date DESC`;
    }
    
    // Build the complete query
    const query = `
      SELECT id, title, url, thumbnail, date, info, tags
      FROM movies 
      ${whereClause}
      ${sortClause}
      LIMIT ? OFFSET ?
    `;
    
    // Count query for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM movies
      ${whereClause}
    `;
    
    // Execute the count query first
    database.get(countQuery, queryParams, (err, countRow) => {
      if (err) {
        console.error('Error counting custom query movies:', err.message);
        return reject(err);
      }
      
      const totalMovies = countRow.total;
      const totalPages = Math.ceil(totalMovies / limit);
      const paginatedParams = [...queryParams, limit, offset];
      
      // Then execute the main query
      database.all(query, paginatedParams, (err, rows) => {
        if (err) {
          console.error('Error getting custom query movies:', err.message);
          return reject(err);
        }
        
        // Parse JSON fields
        const movies = rows.map(row => ({
          id: row.id,
          title: row.title,
          url: row.url,
          thumbnail: row.thumbnail,
          date: row.date,
          info: JSON.parse(row.info),
          tags: JSON.parse(row.tags || '[]')
        }));
        
        // Return the result
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

// Get movies by specific tag with pagination
async function getMoviesByTag(tag, page = 1, limit = 20) {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    const offset = (page - 1) * limit;
    
    // SQL query to find movies with exact tag match or tags containing the search term
    const query = `
      SELECT m.id, m.title, m.url, m.thumbnail, m.date, m.info, m.tags
      FROM movies m, json_each(m.tags) tags
      WHERE json_valid(m.tags) 
        AND (
          tags.value = ? OR  -- Exact case-sensitive match
          lower(tags.value) = lower(?) OR  -- Case-insensitive match
          lower(tags.value) LIKE lower(?) OR  -- Contains tag (case-insensitive)
          lower(tags.value) LIKE lower(?) OR  -- Tag at end of path
          lower(tags.value) LIKE lower(?)    -- Tag anywhere in path
        )
      ORDER BY m.date DESC
      LIMIT ? OFFSET ?
    `;
    
    const queryParams = [
      tag, 
      tag, 
      `%/${tag}%`,  // For tags like "web-series/netflix"
      `%/${tag}`,   // For tags ending with the search term
      `%${tag}%`,   // For tags containing the search term anywhere
      limit, 
      offset
    ];
    
    // Count query to get total number of matches
    const countQuery = `
      SELECT COUNT(DISTINCT m.id) as total
      FROM movies m, json_each(m.tags) tags
      WHERE json_valid(m.tags) 
        AND (
          tags.value = ? OR  -- Exact case-sensitive match
          lower(tags.value) = lower(?) OR  -- Case-insensitive match
          lower(tags.value) LIKE lower(?) OR  -- Contains tag (case-insensitive)
          lower(tags.value) LIKE lower(?) OR  -- Tag at end of path
          lower(tags.value) LIKE lower(?)    -- Tag anywhere in path
        )
    `;
    
    // Execute count query first
    database.get(countQuery, [tag, tag, `%/${tag}%`, `%/${tag}`, `%${tag}%`], (err, countRow) => {
      if (err) {
        console.error('Error counting tag-filtered movies:', err.message);
        return reject(err);
      }
      
      const totalMovies = countRow.total;
      const totalPages = Math.ceil(totalMovies / limit);
      
      // Execute main query
      database.all(query, queryParams, (err, rows) => {
        if (err) {
          console.error('Error getting tag-filtered movies:', err.message);
          return reject(err);
        }
        
        console.log(`Found ${rows.length} movies with tag "${tag}"`);
        
        // Parse JSON fields and remove duplicates
        const uniqueMovieIds = new Set();
        const uniqueMovies = [];
        
        rows.forEach(row => {
          try {
            if (!uniqueMovieIds.has(row.id)) {
              uniqueMovieIds.add(row.id);
              
              uniqueMovies.push({
                id: row.id,
                title: row.title,
                url: row.url,
                thumbnail: row.thumbnail,
                date: row.date,
                info: JSON.parse(row.info),
                tags: JSON.parse(row.tags || '[]')
              });
            }
          } catch (e) {
            console.error(`Error parsing JSON for movie ${row.id}:`, e);
          }
        });
        
        resolve({
          movies: uniqueMovies,
          page,
          limit,
          totalItems: totalMovies,
          totalPages
        });
      });
    });
  });
}

// Count movies with each unique tag
async function getTagCounts(database) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT tags.value as tag, COUNT(DISTINCT m.id) as count
      FROM movies m, json_each(m.tags) tags
      WHERE json_valid(m.tags)
      GROUP BY tags.value
      ORDER BY count DESC
    `;
    
    database.all(query, [], (err, rows) => {
      if (err) {
        console.error('Error counting tags:', err.message);
        return reject(err);
      }
      
      console.log(`=== Tag Counts ===`);
      console.log(`Found ${rows.length} unique tags`);
      
      // Log the top 20 tags
      rows.slice(0, 20).forEach(row => {
        console.log(`"${row.tag}": ${row.count} movies`);
      });
      
      resolve(rows);
    });
  });
}

// Get related categories for a movie
async function getRelatedCategories(movieId, limit = 20) {
  const database = getDatabase();
  return new Promise(async (resolve, reject) => {
    try {
      // First get the movie's tags and metadata
      const movie = await new Promise((resolveMovie, rejectMovie) => {
        database.get(
          `SELECT tags, info FROM movies WHERE id = ?`,
          [movieId],
          (err, row) => {
            if (err) return rejectMovie(err);
            if (!row) return resolveMovie(null);
            resolveMovie({
              tags: JSON.parse(row.tags || '[]'),
              info: JSON.parse(row.info || '[]')
            });
          }
        );
      });

      if (!movie) {
        return resolve([]);
      }

      // Extract categories from movie info
      const categories = new Set();
      
      // Add tags as categories
      movie.tags.forEach(tag => categories.add(tag));
      
      // Add metadata as categories if available
      if (movie.info && movie.info.length > 0) {
        const info = movie.info[0];
        if (info.language) categories.add(info.language);
        if (info.quality) categories.add(info.quality);
        if (info.release_year) categories.add(info.release_year);
        if (info.movie_or_series) categories.add(info.movie_or_series);
      }

      // Find other movies with these categories
      const categoryCounts = {};
      const categoryPromises = Array.from(categories).map(category => {
        return new Promise((resolveCategory, rejectCategory) => {
          const query = `
            SELECT COUNT(*) as count
            FROM movies
            WHERE (
              tags LIKE ? OR
              json_extract(info, '$[0].language') = ? OR
              json_extract(info, '$[0].quality') = ? OR
              json_extract(info, '$[0].release_year') = ? OR
              json_extract(info, '$[0].movie_or_series') = ?
            )
            AND id != ?
          `;
          
          const params = [
            `%${category}%`,
            category,
            category,
            category,
            category,
            movieId
          ];

          database.get(query, params, (err, row) => {
            if (err) return rejectCategory(err);
            categoryCounts[category] = row.count;
            resolveCategory();
          });
        });
      });

      await Promise.all(categoryPromises);

      // Convert to array and sort by count
      const relatedCategories = Object.entries(categoryCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

      resolve(relatedCategories);
    } catch (error) {
      console.error('Error getting related categories:', error);
      reject(error);
    }
  });
}

/**
 * Get movies by category type and slug (hyphenated)
 * @param {string} type - One of: movies-by-genres, movies-by-quality, movies-by-year, web-series, tv-series
 * @param {string} slug - The hyphenated category slug (e.g. sci-fi, voot-originals, 1080p)
 * @param {number} page - Page number (default 1)
 * @param {number} limit - Page size (default 20)
 */
async function getMoviesByCategory(type, slug, page = 1, limit = 20) {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    const offset = (page - 1) * limit;
    let whereClause = '';
    let queryParams = [];
    let countQuery = '';
    let mainQuery = '';

    // Map type to field and SQL
    if (type === 'movies-by-genres') {
      // Genre is stored in tags (hyphenated)
      whereClause = `EXISTS (SELECT 1 FROM json_each(tags) WHERE lower(json_each.value) = lower(?))`;
      queryParams = [slug];
    } else if (type === 'movies-by-quality') {
      // Quality is in info[0].quality (hyphenated)
      whereClause = `lower(json_extract(info, '$[0].quality')) = lower(?)`;
      queryParams = [slug];
    } else if (type === 'movies-by-year') {
      // Year is in info[0].release_year
      whereClause = `json_extract(info, '$[0].release_year') = ?`;
      queryParams = [slug];
    } else if (type === 'web-series') {
      // Platform is in tags or info[0].platform (if exists), but usually in tags
      whereClause = `EXISTS (SELECT 1 FROM json_each(tags) WHERE lower(json_each.value) = lower(?))`;
      queryParams = [slug];
    } else if (type === 'tv-series') {
      // Network is in tags or info[0].platform (if exists), but usually in tags
      whereClause = `EXISTS (SELECT 1 FROM json_each(tags) WHERE lower(json_each.value) = lower(?))`;
      queryParams = [slug];
    } else {
      // Fallback: search in tags
      whereClause = `EXISTS (SELECT 1 FROM json_each(tags) WHERE lower(json_each.value) = lower(?))`;
      queryParams = [slug];
    }

    countQuery = `SELECT COUNT(*) as total FROM movies WHERE ${whereClause}`;
    mainQuery = `SELECT id, title, url, thumbnail, date, info, tags FROM movies WHERE ${whereClause} ORDER BY date DESC LIMIT ? OFFSET ?`;

    // Get total count
    database.get(countQuery, queryParams, (err, countRow) => {
      if (err) {
        console.error('Error counting movies by category:', err.message);
        return reject(err);
      }
      const totalMovies = countRow.total;
      const totalPages = Math.ceil(totalMovies / limit);
      const paginatedParams = [...queryParams, limit, offset];
      // Get movies
      database.all(mainQuery, paginatedParams, (err, rows) => {
        if (err) {
          console.error('Error getting movies by category:', err.message);
          return reject(err);
        }
        const movies = rows.map(row => ({
          id: row.id,
          title: row.title,
          url: row.url,
          thumbnail: row.thumbnail,
          date: row.date,
          info: JSON.parse(row.info),
          tags: JSON.parse(row.tags || '[]')
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

// Get categories from database
async function getCategories() {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    // First check if the categories table exists
    database.get("SELECT name FROM sqlite_master WHERE type='table' AND name='categories'", (err, result) => {
      if (err) {
        console.error('Error checking for categories table:', err.message);
        return reject(err);
      }
      
      // If categories table doesn't exist, return empty structure
      if (!result) {
        console.log('Categories table does not exist in the database');
        return resolve({
          timestamp: new Date().toISOString(),
          totalCategories: 0,
          categories: {},
          stats: {
            total: 0,
            byType: {}
          }
        });
      }
      
      // Get all categories from the database
      database.all('SELECT * FROM categories ORDER BY type', (err, rows) => {
        if (err) {
          console.error('Error fetching categories:', err.message);
          return reject(err);
        }
        
        // Format the data in the same structure as the file
        const categoriesData = {
          timestamp: new Date().toISOString(),
          totalCategories: rows.reduce((sum, category) => {
            try {
              const slugs = JSON.parse(category.slugs);
              return sum + slugs.length;
            } catch (e) {
              console.error(`Error parsing slugs for ${category.type}:`, e.message);
              return sum;
            }
          }, 0),
          categories: rows.reduce((result, category) => {
            try {
              result[category.type] = {
                title: category.title,
                description: category.description,
                slugs: JSON.parse(category.slugs)
              };
            } catch (e) {
              console.error(`Error parsing category ${category.type}:`, e.message);
              result[category.type] = {
                title: category.title,
                description: category.description,
                slugs: []
              };
            }
            return result;
          }, {}),
          stats: {
            total: rows.reduce((sum, category) => {
              try {
                const slugs = JSON.parse(category.slugs);
                return sum + slugs.length;
              } catch (e) {
                return sum;
              }
            }, 0),
            byType: rows.reduce((result, category) => {
              try {
                const slugs = JSON.parse(category.slugs);
                result[category.type] = {
                  total: slugs.length
                };
              } catch (e) {
                result[category.type] = {
                  total: 0
                };
              }
              return result;
            }, {})
          }
        };
        
        resolve(categoriesData);
      });
    });
  });
}

/**
 * Search for movies related to a specific category across all fields
 * (tags, title, info fields, notes, synopsis)
 * 
 * @param {string} categorySlug - The category slug to search for
 * @param {number} page - The page number for pagination (default: 1)
 * @param {number} limit - The number of items per page (default: 20)
 * @returns {Promise<Object>} - A promise that resolves with the search results
 */
function searchMoviesByCategory(categorySlug, page = 1, limit = 20) {
  return new Promise((resolve, reject) => {
    try {
      console.log(`Searching for movies related to category: ${categorySlug} (page: ${page}, limit: ${limit})`);

      // Calculate offset for pagination
      const offset = (page - 1) * limit;
      
      // Search query looking across multiple fields
      const searchTerm = `%${categorySlug}%`;
      
      // Build the query to search across multiple fields
      const query = `
        SELECT id, title, slug, date, cover, info, tags
        FROM movies
        WHERE 
          -- Search in title
          title LIKE ? 
          -- Search in tags array using json_each
          OR (json_valid(tags) AND EXISTS (
            SELECT 1 FROM json_each(tags) WHERE json_each.value LIKE ?
          ))
          -- Search in info.streamingInfo
          OR (json_valid(info) AND json_extract(info, '$.streamingInfo') LIKE ?) 
          -- Search in info.notes
          OR (json_valid(info) AND json_extract(info, '$.notes') LIKE ?) 
          -- Search in info.synopsis
          OR (json_valid(info) AND json_extract(info, '$.synopsis') LIKE ?)
        ORDER BY date DESC
        LIMIT ? OFFSET ?
      `;
      
      // Count total matching movies
      const countQuery = `
        SELECT COUNT(*) as total
        FROM movies
        WHERE 
          title LIKE ? 
          OR (json_valid(tags) AND EXISTS (
            SELECT 1 FROM json_each(tags) WHERE json_each.value LIKE ?
          ))
          OR (json_valid(info) AND json_extract(info, '$.streamingInfo') LIKE ?) 
          OR (json_valid(info) AND json_extract(info, '$.notes') LIKE ?) 
          OR (json_valid(info) AND json_extract(info, '$.synopsis') LIKE ?)
      `;
      
      // Placeholder values for both queries
      const searchParams = [
        searchTerm, // title
        searchTerm, // tags
        searchTerm, // info.streamingInfo
        searchTerm, // info.notes
        searchTerm, // info.synopsis
      ];
      
      // Get total count first
      db.get(countQuery, searchParams, (countErr, countRow) => {
        if (countErr) {
          console.error('Error counting category search results:', countErr);
          return reject(countErr);
        }
        
        const totalMovies = countRow ? countRow.total : 0;
        
        // Execute the main query with pagination
        db.all(
          query, 
          [...searchParams, limit, offset], 
          (err, rows) => {
            if (err) {
              console.error('Error searching for category movies:', err);
              return reject(err);
            }
            
            // Process the results
            const movies = rows.map(row => {
              // Parse JSON fields
              try {
                if (row.info && typeof row.info === 'string') {
                  row.info = JSON.parse(row.info);
                }
                if (row.tags && typeof row.tags === 'string') {
                  row.tags = JSON.parse(row.tags);
                }
              } catch (parseErr) {
                console.error(`Error parsing JSON for movie ${row.id}:`, parseErr);
              }
              return row;
            });
            
            // Calculate pagination info
            const totalPages = Math.ceil(totalMovies / limit);
            
            resolve({
              movies,
              pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages,
                totalItems: totalMovies,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
              },
              query: {
                category: categorySlug
              }
            });
          }
        );
      });
    } catch (error) {
      console.error('Error in searchMoviesByCategory:', error);
      reject(error);
    }
  });
}

module.exports = {
  getAllMovies,
  searchMovies,
  getFilters,
  getMovieStats,
  getMovieByUrl,
  closeDatabase,
  getMoviesByCustomQuery,
  getMoviesByTag,
  getTagCounts,
  getRelatedCategories,
  getMoviesByCategory,
  getCategories,
  searchMoviesByCategory
}; 