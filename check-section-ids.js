// Check that section IDs are being correctly handled after database migration
const db = require('./src/db/db');

async function checkSectionIds() {
  try {
    console.log('Checking section IDs in migrated database...');
    console.log('Database path:', require('./src/utils/config').db.path);
    
    // First get all movies to find some with sections
    console.log('Searching for movies with sections...');
    
    // Get a larger sample to find movies with sections
    const result = await db.getAllMovies(1, 100);
    console.log(`Retrieved ${result.movies.length} movies from database`);
    
    // Filter movies that have sections
    const moviesWithSections = result.movies.filter(movie => 
      movie.info && 
      movie.info.length > 0 && 
      movie.info[0].sections && 
      movie.info[0].sections.length > 0
    );
    
    console.log(`Found ${moviesWithSections.length} movies with sections`);
    
    if (moviesWithSections.length === 0) {
      console.log('No movies with sections found. Creating a test movie with sections...');
      
      // Create a test movie with sections if none exist
      const testMovie = {
        title: "Test Movie With Sections",
        url: "https://example.com/test-movie-" + Date.now(),
        thumbnail: "https://example.com/test-movie.jpg",
        date: new Date().toISOString(),
        info: [{
          movie_name: "Test Movie",
          release_year: "2023",
          language: "English",
          sections: [
            { heading: "Section 1", links: [] },
            { heading: "Section 2", links: [] },
            { heading: "Section 3", links: [] }
          ]
        }],
        tags: ["test", "sections"]
      };
      
      console.log('Saving test movie...');
      await db.saveMovie(testMovie, { forceUpdate: true });
      console.log('Test movie saved');
      
      // Fetch the saved movie
      const savedMovie = await db.getMovieByUrl(testMovie.url);
      if (savedMovie) {
        moviesWithSections.push(savedMovie);
        console.log('Test movie retrieved and added to test set');
      } else {
        console.error('Failed to retrieve the saved test movie');
      }
    }
    
    if (moviesWithSections.length === 0) {
      console.error('No movies with sections available for testing.');
      return;
    }
    
    // Check section IDs
    console.log('\n--- CHECKING SECTION IDs ---');
    let sectionCount = 0;
    let sectionsWithIds = 0;
    
    for (const movie of moviesWithSections.slice(0, 5)) { // Limit to 5 movies for clarity
      console.log(`\nMovie: ${movie.title} (ID: ${movie.id})`);
      
      const sections = movie.info[0].sections;
      sectionCount += sections.length;
      
      console.log(`Found ${sections.length} sections:`);
      
      sections.forEach((section, index) => {
        if (section.id) {
          sectionsWithIds++;
          console.log(`  ${index+1}. "${section.heading}" - Has ID: ${section.id}`);
        } else {
          console.log(`  ${index+1}. "${section.heading}" - MISSING ID!`);
        }
      });
    }
    
    // Print summary
    console.log('\n--- SUMMARY ---');
    console.log(`Movies with sections checked: ${Math.min(5, moviesWithSections.length)}`);
    console.log(`Total sections: ${sectionCount}`);
    console.log(`Sections with IDs: ${sectionsWithIds}`);
    
    if (sectionCount === sectionsWithIds) {
      console.log('\n✅ SUCCESS: All sections have IDs!');
    } else {
      console.log(`\n❌ ERROR: ${sectionCount - sectionsWithIds} sections are missing IDs.`);
    }
    
    // Test updating a movie
    if (moviesWithSections.length > 0) {
      const testMovie = moviesWithSections[0];
      
      console.log('\n--- TESTING UPDATE ---');
      console.log(`Testing update of movie: ${testMovie.title}`);
      
      // Store original section IDs
      const originalSections = testMovie.info[0].sections;
      const originalIds = originalSections.map(s => ({ heading: s.heading, id: s.id }));
      
      console.log('Original section IDs:');
      originalIds.forEach(s => console.log(`  - "${s.heading}": ${s.id}`));
      
      // Create a copy of the movie to update
      const movieToUpdate = {
        ...testMovie,
        tags: [...(testMovie.tags || []), 'test-tag-' + Date.now()]  // Add a unique test tag to force update
      };
      
      // Save the movie
      console.log('Updating movie...');
      await db.saveMovie(movieToUpdate, { forceUpdate: true });
      
      // Fetch the updated movie
      console.log('Fetching updated movie...');
      const updatedMovie = await db.getMovieByUrl(testMovie.url);
      
      if (!updatedMovie) {
        console.error('Failed to retrieve updated movie!');
        return;
      }
      
      // Check if section IDs were preserved
      console.log('Checking if section IDs were preserved...');
      const updatedSections = updatedMovie.info[0].sections;
      let idsPreserved = true;
      
      originalIds.forEach(original => {
        const matchingSection = updatedSections.find(s => s.heading === original.heading);
        if (matchingSection) {
          const preserved = matchingSection.id === original.id;
          console.log(`  - "${original.heading}": ${preserved ? '✅ Preserved' : '❌ Changed'} (${original.id} -> ${matchingSection.id})`);
          if (!preserved) idsPreserved = false;
        } else {
          console.log(`  - "${original.heading}": ❌ Section not found in updated movie`);
          idsPreserved = false;
        }
      });
      
      if (idsPreserved) {
        console.log('\n✅ SUCCESS: All section IDs were preserved during update!');
      } else {
        console.log('\n❌ ERROR: Some section IDs were not preserved during update.');
      }
    }
    
  } catch (error) {
    console.error('Error checking section IDs:', error);
    console.error(error.stack);
  } finally {
    console.log('Closing database connection...');
    await db.closeDatabase();
    console.log('Database connection closed.');
  }
}

// Run the check
checkSectionIds()
  .then(() => console.log('Check completed'))
  .catch(err => console.error('Unhandled error:', err)); 