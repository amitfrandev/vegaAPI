const fs = require('fs');

// Load the existing movie data
const movieData = JSON.parse(fs.readFileSync('movie.json', 'utf8'));

// Transform the data structure
function transformMovies(movies) {
  return movies.map(movie => {
    // Skip movies with empty info arrays
    if (!movie.info || movie.info.length === 0) {
      return {
        ...movie,
        info_flattened: null,
        has_downloads: false,
        movie_type: 'unknown',
        quality_options: []
      };
    }

    // Get the first info object (most movies only have one)
    const info = movie.info[0];

    // Determine movie type (movie or series)
    const isMovie = !!info.movie_name;
    const isSeries = !!info.series_name;
    const movieType = isMovie ? 'movie' : isSeries ? 'series' : 'unknown';

    // Extract quality options available and create quality-only links
    const qualityOptions = [];
    let hasDownloads = false;
    const qualityGroups = {};

    if (info.sections && info.sections.length > 0) {
      info.sections.forEach(section => {
        if (section.links && section.links.length > 0) {
          hasDownloads = true;
          
          section.links.forEach(linkGroup => {
            // Extract quality information from the name
            const qualityMatch = linkGroup.name.match(/(480p|720p|1080p)/i);
            const quality = qualityMatch ? qualityMatch[1].toLowerCase() : 'unknown';
            
            if (!qualityOptions.includes(quality)) {
              qualityOptions.push(quality);
            }
            
            // Group links by quality
            if (!qualityGroups[quality]) {
              qualityGroups[quality] = [];
            }
            
            // Add links to the quality group, removing size information
            if (linkGroup.links && linkGroup.links.length > 0) {
              linkGroup.links.forEach(link => {
                qualityGroups[quality].push({
                  url: link.link,
                  label: link.buttonLabel,
                  type: getLinkType(link.buttonLabel)
                });
              });
            }
          });
        }
      });
    }

    // Create a flattened and grouped structure
    return {
      ...movie,
      info_flattened: {
        imdb_rating: info.imdb_rating || '-',
        movie_name: info.movie_name || '',
        series_name: info.series_name || '',
        season: info.season || '',
        episode: info.episode || '',
        release_year: info.release_year || '',
        language: info.language || '',
        format: info.format || 'MKV',
        screenshot_count: (info.screenshots || []).length,
        section_count: (info.sections || []).length
      },
      has_downloads: hasDownloads,
      movie_type: movieType,
      quality_options: qualityOptions.sort(),
      download_by_quality: qualityGroups
    };
  });
}

// Helper function to determine link type based on button label
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

// Transform the data
const transformedMovies = transformMovies(movieData.movies);

// Create grouped data
const groupedData = {
  by_type: {
    movies: transformedMovies.filter(m => m.movie_type === 'movie'),
    series: transformedMovies.filter(m => m.movie_type === 'series'),
    unknown: transformedMovies.filter(m => m.movie_type === 'unknown')
  },
  by_quality: {
    '480p': transformedMovies.filter(m => m.quality_options.includes('480p')),
    '720p': transformedMovies.filter(m => m.quality_options.includes('720p')),
    '1080p': transformedMovies.filter(m => m.quality_options.includes('1080p'))
  },
  by_year: {}
};

// Group by year
transformedMovies.forEach(movie => {
  const year = movie.info_flattened?.release_year || 'unknown';
  if (!groupedData.by_year[year]) {
    groupedData.by_year[year] = [];
  }
  groupedData.by_year[year].push(movie);
});

// Write the output files
fs.writeFileSync('transformed-movies.json', JSON.stringify(transformedMovies, null, 2));
fs.writeFileSync('grouped-movies.json', JSON.stringify(groupedData, null, 2));

console.log(`Transformed ${transformedMovies.length} movies`);
console.log(`Movies: ${groupedData.by_type.movies.length}`);
console.log(`Series: ${groupedData.by_type.series.length}`);
console.log(`Unknown: ${groupedData.by_type.unknown.length}`);
console.log('Grouped by quality:');
console.log(`  480p: ${groupedData.by_quality['480p'].length}`);
console.log(`  720p: ${groupedData.by_quality['720p'].length}`);
console.log(`  1080p: ${groupedData.by_quality['1080p'].length}`);
console.log('Transformation complete. Check transformed-movies.json and grouped-movies.json') 