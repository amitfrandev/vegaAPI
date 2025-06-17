const fs = require('fs');
const path = require('path');

console.log('Cleaning up old images from api/data/img-source/...');

const oldImgSourceDir = path.join(process.cwd(), 'api', 'data', 'img-source');
const newImgSourceDir = path.join(process.cwd(), 'public', 'data', 'img-source');

// Check if new directory exists and has images
if (!fs.existsSync(newImgSourceDir)) {
  console.log('❌ New images directory does not exist. Please run "npm run build" first.');
  process.exit(1);
}

// Count images in new directory
let newImageCount = 0;
function countImages(dir) {
  if (!fs.existsSync(dir)) return;
  
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stats = fs.statSync(itemPath);
    
    if (stats.isDirectory()) {
      countImages(itemPath);
    } else {
      const ext = path.extname(item).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.txt'].includes(ext)) {
        newImageCount++;
      }
    }
  }
}

countImages(newImgSourceDir);
console.log(`✅ Found ${newImageCount} images in public/data/img-source/`);

// Check if old directory exists
if (!fs.existsSync(oldImgSourceDir)) {
  console.log('✅ Old images directory does not exist. Nothing to clean up.');
  process.exit(0);
}

// Count images in old directory
let oldImageCount = 0;
function countOldImages(dir) {
  if (!fs.existsSync(dir)) return;
  
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stats = fs.statSync(itemPath);
    
    if (stats.isDirectory()) {
      countOldImages(itemPath);
    } else {
      const ext = path.extname(item).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.txt'].includes(ext)) {
        oldImageCount++;
      }
    }
  }
}

countOldImages(oldImgSourceDir);
console.log(`📊 Found ${oldImageCount} images in api/data/img-source/`);

// Ask for confirmation
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question(`\n⚠️  This will delete ${oldImageCount} images from api/data/img-source/\nAre you sure you want to continue? (y/N): `, (answer) => {
  rl.close();
  
  if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
    console.log('❌ Cleanup cancelled.');
    process.exit(0);
  }
  
  // Remove old images directory
  try {
    console.log('\n🗑️  Removing old images...');
    
    function removeDirectory(dir) {
      if (!fs.existsSync(dir)) return;
      
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stats = fs.statSync(itemPath);
        
        if (stats.isDirectory()) {
          removeDirectory(itemPath);
        } else {
          fs.unlinkSync(itemPath);
          console.log(`Deleted: ${item}`);
        }
      }
      
      fs.rmdirSync(dir);
    }
    
    removeDirectory(oldImgSourceDir);
    
    console.log('✅ Successfully cleaned up old images!');
    console.log(`📊 Removed ${oldImageCount} images from api/data/img-source/`);
    console.log(`📊 ${newImageCount} images remain in public/data/img-source/`);
    console.log('\n💡 Your function bundle size should now be much smaller!');
    
  } catch (error) {
    console.error('❌ Error cleaning up old images:', error);
    process.exit(1);
  }
}); 