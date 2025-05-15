const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('../db/db');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// Initialize the Express app
const app = express();
const PORT = process.env.PORT || 3004;

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

// Register the API router
app.use('/api', apiRouter);

// Use a non-wildcard route for the home
app.get('/', (req, res) => {
  res.send('<h1>Debug API Server 3</h1><p>Use /api/stats to test the API</p>');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Debug API server 3 running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET /api/stats   - Database statistics');
  console.log('  GET /api/movies  - List all movies (pagination with ?page=1&limit=20)');
  
  // Initialize the database
  db.initializeDatabase()
    .then(() => {
      console.log('Database initialized successfully');
    })
    .catch(error => {
      console.error('Error initializing database:', error);
    });
}); 