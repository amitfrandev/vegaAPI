/**
 * Cross-platform build preparation script
 * This script creates necessary directories and copies files for Vercel deployment
 */

const fs = require('fs');
const path = require('path');

console.log('Preparing build for Vercel deployment...');

// Create api directory if it doesn't exist
const apiDir = path.join(process.cwd(), 'api');
if (!fs.existsSync(apiDir)) {
  fs.mkdirSync(apiDir, { recursive: true });
  console.log('Created api directory');
}

// Create data directory if it doesn't exist
const dataDir = path.join(apiDir, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('Created api/data directory');
}

// Copy output directory files (if needed for backward compatibility)
// This is actually not needed since we're using the json-db approach
// But keep it for compatibility with any scripts that might expect it
const outputDir = path.join(process.cwd(), 'output');
if (fs.existsSync(outputDir)) {
  console.log('Copying output directory to api...');
  
  // Create output directory in api if it doesn't exist
  const apiOutputDir = path.join(apiDir, 'output');
  if (!fs.existsSync(apiOutputDir)) {
    fs.mkdirSync(apiOutputDir, { recursive: true });
  }
  
  // Function to recursively copy directory
  function copyDir(src, dest) {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        if (!fs.existsSync(destPath)) {
          fs.mkdirSync(destPath, { recursive: true });
        }
        copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
  
  // Copy only necessary subdirectories to minimize size
  const dbDir = path.join(outputDir, 'db');
  if (fs.existsSync(dbDir)) {
    const apiDbDir = path.join(apiOutputDir, 'db');
    if (!fs.existsSync(apiDbDir)) {
      fs.mkdirSync(apiDbDir, { recursive: true });
    }
    
    // Just create a placeholder file to keep the directory structure
    fs.writeFileSync(
      path.join(apiDbDir, 'README.txt'), 
      'Database files are moved to JSON format in api/data directory'
    );
  }
}

console.log('Build preparation completed successfully!'); 