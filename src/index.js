/**
 * Main Application Entry Point
 * 
 * This file serves as the main entry point for the application,
 * importing modules from the restructured project directories.
 */

// Database
const db = require('./db/db');

// Web components
const api = require('./web/api');

// Utils
const config = require('./utils/config');
const movieListService = require('./utils/movieListService');
const path = require('path');
const fs = require('fs');

// CLI tools can be imported when needed
// const cli = require('./cli/index');

/**
 * Main function to start the application
 */
async function main() {
  try {
    console.log(`Starting Vega API application on http://${config.api.host}:${config.api.port}...`);
    
    // Ensure output directory exists using the config
    if (!fs.existsSync(config.paths.output)) {
      fs.mkdirSync(config.paths.output, { recursive: true });
    }
    
    // Ensure database directory exists
    if (!fs.existsSync(config.paths.db)) {
      fs.mkdirSync(config.paths.db, { recursive: true });
    }
    
    // Ensure JSON directory exists
    if (!fs.existsSync(config.paths.json)) {
      fs.mkdirSync(config.paths.json, { recursive: true });
    }
    
    // The application is primarily an API server
    // which is initialized in api.js
    
    // For CLI usage, uncomment the following:
    // await cli.main();
    
  } catch (error) {
    console.error('Error in main application:', error);
    process.exit(1);
  }
}

// Run the main function if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = {
  main
}; 