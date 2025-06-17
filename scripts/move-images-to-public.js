const fs = require('fs');
const path = require('path');

console.log('Moving images to public directory for Vercel deployment...');

const sourceDir = path.join(process.cwd(), 'api', 'data', 'img-source');
const targetDir = path.join(process.cwd(), 'public', 'data', 'img-source');

// Create target directory if it doesn't exist
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log(`Created directory: ${targetDir}`);
}

// Function to copy directory recursively
function copyDirectory(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const items = fs.readdirSync(source);
  
  for (const item of items) {
    const sourcePath = path.join(source, item);
    const targetPath = path.join(target, item);
    
    const stats = fs.statSync(sourcePath);
    
    if (stats.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else {
      // Only copy image files and text files (not other files)
      const ext = path.extname(item).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.txt'].includes(ext)) {
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`Copied: ${item}`);
      }
    }
  }
}

// Check if source directory exists
if (!fs.existsSync(sourceDir)) {
  console.log('Source directory does not exist. Nothing to move.');
  process.exit(0);
}

try {
  copyDirectory(sourceDir, targetDir);
  console.log('✅ Successfully moved images to public directory!');
  console.log(`Source: ${sourceDir}`);
  console.log(`Target: ${targetDir}`);
} catch (error) {
  console.error('❌ Error moving images:', error);
  process.exit(1);
} 