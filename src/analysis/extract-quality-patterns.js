const fs = require('fs');

// Load the movie data
const movieData = JSON.parse(fs.readFileSync('movie.json', 'utf8'));

// Extract and analyze quality patterns
function analyzeQualityPatterns(movies) {
  const qualityPatterns = {};
  const formatPatterns = {};
  const sizePatterns = {};
  const encodingPatterns = {};

  movies.forEach(movie => {
    if (!movie.info || !movie.info.length) return;
    
    // Process each info object
    movie.info.forEach(info => {
      // Process each section
      if (info.sections) {
        info.sections.forEach(section => {
          if (section.links) {
            section.links.forEach(linkGroup => {
              // Extract patterns from link group name
              const name = linkGroup.name || '';
              
              // Quality patterns (480p, 720p, 1080p, etc.)
              const qualityMatch = name.match(/(480p|720p|1080p|2160p|4K|HD|SD)/gi);
              if (qualityMatch) {
                qualityMatch.forEach(quality => {
                  const normalizedQuality = quality.toLowerCase();
                  qualityPatterns[normalizedQuality] = (qualityPatterns[normalizedQuality] || 0) + 1;
                });
              }
              
              // Format patterns (MKV, MP4, etc.)
              const formatMatch = name.match(/(MKV|MP4|AVI|WMV|FLV|WebM)/gi);
              if (formatMatch) {
                formatMatch.forEach(format => {
                  const normalizedFormat = format.toLowerCase();
                  formatPatterns[normalizedFormat] = (formatPatterns[normalizedFormat] || 0) + 1;
                });
              }
              
              // Size patterns (MB, GB)
              const sizeMatch = name.match(/\[(\d+(?:\.\d+)?(?:MB|GB))\]/i);
              if (sizeMatch && sizeMatch[1]) {
                sizePatterns[sizeMatch[1]] = (sizePatterns[sizeMatch[1]] || 0) + 1;
              }
              
              // Encoding patterns (x264, x265, HEVC, etc.)
              const encodingMatch = name.match(/(x264|x265|HEVC|H\.264|H\.265|10Bit)/gi);
              if (encodingMatch) {
                encodingMatch.forEach(encoding => {
                  const normalizedEncoding = encoding.toLowerCase();
                  encodingPatterns[normalizedEncoding] = (encodingPatterns[normalizedEncoding] || 0) + 1;
                });
              }
            });
          }
        });
      }
    });
  });

  return {
    qualityPatterns: sortByFrequency(qualityPatterns),
    formatPatterns: sortByFrequency(formatPatterns),
    sizePatterns: sortByFrequency(sizePatterns),
    encodingPatterns: sortByFrequency(encodingPatterns)
  };
}

// Helper function to sort pattern objects by frequency
function sortByFrequency(patternObj) {
  return Object.entries(patternObj)
    .sort((a, b) => b[1] - a[1])
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
}

// Perform the analysis
const patterns = analyzeQualityPatterns(movieData.movies);

// Write the results to a file
fs.writeFileSync('quality-patterns.json', JSON.stringify(patterns, null, 2));

// Display summary
console.log('Quality patterns analysis complete');
console.log('\nCommon Quality Formats:');
Object.entries(patterns.qualityPatterns).slice(0, 5).forEach(([quality, count]) => {
  console.log(`  ${quality}: ${count} occurrences`);
});

console.log('\nCommon Encodings:');
Object.entries(patterns.encodingPatterns).slice(0, 5).forEach(([encoding, count]) => {
  console.log(`  ${encoding}: ${count} occurrences`);
});

console.log('\nResults saved to quality-patterns.json'); 