const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const config = require("../utils/config");

// Create output/db directory if it doesn't exist
const dbDir = config.paths.db;
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database connection
const db = new sqlite3.Database(config.db.path, (err) => {
  if (err) {
    console.error("Error connecting to database:", err);
  } else {
    console.log(`Connected to SQLite database at ${config.db.path}`);
  }
});

// Get database connection (singleton)
function getDatabase() {
  return db;
}

// Initialize database
async function initializeDatabase() {
  try {
    // Ensure database directory exists
    const dbDir = path.dirname(config.db.path);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`Created database directory: ${dbDir}`);
    }

    const db = getDatabase();

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
    )`);

    // Create sections table if it doesn't exist
    db.run(`CREATE TABLE IF NOT EXISTS sections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
      movie_id INTEGER,
      heading TEXT,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (movie_id) REFERENCES movies(id)
    )`);

    return true;
  } catch (error) {
    console.error("Error initializing database:", error);
    return false;
  }
}

// Initialize database on startup
(async () => {
  try {
    await initializeDatabase();
    console.log("Database tables initialized successfully");
  } catch (error) {
    console.error("Error initializing database:", error);
  }
})();

/**
 * Save a movie to the database
 * @param {Object} movie - The movie object to save
 * @param {Object} options - Additional options
 * @param {boolean} options.forceTagUpdate - Force update tags even if they haven't changed
 * @param {boolean} options.forceUpdate - Force update all movie data even if unchanged
 * @returns {Promise<boolean>} - Whether the save was successful
 */
async function saveMovie(movie, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      // Ensure tags is an array
      if (!movie.tags) {
        movie.tags = [];
      }

      // Convert tags to JSON string
      const tagsJson = JSON.stringify(movie.tags);

      // Normalize the URL before checking if movie exists
      const urlUtils = require("../utils/urlUtils");
      const normalizedUrl = urlUtils.normalizeUrl(movie.url);
      const urlMatchCondition = urlUtils.getUrlMatchCondition();

      // Check if movie exists
      db.get(
        `SELECT * FROM movies WHERE ${urlMatchCondition}`,
        [normalizedUrl],
        async (err, row) => {
          if (err) {
            console.error("Error checking movie existence:", err);
            reject(err);
            return;
          }

          if (row) {
            // Movie exists, update it
            const existingTags = JSON.parse(row.tags || "[]");
            const tagsChanged =
              JSON.stringify(existingTags.sort()) !==
              JSON.stringify(movie.tags.sort());

            // Force full update if requested, otherwise only update if tags changed or forceTagUpdate is true
            if (options.forceUpdate || tagsChanged || options.forceTagUpdate) {
              // If full update requested, update all fields
              if (options.forceUpdate) {
                db.run(
                  "UPDATE movies SET title = ?, thumbnail = ?, date = ?, info = ?, tags = ?, updated_at = ? WHERE id = ?",
                  [
                    movie.title,
                    movie.thumbnail || row.thumbnail,
                    movie.date || row.date,
                    JSON.stringify(movie.info),
                    tagsJson,
                    new Date().toISOString(),
                    row.id,
                  ],
                  function (err) {
                    if (err) {
                      console.error("Error updating movie:", err);
                      reject(err);
                      return;
                    }
                    console.log(
                      `Fully updated movie: ${movie.title} (${movie.url})`
                    );
                    resolve({ exists: true, updated: true, fullUpdate: true });
                  }
                );
              } else {
                // If just tags update, only update tags and related fields
                db.run(
                  "UPDATE movies SET title = ?, info = ?, tags = ?, updated_at = ? WHERE id = ?",
                  [
                    movie.title,
                    JSON.stringify(movie.info),
                    tagsJson,
                    new Date().toISOString(),
                    row.id,
                  ],
                  function (err) {
                    if (err) {
                      console.error("Error updating movie:", err);
                      reject(err);
                      return;
                    }
                    console.log(`Updated movie: ${movie.title} (${movie.url})`);
                    console.log(
                      `Tags changed: ${existingTags.join(
                        ", "
                      )} -> ${movie.tags.join(", ")}`
                    );
                    resolve({ exists: true, updated: true });
                  }
                );
              }
            } else {
              console.log(
                `Skipped update for movie: ${movie.title} (tags unchanged)`
              );
              resolve({ exists: true, updated: false });
            }
          } else {
            // Movie doesn't exist, insert it
            // Store normalized URL in database
            db.run(
              "INSERT INTO movies (url, title, info, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
              [
                normalizedUrl, // Store the normalized URL
                movie.title,
                JSON.stringify(movie.info),
                tagsJson,
                new Date().toISOString(),
                new Date().toISOString(),
              ],
              function (err) {
                if (err) {
                  console.error("Error inserting movie:", err);
                  reject(err);
                  return;
                }
                console.log(
                  `Inserted new movie: ${movie.title} (${movie.url})`
                );
                console.log(`Tags: ${movie.tags.join(", ")}`);
                resolve({ exists: false, inserted: true });
              }
            );
          }
        }
      );
    } catch (error) {
      console.error("Error in saveMovie:", error);
      reject(error);
    }
  });
}

// Get a movie by its URL
async function getMovieByUrl(url) {
  return new Promise((resolve, reject) => {
    try {
      // Require url utils dynamically to avoid circular dependencies
      const urlUtils = require("../utils/urlUtils");

      // Normalize the URL
      const normalizedUrl = urlUtils.normalizeUrl(url);

      // Use SQL that matches serve-db.js approach
      const urlMatchCondition = urlUtils.getUrlMatchCondition();

      db.get(
        `SELECT * FROM movies WHERE ${urlMatchCondition}`,
        [normalizedUrl],
        (err, movieRow) => {
          if (err) {
            console.error("Error getting movie by URL:", err.message);
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
              tags: JSON.parse(movieRow.tags || "[]"),
              created_at: movieRow.created_at,
              updated_at: movieRow.updated_at,
            };
            resolve(movie);
          } catch (parseError) {
            console.error("Error parsing movie info:", parseError);
            reject(parseError);
          }
        }
      );
    } catch (error) {
      console.error("Error in getMovieByUrl:", error);
      resolve(null);
    }
  });
}

// Get a movie by its ID
async function getMovieById(id) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM movies WHERE id = ?`, [id], (err, movieRow) => {
      if (err) {
        console.error("Error getting movie by ID:", err.message);
        return reject(err);
      }

      if (!movieRow) {
        return resolve(null);
      }

      // Get screenshots
      db.all(
        `SELECT url FROM screenshots WHERE movie_id = ?`,
        [movieRow.id],
        (err, screenshotRows) => {
          if (err) {
            console.error("Error getting screenshots:", err.message);
            return reject(err);
          }

          const screenshots = screenshotRows.map((row) => row.url);

          // Get sections
          db.all(
            `SELECT * FROM sections WHERE movie_id = ?`,
            [movieRow.id],
            (err, sectionRows) => {
              if (err) {
                console.error("Error getting sections:", err.message);
                return reject(err);
              }

              console.log(
                `Found ${sectionRows.length} sections for movie ${movieRow.title}`
              );

              const sectionPromises = sectionRows.map((sectionRow) => {
                return new Promise((resolve, reject) => {
                  // Get link groups for this section
                  db.all(
                    `SELECT * FROM link_groups WHERE section_id = ?`,
                    [sectionRow.id],
                    (err, linkGroupRows) => {
                      if (err) {
                        console.error(
                          "Error getting link groups:",
                          err.message
                        );
                        return reject(err);
                      }

                      console.log(
                        `Found ${
                          linkGroupRows.length
                        } link groups for section "${
                          sectionRow.heading || sectionRow.note
                        }"`
                      );

                      const linkGroupPromises = linkGroupRows.map(
                        (linkGroupRow) => {
                          return new Promise((resolve, reject) => {
                            // Get links for this link group
                            db.all(
                              `SELECT button_label, url as link FROM links WHERE link_group_id = ?`,
                              [linkGroupRow.id],
                              (err, linkRows) => {
                                if (err) {
                                  console.error(
                                    "Error getting links:",
                                    err.message
                                  );
                                  return reject(err);
                                }

                                // Log for debugging
                                console.log(
                                  `Found ${linkRows.length} links for group "${linkGroupRow.name}"`
                                );

                                resolve({
                                  name: linkGroupRow.name,
                                  links: linkRows,
                                });
                              }
                            );
                          });
                        }
                      );

                      Promise.all(linkGroupPromises)
                        .then((linkGroups) => {
                          resolve({
                            heading: sectionRow.heading || sectionRow.note,
                            links: linkGroups,
                          });
                        })
                        .catch((err) => reject(err));
                    }
                  );
                });
              });

              Promise.all(sectionPromises)
                .then((sections) => {
                  // Construct the full movie object
                  const movie = {
                    id: movieRow.id,
                    title: movieRow.title,
                    url: movieRow.url,
                    thumbnail: movieRow.thumbnail,
                    date: movieRow.date,
                    info: [
                      {
                        imdb_rating: movieRow.imdb_rating,
                        movie_name: movieRow.movie_name,
                        series_name: movieRow.series_name,
                        season: movieRow.season,
                        episode: movieRow.episode,
                        release_year: movieRow.release_year,
                        language: movieRow.language,
                        subtitle: movieRow.subtitle,
                        size: movieRow.size,
                        episode_size: movieRow.episode_size,
                        complete_zip: movieRow.complete_zip,
                        quality: movieRow.quality,
                        format: movieRow.format,
                        details: movieRow.details
                          ? JSON.parse(movieRow.details)
                          : [],
                        synopsis: movieRow.synopsis,
                        screenshots: screenshots,
                        sections: sections,
                      },
                    ],
                    created_at: movieRow.created_at,
                    updated_at: movieRow.updated_at,
                  };

                  resolve(movie);
                })
                .catch((err) => reject(err));
            }
          );
        }
      );
    });
  });
}

// Get all movies with pagination and sorting
async function getAllMovies(page = 1, pageSize = 20, options = {}) {
  const offset = (page - 1) * pageSize;
  const limit = pageSize;

  // Default sort is by date descending
  const sortField = options.sort || "date_newest";

  // Determine sort order SQL
  let sortSql = "";
  switch (sortField) {
    case "id_newest":
      sortSql = "ORDER BY id DESC";
      break;
    case "id_oldest":
      sortSql = "ORDER BY id ASC";
      break;
    case "date_newest":
      sortSql = "ORDER BY date DESC";
      break;
    case "date_oldest":
      sortSql = "ORDER BY date ASC";
      break;
    case "title_asc":
      sortSql = "ORDER BY title ASC";
      break;
    case "title_desc":
      sortSql = "ORDER BY title DESC";
      break;
    default:
      sortSql = "ORDER BY date DESC";
  }

  try {
    // Get movies with pagination
    const movies = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, title, url, date, info, tags FROM movies ${sortSql} LIMIT ? OFFSET ?`,
        [limit, offset],
        (err, rows) => {
          if (err) return reject(err);

          // Process rows to parse JSON fields
          const processedRows = rows.map((row) => ({
            ...row,
            tags: JSON.parse(row.tags || "[]"),
            info: JSON.parse(row.info || "[]"),
          }));

          resolve(processedRows);
        }
      );
    });

    // Get total count
    const totalCount = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as count FROM movies", (err, row) => {
        if (err) return reject(err);
        resolve(row.count);
      });
    });

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      movies,
      pagination: {
        page,
        pageSize,
        totalPages,
        totalItems: totalCount,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  } catch (error) {
    console.error("Error getting all movies:", error);
    return {
      movies: [],
      pagination: {
        page,
        pageSize,
        totalPages: 0,
        totalItems: 0,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
  }
}

// Search for movies
async function searchMovies(query, page = 1, limit = 20, filters = {}) {
  return new Promise((resolve, reject) => {
    const offset = (page - 1) * limit;
    let whereConditions = [];
    let queryParams = [];

    // Add search condition for title
    whereConditions.push("title LIKE ?");
    queryParams.push(`%${query}%`);

    // Apply additional filters
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

    // Add type filter (movie or series)
    if (filters.type && filters.type !== "all") {
      whereConditions.push("json_extract(info, '$[0].movie_or_series') = ?");
      queryParams.push(filters.type);
    }

    // Inside the getAllMovies function where URL filtering is applied
    if (filters.url) {
      // Normalize URL for comparison (remove domain, trailing slash)
      let normalizedUrl = filters.url;

      // If it starts with http:// or https://, strip the domain part
      if (normalizedUrl.startsWith("http")) {
        try {
          const urlObj = new URL(normalizedUrl);
          normalizedUrl = urlObj.pathname;
        } catch (e) {
          console.error("Invalid URL:", e.message);
        }
      }

      // Remove trailing slash if present
      normalizedUrl = normalizedUrl.replace(/\/$/, "");

      // Use a more flexible matching approach
      whereConditions.push(`(
        url = ? OR 
        url LIKE ? OR 
        REPLACE(url, 'https://vegamovies.bot', '') = ? OR
        REPLACE(url, 'http://vegamovies.bot', '') = ? OR
        REPLACE(REPLACE(url, '/', ''), 'https:vegamoviesbot', '') = REPLACE(REPLACE(?, '/', ''), 'https:vegamoviesbot', '')
      )`);
      queryParams.push(
        normalizedUrl,
        `%${normalizedUrl}`,
        normalizedUrl,
        normalizedUrl,
        normalizedUrl
      );
    }

    // Build the WHERE clause
    const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

    // Determine sort order (default to relevance for search)
    let sortClause = "ORDER BY date DESC"; // Default to newest by post date
    if (filters.sort === "oldest") {
      sortClause = "ORDER BY date ASC";
    } else if (filters.sort === "title") {
      sortClause = "ORDER BY title ASC";
    } else if (filters.sort === "rating") {
      sortClause = 'ORDER BY json_extract(info, "$[0].imdb_rating") DESC';
    } else if (filters.sort === "relevance") {
      sortClause = "ORDER BY title ASC"; // Sort by title for relevance
    } else if (filters.sort === "id_newest") {
      sortClause = "ORDER BY id DESC";
    }

    // Query to get paginated search results
    const query = `
      SELECT id, title, url, thumbnail, date, info, tags
      FROM movies 
      ${whereClause}
      ${sortClause}
      LIMIT ? OFFSET ?
    `;

    // Query to get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM movies
      ${whereClause}
    `;

    // Execute queries
    db.get(countQuery, queryParams, (err, countRow) => {
      if (err) {
        console.error("Error counting search results:", err.message);
        return reject(err);
      }

      const totalMovies = countRow.total;
      const totalPages = Math.ceil(totalMovies / limit);

      // Add limit and offset to params
      const paginatedParams = [...queryParams, limit, offset];

      db.all(query, paginatedParams, (err, rows) => {
        if (err) {
          console.error("Error searching movies:", err.message);
          return reject(err);
        }

        // Parse the JSON info string for each movie
        const movies = rows.map((row) => {
          try {
            return {
              id: row.id,
              title: row.title,
              url: row.url,
              thumbnail: row.thumbnail,
              date: row.date,
              info: JSON.parse(row.info),
              tags: JSON.parse(row.tags || "[]"),
            };
          } catch (parseError) {
            console.error(
              `Error parsing movie info for ${row.title}:`,
              parseError
            );
            return {
              id: row.id,
              title: row.title,
              url: row.url,
              thumbnail: row.thumbnail,
              date: row.date,
              info: [],
              tags: [],
            };
          }
        });

        resolve({
          movies,
          page,
          limit,
          totalItems: totalMovies,
          totalPages,
        });
      });
    });
  });
}

// Get movie statistics
async function getMovieStats() {
  try {
    // Get total movie count
    const totalCount = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as count FROM movies", (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });

    // Get unique movie count (where type is 'movie')
    const uniqueMovies = await new Promise((resolve, reject) => {
      db.get(
        "SELECT COUNT(*) as count FROM movies WHERE json_extract(info, '$[0].movie_or_series') = 'Movie'",
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });

    // Get unique series count (where type is 'series' or 'tv series')
    const uniqueSeries = await new Promise((resolve, reject) => {
      db.get(
        "SELECT COUNT(*) as count FROM movies WHERE json_extract(info, '$[0].movie_or_series') = 'TV Series' OR json_extract(info, '$[0].movie_or_series') = 'Series'",
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });

    return {
      totalMovies: totalCount,
      uniqueMovies,
      uniqueSeries,
    };
  } catch (error) {
    console.error("Error getting movie stats:", error);
    return { totalMovies: 0, uniqueMovies: 0, uniqueSeries: 0 };
  }
}

// Close the database connection
function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        console.error("Error closing database:", err);
        reject(err);
      } else {
        console.log("Database connection closed");
        resolve();
      }
    });
  });
}

// Get available filters (years, languages, qualities, types)
async function getFilters() {
  return new Promise((resolve, reject) => {
    const dbPath = path.join(__dirname, "..", "db", "data", "movies2.db");
    const database = new sqlite3.Database(dbPath);

    const queries = {
      years:
        "SELECT DISTINCT json_extract(info, '$[0].release_year') AS value FROM movies WHERE json_extract(info, '$[0].release_year') IS NOT NULL ORDER BY value DESC",
      languages:
        "SELECT DISTINCT json_extract(info, '$[0].language') AS value FROM movies WHERE json_extract(info, '$[0].language') IS NOT NULL ORDER BY value",
      qualities:
        "SELECT DISTINCT json_extract(info, '$[0].quality') AS value FROM movies WHERE json_extract(info, '$[0].quality') IS NOT NULL ORDER BY value",
      types:
        "SELECT DISTINCT json_extract(info, '$[0].movie_or_series') AS value FROM movies WHERE json_extract(info, '$[0].movie_or_series') IS NOT NULL ORDER BY value",
    };

    const results = {};

    const promises = Object.entries(queries).map(([key, query]) => {
      return new Promise((resolve, reject) => {
        database.all(query, [], (err, rows) => {
          if (err) {
            console.error(`Error fetching ${key}:`, err);
            reject(err);
          } else {
            results[key] = rows.map((row) => row.value).filter(Boolean);
            resolve();
          }
        });
      });
    });

    Promise.all(promises)
      .then(() => {
        database.close();
        resolve(results);
      })
      .catch((error) => {
        database.close();
        reject(error);
      });
  });
}

// Search movies by tags
async function searchMoviesByTags(tags) {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    // Convert tags array to JSON strings for comparison
    const tagJsonStrings = tags.map((tag) => JSON.stringify(tag));

    // Build the WHERE clause to check if all tags are present
    const whereConditions = tagJsonStrings.map(
      (tagJson) =>
        `json_array_length(json_extract(tags, '$')) > 0 AND json_extract(tags, '$') LIKE ?`
    );

    const query = `
      SELECT id, title, url, thumbnail, date, info, tags
      FROM movies
      WHERE ${whereConditions.join(" AND ")}
      ORDER BY date DESC
    `;

    // Add % around each tag for LIKE comparison
    const params = tagJsonStrings.map((tagJson) => `%${tagJson.slice(1, -1)}%`);

    database.all(query, params, (err, rows) => {
      if (err) {
        console.error("Error searching movies by tags:", err.message);
        return reject(err);
      }

      const movies = rows.map((row) => ({
        id: row.id,
        title: row.title,
        url: row.url,
        thumbnail: row.thumbnail,
        date: row.date,
        info: JSON.parse(row.info || "[]"),
        tags: JSON.parse(row.tags || "[]"),
      }));

      resolve(movies);
    });
  });
}

// Get all unique tags
async function getAllTags() {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    const query = `
      SELECT DISTINCT json_extract(tags, '$[*]') as tag
      FROM movies
      WHERE json_array_length(json_extract(tags, '$')) > 0
    `;

    database.all(query, [], (err, rows) => {
      if (err) {
        console.error("Error getting all tags:", err.message);
        return reject(err);
      }

      // Extract unique tags from the results
      const tags = new Set();
      rows.forEach((row) => {
        try {
          const tagArray = JSON.parse(row.tag);
          if (Array.isArray(tagArray)) {
            tagArray.forEach((tag) => tags.add(tag));
          }
        } catch (e) {
          // Skip invalid JSON
        }
      });

      resolve(Array.from(tags).sort());
    });
  });
}

// Function to compare tag arrays regardless of their order
function areTagsEqual(tags1, tags2) {
  // Handle empty cases
  if (!tags1 || !tags2) return !tags1 === !tags2;

  // If arrays are different lengths, they're not equal
  if (tags1.length !== tags2.length) return false;

  // Convert to Sets for order-independent comparison
  const set1 = new Set(tags1);
  const set2 = new Set(tags2);

  // If Sets have different sizes, arrays had duplicates
  if (set1.size !== set2.size) return false;

  // Check if all items in set1 are in set2
  for (const item of set1) {
    if (!set2.has(item)) return false;
  }

  return true;
}

// Get total movie count
async function getMovieCount() {
  return new Promise((resolve, reject) => {
    db.get("SELECT COUNT(*) as count FROM movies", (err, row) => {
      if (err) {
        console.error("Error getting movie count:", err.message);
        return reject(err);
      }
      resolve(row.count);
    });
  });
}

// Function to save category sitemap to database
async function saveCategorySitemap(categoryData) {
  try {
    const db = getDatabase();

    // First, check if we need to create the categories table
    await new Promise((resolve, reject) => {
      db.run(
        `
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          slugs TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
        (err) => {
          if (err) {
            console.error("Error creating categories table:", err.message);
            return reject(err);
          }
          resolve();
        }
      );
    });

    // Clear existing categories
    await new Promise((resolve, reject) => {
      db.run("DELETE FROM categories", (err) => {
        if (err) {
          console.error("Error clearing categories table:", err.message);
          return reject(err);
        }
        resolve();
      });
    });

    // Insert each category type and its slugs
    const stmt = db.prepare(`
      INSERT INTO categories (type, title, description, slugs, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    for (const [type, data] of Object.entries(categoryData.categories)) {
      await new Promise((resolve, reject) => {
        stmt.run(
          type,
          data.title,
          data.description,
          JSON.stringify(data.slugs),
          (err) => {
            if (err) {
              console.error(`Error inserting category ${type}:`, err.message);
              return reject(err);
            }
            resolve();
          }
        );
      });
    }

    stmt.finalize();
    console.log(
      `Saved ${
        Object.keys(categoryData.categories).length
      } category types to database`
    );
    return true;
  } catch (error) {
    console.error("Error saving category sitemap to database:", error.message);
    throw error;
  }
}

// Function to retrieve category sitemap from database
async function getCategorySitemap() {
  try {
    const db = getDatabase();

    // Get all categories from the database
    const categories = await new Promise((resolve, reject) => {
      db.all("SELECT * FROM categories", (err, rows) => {
        if (err) {
          console.error("Error fetching categories:", err.message);
          return reject(err);
        }
        resolve(rows);
      });
    });

    // Format the data in the same structure as the file
    const categoriesData = {
      timestamp: new Date().toISOString(),
      totalCategories: categories.reduce((sum, category) => {
        const slugs = JSON.parse(category.slugs);
        return sum + slugs.length;
      }, 0),
      categories: categories.reduce((result, category) => {
        result[category.type] = {
          title: category.title,
          description: category.description,
          slugs: JSON.parse(category.slugs),
        };
        return result;
      }, {}),
      stats: {
        total: categories.reduce((sum, category) => {
          const slugs = JSON.parse(category.slugs);
          return sum + slugs.length;
        }, 0),
        byType: categories.reduce((result, category) => {
          const slugs = JSON.parse(category.slugs);
          result[category.type] = {
            total: slugs.length,
          };
          return result;
        }, {}),
      },
    };

    return categoriesData;
  } catch (error) {
    console.error(
      "Error retrieving category sitemap from database:",
      error.message
    );
    return null;
  }
}

// Update tags for a specific movie
async function updateMovieTags(movieId, tags) {
  return new Promise((resolve, reject) => {
    try {
      // Ensure tags is an array
      if (!Array.isArray(tags)) {
        if (typeof tags === "string") {
          tags = tags.split(",").map((tag) => tag.trim());
        } else {
          tags = [];
        }
      }

      // Convert tags to JSON string
      const tagsJson = JSON.stringify(tags);

      // Update tags and updated_at timestamp
      db.run(
        "UPDATE movies SET tags = ?, updated_at = ? WHERE id = ?",
        [tagsJson, new Date().toISOString(), movieId],
        function (err) {
          if (err) {
            console.error(`Error updating tags for movie ${movieId}:`, err);
            reject(err);
            return;
          }

          if (this.changes === 0) {
            console.warn(`No movie found with ID ${movieId}`);
            resolve(false);
          } else {
            console.log(
              `Updated tags for movie ${movieId}: ${tags.join(", ")}`
            );
            resolve(true);
          }
        }
      );
    } catch (error) {
      console.error(`Error in updateMovieTags for movie ${movieId}:`, error);
      reject(error);
    }
  });
}

async function getMoviesWithoutThumbnail() {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT info,id FROM movies WHERE thumbnail IS NULL",
      (err, rows) => {
        if (err) {
          console.error("Error getting movies without thumbnail:", err.message);
          return reject(err);
        }
        resolve(rows);
      }
    );
  });
}

async function updateMovieThumbnail(id, thumbnail) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE movies SET thumbnail = ? WHERE id = ?",
      [thumbnail, id],
      (err) => {
        if (err) {
          console.error("Error updating movie thumbnail:", err.message);
          reject(err);
        }
        resolve();
        console.log(`Updated movie thumbnail for ID ${id}: ${thumbnail}`);
      }
    );
  });
}

module.exports = {
  getDatabase,
  initializeDatabase,
  saveMovie,
  getMovieById,
  getMovieByUrl,
  getAllMovies,
  searchMovies,
  getMovieStats,
  getFilters,
  searchMoviesByTags,
  getAllTags,
  getMoviesWithoutThumbnail,
  saveCategorySitemap,
  getCategorySitemap,
  updateMovieTags,
  updateMovieThumbnail,
  closeDatabase,
};
