/**
 * Fetch Categories CLI
 * This script checks if categories exist in the database
 * If not, it loads them from static_data/categories.json
 */

const fs = require('fs');
const path = require('path');
const db = require('../db/db');
const config = require('../utils/config');

// Log function with timestamp
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// Check if categories exist in the database
async function checkCategoriesExist() {
  try {
    const categories = await db.getCategorySitemap();
    if (categories && 
        categories.categories && 
        Object.keys(categories.categories).length > 0) {
      return {
        exists: true,
        count: Object.keys(categories.categories).length
      };
    }
    return { exists: false, count: 0 };
  } catch (error) {
    log(`Error checking categories: ${error.message}`);
    return { exists: false, error };
  }
}

// Load categories from static file
function loadStaticCategories() {
  try {
    const staticFilePath = path.join(process.cwd(), 'static_data', 'categories.json');
    log(`Loading categories from ${staticFilePath}`);
    
    if (!fs.existsSync(staticFilePath)) {
      log('Static categories file not found!');
      return null;
    }
    
    const data = fs.readFileSync(staticFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    log(`Error loading static categories: ${error.message}`);
    return null;
  }
}

// Save categories to the database
async function saveCategoriesFromStatic(staticData) {
  try {
    log('Saving categories to database...');
    const result = await db.saveCategorySitemap(staticData);
    if (result) {
      log('Categories saved successfully!');
      return true;
    }
    log('Failed to save categories');
    return false;
  } catch (error) {
    log(`Error saving categories: ${error.message}`);
    return false;
  }
}

// Main function
async function main() {
  try {
    log('=== Vega Categories Manager ===');
    
    // Initialize database
    await db.initializeDatabase();
    log('Database initialized');
    
    // Check if categories exist
    const checkResult = await checkCategoriesExist();
    
    if (checkResult.exists) {
      log(`Categories already exist in database (${checkResult.count} category types)`);
      
      // Check if --force flag is provided to overwrite
      if (process.argv.includes('--force')) {
        log('Force flag detected, will overwrite existing categories');
      } else {
        log('Use --force flag to overwrite existing categories');
        return;
      }
    } else {
      log('No categories found in database, will create from static file');
    }
    
    // Load from static file
    const staticCategories = loadStaticCategories();
    if (!staticCategories) {
      log('Failed to load static categories, aborting');
      return;
    }
    
    log(`Loaded static categories with ${staticCategories.totalCategories} entries across ${Object.keys(staticCategories.categories).length} types`);
    
    // Format category data
    Object.keys(staticCategories.categories).forEach(type => {
      const category = staticCategories.categories[type];
      log(`Category: ${type} - ${category.slugs.length} slugs`);
    });
    
    // Save to database
    const saved = await saveCategoriesFromStatic(staticCategories);
    
    if (saved) {
      // Verify the save worked by fetching categories again
      const verification = await checkCategoriesExist();
      if (verification.exists) {
        log(`Categories successfully saved and verified (${verification.count} types)`);
      } else {
        log('Warning: Categories were saved but could not be verified');
      }
    } else {
      log('Failed to save categories to database');
    }
    
  } catch (error) {
    log(`Error in main process: ${error.message}`);
  } finally {
    // Close database connection
    await db.closeDatabase();
  }
}

// Run the script
main(); 