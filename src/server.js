const moviesApi = require('./web/movies-api');
const config = require('./utils/config');

// This file serves as the main entry point for the server
// It imports and runs the movies-api server

console.log(`Starting Vega Movies API server on http://${config.api.host}:${config.api.port}...`); 