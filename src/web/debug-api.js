const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('../db/db');

// Initialize the Express app
const app = express();
const PORT = process.env.PORT || 3002;

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

// Register the API router
app.use('/api', apiRouter);

// Simple home route
app.get('/', (req, res) => {
  res.send('<h1>Debug API Server</h1><p>Use /api/stats to test the API</p>');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Debug API server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET /api/stats   - Database statistics');
  console.log('  GET /api/movies  - List all movies (pagination with ?page=1&limit=20)');
  console.log('  GET /api/movies/:id - Get movie by ID');
  
  // Initialize the database
  db.initializeDatabase()
    .then(() => {
      console.log('Database initialized successfully');
    })
    .catch(error => {
      console.error('Error initializing database:', error);
    });
}); 