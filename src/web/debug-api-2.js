const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('../db/db');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// Initialize the Express app
const app = express();
const PORT = process.env.PORT || 3003;

// Enable CORS for all routes
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// API Routes
const apiRouter = express.Router();

// Get database statistics
apiRouter.get('/stats', async (req, res) => {
  try {
    const stats = await db.getMovieStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all movies with pagination
apiRouter.get('/movies', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const year = req.query.year || null;
    const language = req.query.language || null;
    const quality = req.query.quality || null;
    
    const movies = await db.getAllMovies(page, limit, { year, language, quality });
    res.json({ success: true, data: movies });
  } catch (error) {
    console.error('Error getting movies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get a movie by URL
apiRouter.get('/movies/by-url', async (req, res) => {
  try {
    if (!req.query.url) {
      return res.status(400).json({ 
        success: false, 
        error: "URL parameter is required" 
      });
    }
    
    const movie = await db.getMovieByUrl(req.query.url);
    
    if (!movie) {
      return res.status(404).json({ 
        success: false, 
        error: "Movie not found" 
      });
    }
    
    res.json({ success: true, data: movie });
  } catch (error) {
    console.error('Error getting movie by URL:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get a movie by ID
apiRouter.get('/movies/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid ID parameter" 
      });
    }
    
    const movie = await db.getMovieById(id);
    
    if (!movie) {
      return res.status(404).json({ 
        success: false, 
        error: "Movie not found" 
      });
    }
    
    res.json({ success: true, data: movie });
  } catch (error) {
    console.error('Error getting movie by ID:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search for movies
apiRouter.get('/search', async (req, res) => {
  try {
    if (!req.query.q) {
      return res.status(400).json({ 
        success: false, 
        error: "Search query parameter 'q' is required" 
      });
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const query = req.query.q;
    
    const movies = await db.searchMovies(query, page, limit);
    res.json({ success: true, data: movies });
  } catch (error) {
    console.error('Error searching movies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all links by category
apiRouter.get('/links/:category', async (req, res) => {
  try {
    const category = req.params.category;
    
    // Example SQL query to find all links matching a category
    const query = `
      SELECT l.id, l.button_label, l.url, lg.name AS group_name, m.title AS movie_title, m.url AS movie_url
      FROM links l
      JOIN link_groups lg ON l.link_group_id = lg.id
      JOIN sections s ON lg.section_id = s.id
      JOIN movies m ON s.movie_id = m.id
      WHERE lg.name LIKE ?
      ORDER BY m.id DESC
      LIMIT 100
    `;
    
    const dbPath = path.join(__dirname, '..', 'db', 'data', 'movies.db');
    const database = new sqlite3.Database(dbPath);
    
    database.all(query, [`%${category}%`], (err, rows) => {
      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).json({ success: false, error: err.message });
      }
      
      res.json({ success: true, data: rows });
      
      database.close();
    });
  } catch (error) {
    console.error('Error getting links by category:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Register the API router
app.use('/api', apiRouter);

// Simple home route
app.get('/', (req, res) => {
  res.send('<h1>Debug API Server 2</h1><p>Use /api/stats to test the API</p>');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Debug API server 2 running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET /api/stats   - Database statistics');
  console.log('  GET /api/movies  - List all movies (pagination with ?page=1&limit=20)');
  console.log('  GET /api/movies/:id - Get movie by ID');
  console.log('  GET /api/movies/by-url - Get movie by URL');
  console.log('  GET /api/search  - Search movies');
  console.log('  GET /api/links/:category - Get links by category');
  
  // Initialize the database
  db.initializeDatabase()
    .then(() => {
      console.log('Database initialized successfully');
    })
    .catch(error => {
      console.error('Error initializing database:', error);
    });
}); 