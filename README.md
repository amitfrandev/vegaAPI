# Vega Movies API

A tool for fetching, indexing and tracking movies from Vega Movies website.

## Setup

1. Install dependencies:
```
npm install
```

2. Create a `.env` file with the following content:
```
API_URL=https://vegamovies.bot
```

## Usage

### Fetch Movies (with suggestions)

To fetch movies with smart suggestions based on history:

```
npm run fetch
```

This will:
- Show you which pages have already been fetched
- Suggest the next range of pages to fetch (continuing from where you left off)
- Process all pages in the specified range
- Track all movies found and save them to the database
- Remember which pages were fetched for future reference

### Update Movies (page 1 only)

To update with only the newest movies from page 1:

```
npm run update
```

This will:
- Process only page 1 without any prompts
- Find and download only new movies not already in the database
- Update tracking information
- Mark page 1 as fetched in the persistent tracking

You can also use the `update.bat` file by double-clicking it.

### Managing Fetched Pages

To view and manage which pages have been fetched:

```
npm run pages [command]
```

Available commands:
- `list` - List all fetched pages and get suggestions (default)
- `add <page>` - Mark a page as fetched
- `remove <page>` - Remove a page from the fetched list
- `clear` - Clear all fetched pages history

### Managing Tracking Data

To view and manage tracking information:

```
npm run track [command]
```

Available commands:
- `status` - Display current tracking status (default)
- `reset` - Reset ALL tracking system to initial state (including fetched pages history)
- `reset-session` - Reset ONLY current session tracking (preserves fetched pages history)
- `repair` - Repair inconsistencies in tracking data
- `sync` - Synchronize tracking with database

You can also use the shortcut command:
```
npm run reset-session
```
This will reset the current session tracking while preserving your fetched pages history, giving you a fresh start without losing your progress.

### Other Commands

- `npm run not-fetched` - View and manage movies that failed to save to the database
- `npm run generate` - Generate statistics and reports

## Data Storage

All data is stored in the `output` directory:
- SQLite database: `output/db/movies.db`
- JSON files: `output/json/movies.json` and `output/json/status.json`
- Not fetched movies: `output/json/notfetched.json`
- Fetched pages: `output/json/pages/fetched.json`

## Tracking System

The tracking system monitors:
- Pages indexed
- Movies found per page
- Movies processed
- Movies saved to database
- Movies that failed to save

The persistent page tracking system:
- Maintains history across sessions
- Suggests the next range of pages to fetch
- Shows which pages have already been processed
- Helps avoid duplicate work

You can view the current status by running `npm run track` and manage fetched pages with `npm run pages`.

## Project Structure

The project is organized into the following directories:

```
./
├── src/             # Source code
│   ├── cli/         # Command-line tools
│   ├── web/         # Web API and frontend
│   ├── db/          # Database access layer
│   ├── utils/       # Utility functions
│   └── analysis/    # Data analysis tools
│
├── output/          # Generated data files
│   ├── movie.json
│   ├── transformed-movies.json
│   ├── quality-patterns.json
│   └── quality-grouped-movies.json
│
├── docs/            # Documentation
│   ├── next-js-startup.md  # Guide for Next.js frontend
│   └── note.md             # Additional notes
│
└── trash/           # Archived or unused files
```

## Getting Started

### Using NPM Scripts

The easiest way to run the application is with the included npm scripts:

```
npm start           # Start the API server
npm run cli         # Run the main CLI tool
npm run query       # Run database query
npm run reset-db    # Reset the database
npm run generate    # Generate output files from analysis
npm run test-create # Test movie creation
npm run test-parser # Test HTML parser
```

### Direct Node Commands

Alternatively, you can use direct node commands:

1. Navigate to the project root directory
2. Run the desired command:
   ```
   node src/web/api.js           # Start API server
   node src/cli/index.js         # Run CLI
   node src/utils/generate-output.js # Generate output files
   ```

3. Access the API at: http://localhost:3000

## Features

* RESTful API for movie data
* Quality analysis and grouping
* Download link extraction
* Web interface for browsing movies

## Deploying to Vercel

This API has been optimized to work with Vercel's serverless functions. To deploy:

### Method 1: Using JSON for Serverless Deployment (Recommended)

Since SQLite databases don't work well in the Vercel serverless environment, we've created a JSON-based approach:

1. **Export Database to JSON**:
   ```
   npm run export-db
   ```
   This will convert your SQLite database to JSON files in the `api/data` directory.

2. **Prepare for Deployment**:
   ```
   npm run vercel-prepare
   ```
   This runs the export and build scripts to prepare your app for Vercel.

3. **Deploy to Vercel**:
   - Push your code to GitHub
   - Import the repository in Vercel
   - Set the output directory to `/api`
   - Vercel will automatically deploy your API

4. **Updating Data**:
   - When your movie data changes, run `npm run export-db` again
   - Commit and push the changes
   - Vercel will redeploy with the updated data

### Method 2: Traditional SQLite Deployment (Not Recommended)

This method is only included for reference and is **not recommended** as it will likely fail on Vercel:

1. **Push to GitHub**: Ensure your code is pushed to a GitHub repository.

2. **Connect to Vercel**:
   - Log in to [Vercel](https://vercel.com)
   - Click "Import Project"
   - Choose your Git repository
   - Select "Import"

3. **Configure the Project**:
   - Vercel will auto-detect the Node.js project
   - Set the output directory to `/api`
   - Add the following environment variables:
     - `NODE_ENV`: `production`
     - `DB_PATH`: `output/db/movies.db`

4. **Deploy**:
   - Click "Deploy"
   - Vercel will build and deploy your API

### Important Notes for Vercel Deployment

- The JSON-based approach allows read-only access to your data without SQLite compatibility issues
- All data must be exported before deployment
- The serverless function size limit may be an issue for very large databases (>50MB)
- For very large datasets, consider using a proper cloud database service

## Troubleshooting

### Module Not Found Errors

If you encounter "Cannot find module" errors, this is likely due to paths that need updating after the restructuring:

1. Run the path update utility:
   ```
   node src/utils/update-paths.js
   ```

2. Check the specific file with the error and update any require statements to point to the correct location:
   - `./file.js` → For files in the same directory
   - `../directory/file.js` → For files in other directories

3. Common path patterns:
   - Database: `../db/db`
   - Utils: `../utils/configName`
   - Web components: `../web/componentName`

## Documentation

For detailed documentation:
- [Source code details](src/README_DETAIL.md)
- [Next.js frontend setup](docs/next-js-startup.md)
- [Additional notes](docs/note.md) 