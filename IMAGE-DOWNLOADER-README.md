# Image Downloader for Vega Movies API

This tool downloads movie thumbnails from the database and saves them in a structured folder format. It's **automatically integrated** with the JSON export process for efficient image downloading.

## Features

- ✅ Downloads thumbnails **only for movies being exported** (not all movies)
- ✅ Creates structured folders: `api/img-source/[movie-id]/[movie-title].[ext]`
- ✅ **Human-like delays** (100-300ms between downloads)
- ✅ **Concurrent downloads** (3 at a time for respectful behavior)
- ✅ **Smart skipping** - ignores already downloaded images
- ✅ Handles HTTP/HTTPS redirects automatically
- ✅ Retry mechanism for failed downloads
- ✅ Progress tracking and statistics
- ✅ Graceful error handling
- ✅ Cross-platform compatibility
- ✅ **Integrated with db-to-json.js** for automatic downloads

## File Structure

```
vega-api/
├── src/scripts/
│   └── image-downloader.js    # Main downloader script
├── src/cli/
│   └── db-to-json.js          # JSON exporter (includes image downloads)
├── api/
│   ├── data/                  # JSON export directory
│   └── img-source/            # Image output directory (created automatically)
│       ├── 1/
│       │   └── Movie_Title_1.jpg
│       ├── 2/
│       │   └── Movie_Title_2.png
│       ├── 3/
│       │   └── Movie_Title_3.webp
│       └── ...
└── IMAGE-DOWNLOADER-README.md # This file
```

## Prerequisites

- Node.js installed (version 14 or higher)
- Database with movie data
- Internet connection for downloading images

## Usage

### Single Command (Recommended)

The image downloader is **automatically integrated** with the JSON export process:

```bash
# Run the JSON export (includes image downloads)
node src/cli/db-to-json.js
```

This will:
1. Export all database data to JSON files in chunks
2. **For each chunk**: Download images only for movies in that chunk
3. Skip images that already exist
4. Show progress and statistics for both processes

### How It Works

1. **Chunked Processing**: Movies are processed in chunks of 1000
2. **Selective Downloads**: Images are downloaded only for movies in the current chunk
3. **Smart Skipping**: Already downloaded images are automatically skipped
4. **Efficient**: No redundant downloads or processing

## Configuration

The downloader uses the following configuration (can be modified in `src/scripts/image-downloader.js`):

```javascript
const DOWNLOAD_CONFIG = {
  outputDir: path.join(process.cwd(), 'api', 'img-source'),  // Output directory
  concurrentDownloads: 3,                                     // Concurrent downloads (reduced for human-like behavior)
  retryAttempts: 3,                                           // Retry attempts for failed downloads
  retryDelay: 1000,                                           // Delay between retries (ms)
  timeout: 30000,                                             // Request timeout (ms)
  humanDelay: {                                               // Human-like delays
    min: 100,                                                 // Minimum delay (ms)
    max: 300                                                  // Maximum delay (ms)
  },
  userAgent: 'Mozilla/5.0...'                                // User agent string
};
```

## Output Structure

Images are saved in the following structure:

```
api/img-source/
├── 1/                                    # Movie ID 1
│   └── Movie_Title_1.jpg                 # Thumbnail with movie title
├── 2/                                    # Movie ID 2
│   └── Movie_Title_2.png                 # Thumbnail with movie title
├── 3/                                    # Movie ID 3
│   └── Movie_Title_3.webp                # Thumbnail with movie title
└── ...
```

### File Naming Convention

- **Directory**: Movie ID from database
- **Filename**: Sanitized movie title + original extension
- **Examples**:
  - `1/Avengers_Endgame.jpg`
  - `2/Spider_Man_No_Way_Home.png`
  - `3/The_Batman.webp`

## Human-Like Behavior

The downloader mimics human behavior:

- **Random delays**: 100-300ms between downloads
- **Reduced concurrency**: 3 downloads at a time (instead of 5)
- **Respectful timing**: 1-second delays between batches
- **Natural patterns**: Simulates real user browsing

## How It Works

1. **Database Connection**: Connects to the SQLite database
2. **Chunked Processing**: Processes movies in chunks of 1000
3. **Selective Downloads**: Downloads images only for movies in current chunk
4. **URL Processing**: Converts relative thumbnail paths to full URLs
5. **Directory Creation**: Creates individual folders for each movie
6. **Image Download**: Downloads images with retry logic and human delays
7. **Progress Tracking**: Shows real-time progress and statistics
8. **Error Handling**: Gracefully handles network errors and timeouts

## URL Processing

The script handles various thumbnail URL formats:

- **Full URLs**: `https://vegamovies.yoga/wp-content/uploads/image.jpg`
- **Relative Paths**: `wp-content/uploads/image.jpg`
- **Partial Paths**: `/wp-content/uploads/image.jpg`

All URLs are converted to full URLs using the base domain from the configuration.

## Error Handling

The downloader handles various error scenarios:

- **Network Timeouts**: Retries with exponential backoff
- **HTTP Errors**: Handles 301/302 redirects and other status codes
- **File System Errors**: Creates directories and handles file operations
- **Invalid URLs**: Skips movies with invalid thumbnail URLs
- **Duplicate Downloads**: Skips already downloaded images

## Statistics

After completion, the script displays detailed statistics:

```
============================================================
FINAL IMAGE DOWNLOAD SUMMARY
============================================================
Total images downloaded: 1450
Total images skipped (already exist): 25
Total images failed: 25
Images saved to: api/img-source/
============================================================
```

## Integration with db-to-json.js

The image downloader is **automatically integrated** with the JSON export process:

### Automatic Workflow
1. Run `node src/cli/db-to-json.js`
2. JSON data is exported to `api/data/` in chunks
3. **For each chunk**: Images are downloaded to `api/img-source/`
4. Both processes show progress and statistics

### Benefits
- **Single command**: One command handles both data and images
- **Efficient**: Only downloads images for movies being exported
- **Smart**: Skips already downloaded images
- **Organized**: All output goes to the `api/` directory
- **Respectful**: Human-like delays prevent server overload

## Troubleshooting

### Common Issues

1. **"Node.js not found"**
   - Install Node.js from https://nodejs.org/
   - Ensure Node.js is in your system PATH

2. **"Database connection failed"**
   - Ensure the database file exists
   - Check database permissions
   - Verify database schema

3. **"No movies found"**
   - Ensure the database contains movie data
   - Check if movies have thumbnail information

4. **"Download failed"**
   - Check internet connection
   - Verify the source website is accessible
   - Check if the thumbnail URLs are valid

5. **"Slow downloads"**
   - This is intentional! Human-like delays prevent server overload
   - Adjust `humanDelay` settings if needed
   - Increase `concurrentDownloads` for faster processing (be mindful of server limits)

### Performance Tips

- **For faster downloads**: Increase `concurrentDownloads` (but be respectful)
- **For more human-like behavior**: Keep current settings
- **For server-friendly downloads**: Keep current delays
- **Monitor network usage** during downloads

## API Integration

The image downloader can be used programmatically:

```javascript
const { downloadImagesForMovies } = require('./src/scripts/image-downloader');

// Download images for specific movies
const movies = [
  { id: 123, title: "Movie Title", thumbnail: "wp-content/uploads/image.jpg" }
];

const result = await downloadImagesForMovies(movies);
if (result.success) {
  console.log('Images downloaded successfully:', result.stats);
} else {
  console.error('Download failed:', result.error);
}
```

## License

This tool is part of the Vega Movies API project.

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the console output for error messages
3. Ensure all prerequisites are met
4. Verify the database contains the expected data
5. Check that the source website is accessible 