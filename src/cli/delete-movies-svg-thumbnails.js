const sqlite3 = require('sqlite3').verbose();
const config = require('../utils/config');

const dbPath = config.db.path;
const db = new sqlite3.Database(dbPath);

const query = `
DELETE FROM movies
WHERE thumbnail LIKE 'data:image/svg+xml%';
`;

db.run(query, function(err) {
  if (err) {
    console.error('Error deleting movies:', err.message);
  } else {
    console.log(`Deleted ${this.changes} movies with SVG thumbnails.`);
  }
  db.close();
}); 