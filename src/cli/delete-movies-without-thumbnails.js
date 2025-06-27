const sqlite3 = require('sqlite3').verbose();
const config = require('../utils/config');

const dbPath = config.db.path;
const db = new sqlite3.Database(dbPath);

const query = `
DELETE FROM movies
WHERE
  thumbnail IS NULL
  OR thumbnail = ''
  OR thumbnail LIKE 'data:image/svg+xml%'
  OR thumbnail NOT LIKE '%/wp-content/%'
  OR (
    thumbnail NOT LIKE '%.jpg' 
    AND thumbnail NOT LIKE '%.jpeg' 
    AND thumbnail NOT LIKE '%.png' 
    AND thumbnail NOT LIKE '%.webp'
  );
`;

db.run(query, function(err) {
  if (err) {
    console.error('Error deleting movies:', err.message);
  } else {
    console.log(`Deleted ${this.changes} movies with invalid thumbnails.`);
  }
  db.close();
}); 