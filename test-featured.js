const http = require('http');

function testFeaturedAPI() {
  console.log('Testing Featured API...');
  
  const options = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/featured?limit=5',
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const response = JSON.parse(data);
        
        if (response.success) {
          console.log('✅ Featured API is working!');
          console.log(`Total items: ${response.data.totalItems}`);
          console.log(`Items returned: ${response.data.items.length}`);
          
          if (response.data.items.length > 0) {
            console.log('\nFirst 3 featured movies:');
            response.data.items.slice(0, 3).forEach((movie, index) => {
              const releaseYear = movie.release_year || 'N/A';
              const imdbRating = movie.info?.[0]?.imdb_rating || 'N/A';
              const date = new Date(movie.date).toLocaleDateString();
              
              console.log(`${index + 1}. ${movie.title}`);
              console.log(`   Year: ${releaseYear}, IMDB: ${imdbRating}, Date: ${date}`);
            });
          }
          
          // Check if movies are from last 6 months
          const sixMonthsAgo = new Date();
          sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
          
          const recentMovies = response.data.items.filter(movie => {
            const movieDate = new Date(movie.date);
            return movieDate >= sixMonthsAgo;
          });
          
          console.log(`\n📅 Movies from last 6 months: ${recentMovies.length}/${response.data.items.length}`);
          
          // Check IMDB ratings
          const highRatedMovies = response.data.items.filter(movie => {
            const rating = parseFloat(movie.info?.[0]?.imdb_rating?.split('/')[0]) || 0;
            return rating >= 6.0;
          });
          
          console.log(`⭐ Movies with IMDB >= 6.0: ${highRatedMovies.length}/${response.data.items.length}`);
          
        } else {
          console.log('❌ Featured API returned error:', response.error);
        }
        
      } catch (error) {
        console.error('❌ Error parsing response:', error.message);
        console.log('Raw response:', data.substring(0, 200) + '...');
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Error testing Featured API:', error.message);
  });

  req.end();
}

testFeaturedAPI(); 