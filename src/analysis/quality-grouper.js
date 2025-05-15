const fs = require('fs');

// Load the movie data
const movieData = JSON.parse(fs.readFileSync('movie.json', 'utf8'));

// Main function to group movies by quality
function groupMoviesByQuality(movies) {
  // Process each movie to extract and group by quality
  const processedMovies = movies.map(movie => processMovie(movie));
  
  // Create quality-based collections
  const qualityGroups = {
    '4k': [],
    '1080p': [],
    '720p': [],
    '480p': [],
    'other': []
  };
  
  // Organize movies into quality groups
  processedMovies.forEach(movie => {
    // Skip movies with no download links
    if (!movie.qualityDownloads || Object.keys(movie.qualityDownloads).length === 0) {
      return;
    }
    
    // Add to each quality group the movie belongs to
    const qualities = Object.keys(movie.qualityDownloads);
    
    if (qualities.includes('4k') || qualities.includes('2160p')) {
      qualityGroups['4k'].push(movie);
    }
    
    if (qualities.includes('1080p')) {
      qualityGroups['1080p'].push(movie);
    }
    
    if (qualities.includes('720p')) {
      qualityGroups['720p'].push(movie);
    }
    
    if (qualities.includes('480p')) {
      qualityGroups['480p'].push(movie);
    }
    
    // If no standard quality matches, add to 'other'
    if (!qualities.some(q => ['4k', '2160p', '1080p', '720p', '480p'].includes(q))) {
      qualityGroups['other'].push(movie);
    }
  });
  
  return {
    movies: processedMovies,
    qualityGroups
  };
}

// Process a single movie to extract quality information
function processMovie(movie) {
  if (!movie.info || movie.info.length === 0) {
    return {
      ...createBasicMovieObj(movie),
      qualityDownloads: {}
    };
  }
  
  // Process the first info object (most movies only have one)
  let info = movie.info[0];
  
  // Check if info is an array (structure inconsistency)
  if (Array.isArray(info)) {
    info = info[0];
  }
  
  // Extract movie metadata
  const basicMovie = createBasicMovieObj(movie);
  basicMovie.metadata = extractMetadata(info);
  
  // Extract quality-based downloads
  const qualityDownloads = {};
  
  if (info.sections && info.sections.length > 0) {
    info.sections.forEach(section => {
      if (section.links && section.links.length > 0) {
        processLinks(section.links, qualityDownloads);
      }
    });
  }
  
  return {
    ...basicMovie,
    qualityDownloads
  };
}

// Helper to create a basic movie object
function createBasicMovieObj(movie) {
  return {
    title: movie.title,
    url: movie.url,
    thumbnail: movie.thumbnail,
    date: movie.date
  };
}

// Extract metadata from info object
function extractMetadata(info) {
  return {
    imdbRating: info.imdb_rating || '-',
    movieName: info.movie_name || '',
    seriesName: info.series_name || '',
    season: info.season || '',
    episode: info.episode || '',
    releaseYear: info.release_year || '',
    language: info.language || '',
    format: info.format || 'MKV',
    synopsis: (info.synopsis || '').substring(0, 200) + (info.synopsis?.length > 200 ? '...' : ''),
    screenshots: info.screenshots || []
  };
}

// Process links to group by quality
function processLinks(links, qualityDownloads) {
  links.forEach(linkGroup => {
    // Extract quality from link group name
    const quality = extractQuality(linkGroup.name);
    
    if (!quality) return;
    
    // Initialize quality group if it doesn't exist
    if (!qualityDownloads[quality]) {
      qualityDownloads[quality] = [];
    }
    
    // Add link data to the quality group
    if (linkGroup.links && linkGroup.links.length > 0) {
      // Extract encoding and size information
      const encodingInfo = extractEncoding(linkGroup.name);
      const sizeInfo = extractSize(linkGroup.name);
      
      // Create a download option
      const downloadOption = {
        name: linkGroup.name,
        encoding: encodingInfo,
        size: sizeInfo,
        links: linkGroup.links.map(link => ({
          label: link.buttonLabel,
          url: link.link,
          type: getLinkType(link.buttonLabel)
        }))
      };
      
      qualityDownloads[quality].push(downloadOption);
    }
  });
}

// Extract quality from string
function extractQuality(str) {
  if (!str) return null;
  
  const qualityMatch = str.match(/(4k|2160p|1080p|720p|480p)/i);
  return qualityMatch ? qualityMatch[1].toLowerCase() : null;
}

// Extract encoding information
function extractEncoding(str) {
  if (!str) return null;
  
  const encodingMatch = str.match(/(x264|x265|HEVC|H\.264|H\.265|10Bit)/i);
  return encodingMatch ? encodingMatch[1] : null;
}

// Extract size information
function extractSize(str) {
  if (!str) return null;
  
  const sizeMatch = str.match(/\[(\d+(?:\.\d+)?(?:MB|GB))\]/i);
  return sizeMatch ? sizeMatch[1] : null;
}

// Determine link type from button label
function getLinkType(buttonLabel) {
  if (!buttonLabel) return 'unknown';
  
  const label = buttonLabel.toLowerCase();
  if (label.includes('g-direct') || label.includes('gdrive') || label.includes('g-drive')) {
    return 'gdrive';
  } else if (label.includes('v-cloud')) {
    return 'vcloud';
  } else if (label.includes('batch') || label.includes('zip')) {
    return 'batch';
  } else {
    return 'direct';
  }
}

// Run the grouping
const result = groupMoviesByQuality(movieData.movies);

// Write the results to a file
fs.writeFileSync('quality-grouped-movies.json', JSON.stringify(result, null, 2));

// Display summary
console.log('Movies grouped by quality:');
Object.entries(result.qualityGroups).forEach(([quality, movies]) => {
  console.log(`  ${quality}: ${movies.length} movies`);
});

// Count movies with downloads
const moviesWithDownloads = result.movies.filter(m => 
  m.qualityDownloads && Object.keys(m.qualityDownloads).length > 0
).length;

console.log(`\nTotal movies: ${result.movies.length}`);
console.log(`Movies with downloads: ${moviesWithDownloads}`);
console.log(`Movies without downloads: ${result.movies.length - moviesWithDownloads}`);

console.log('\nResults saved to quality-grouped-movies.json'); 