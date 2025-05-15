/**
 * Utility script to generate all output files
 * 
 * This script runs all the analysis tools and generates the output files
 * in the correct location.
 */

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// Determine the project root
const projectRoot = path.resolve(__dirname, '../..');
const outputDir = path.join(projectRoot, 'output');
const analysisDir = path.join(projectRoot, 'src', 'analysis');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
  console.log(`Created output directory: ${outputDir}`);
}

// Map of analysis scripts to their output files
const analysisScripts = [
  {
    script: 'transform-movie-data.js',
    outputFiles: ['transformed-movies.json', 'grouped-movies.json']
  },
  {
    script: 'quality-grouper.js',
    outputFiles: ['quality-grouped-movies.json']
  },
  {
    script: 'extract-quality-patterns.js',
    outputFiles: ['quality-patterns.json']
  }
];

// Run each analysis script
async function runAnalysis() {
  for (const analysis of analysisScripts) {
    console.log(`\nRunning analysis: ${analysis.script}`);
    
    // Execute the script
    const scriptPath = path.join(analysisDir, analysis.script);
    
    try {
      // Run the script
      await new Promise((resolve, reject) => {
        exec(`node "${scriptPath}"`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error executing ${analysis.script}:`, error);
            return reject(error);
          }
          console.log(stdout);
          if (stderr) console.error(stderr);
          resolve();
        });
      });
      
      // Move output files to the output directory
      for (const outputFile of analysis.outputFiles) {
        const srcFile = path.join(projectRoot, outputFile);
        const destFile = path.join(outputDir, outputFile);
        
        // Check if the output file was created
        if (fs.existsSync(srcFile)) {
          try {
            // Copy to output directory
            fs.copyFileSync(srcFile, destFile);
            console.log(`Moved ${outputFile} to output directory`);
            
            // Remove the original file
            fs.unlinkSync(srcFile);
          } catch (err) {
            console.error(`Error moving ${outputFile}:`, err);
          }
        } else {
          console.warn(`Warning: Expected output file ${outputFile} was not created`);
        }
      }
      
    } catch (err) {
      console.error(`Failed to run ${analysis.script}:`, err);
    }
  }
}

// Run all analyses
console.log('Starting analysis and output generation...');
runAnalysis()
  .then(() => {
    console.log('\nAll analyses completed. Output files are in:', outputDir);
  })
  .catch(err => {
    console.error('Error running analyses:', err);
    process.exit(1);
  }); 