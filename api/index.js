// Import the original serve-api app
console.log('Loading serve-api module for Vercel deployment');

// Add process environment info for debugging
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DB_PATH:', process.env.DB_PATH);
console.log('Current directory:', process.cwd());

const app = require('../src/web/serve-api');
console.log('serve-api module loaded successfully');

// Determine if this is being run directly or imported by Vercel
if (require.main === module) {
  // This is being run directly (local development)
  const PORT = process.env.PORT || 3000;
  const HOST = process.env.HOST || '127.0.0.1';
  
  // Start the server
  app.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
    console.log('Available endpoints:');
    console.log('  GET /api/all - Get paginated list of movies/series');
    console.log('  GET /api/type/:type - Get movies or series');
    console.log('  GET /api/id/:id - Get movie by ID');
    console.log('  GET /api/url/:url - Get movie by URL');
    console.log('  ...and more');
  });
}

// Export the Express app as a serverless function
module.exports = app; 