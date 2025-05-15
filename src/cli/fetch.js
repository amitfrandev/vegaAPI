const readline = require('readline');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('../utils/config');
const track = require('../utils/track');
const logger = require('../utils/logger');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Fallback function for getting suggested pagination range
async function getSuggestedPaginationRange() {
  try {
    const trackingDir = path.join(config.paths.output, 'tracking');
    const trackingFile = path.join(trackingDir, 'fetched-pages.json');
    
    // Default suggestion
    const defaultSuggestion = {
      startPage: 1,
      endPage: 5,
      fetchedPages: []
    };
    
    // If tracking directory doesn't exist, return default
    if (!fs.existsSync(trackingDir)) {
      return defaultSuggestion;
    }
    
    // If tracking file exists, read it
    if (fs.existsSync(trackingFile)) {
      const data = JSON.parse(fs.readFileSync(trackingFile, 'utf-8'));
      const fetchedPages = data.fetchedPages || [];
      
      if (fetchedPages.length > 0) {
        // Find the highest page number that has been fetched
        const highestPage = Math.max(...fetchedPages);
        
        // Suggest starting from the next page
        return {
          startPage: highestPage + 1,
          endPage: highestPage + 5,
          fetchedPages
        };
      }
    }
    
    return defaultSuggestion;
  } catch (error) {
    console.error(`Error getting suggested pagination range: ${error.message}`);
    return {
      startPage: 1,
      endPage: 5,
      fetchedPages: []
    };
  }
}

async function main() {
  try {
    console.log('\n=== Vega Movies Fetcher ===');
    
    // Get suggested pagination range
    let suggestion;
    if (typeof track.getSuggestedPaginationRange === 'function') {
      suggestion = await track.getSuggestedPaginationRange();
    } else {
      console.log('Using built-in function for pagination suggestions');
      suggestion = await getSuggestedPaginationRange();
    }
    
    console.log('\nPlease enter your preferences:');
    
    // Ask for start page
    rl.question(`Enter start page [default: ${suggestion.startPage}]: `, (startPageInput) => {
      const startPage = startPageInput.trim() === '' ? suggestion.startPage : parseInt(startPageInput, 10);
      
      if (isNaN(startPage)) {
        console.error('Error: Start page must be a valid number');
        rl.close();
        return;
      }
      
      // Now ask for end page
      rl.question(`Enter end page [default: ${suggestion.endPage}]: `, (endPageInput) => {
        const endPage = endPageInput.trim() === '' ? suggestion.endPage : parseInt(endPageInput, 10);
        
        if (isNaN(endPage)) {
          console.error('Error: End page must be a valid number');
          rl.close();
          return;
        }
        
        console.log(`\nSelected range: pages ${startPage} to ${endPage}`);
        
        // Ask for confirmation
        rl.question('Do you want to continue? (y/n): ', (answer) => {
          if (answer.toLowerCase() !== 'y') {
            console.log('Aborting fetch operation.');
            rl.close();
            return;
          }
          
          console.log('\nNote: Movies that already exist in the database will be skipped automatically to reduce server load.');
          launchFetch(startPage, endPage);
        });
      });
    });
  } catch (error) {
    console.error('Error in fetch:', error.message);
    rl.close();
  }
}

function launchFetch(startPage, endPage) {
  console.log(`\nStarting fetch process with pages ${startPage} to ${endPage}...`);
  
  // Close the readline interface
  rl.close();
  
  // Launch the index.js script with the page parameters
  const indexPath = path.join(__dirname, 'index.js');
  
  // Pass the page parameters as environment variables
  const env = {
    ...process.env,
    FETCH_START_PAGE: startPage.toString(),
    FETCH_END_PAGE: endPage.toString()
  };
  
  // Spawn the index.js process
  const child = spawn('node', [indexPath], {
    stdio: 'inherit',
    env: env,
    shell: true
  });
  
  // Handle process exit
  child.on('close', (code) => {
    if (code !== 0) {
      console.error(`Process exited with code ${code}`);
    }
  });
  
  // Handle process errors
  child.on('error', (err) => {
    console.error('Failed to start process:', err);
  });
}

// Run the main function
main(); 