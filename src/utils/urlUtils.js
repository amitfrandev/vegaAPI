/**
 * URL utility functions for consistent handling across the application
 * 
 * URL Format Notes:
 * - Database may contain URLs with trailing slashes (e.g., "download-netflix-criminal-code-2023-season-1-hindi-dubbed-org/")
 * - The normalizeUrl function removes trailing slashes for consistent matching
 * - When querying by URL, always use normalizeUrl or getUrlMatchCondition to ensure matches regardless of slashes
 */

/**
 * Normalize URL for database matching
 * @param {string} url - URL to normalize
 * @returns {string} - Normalized URL
 */
function normalizeUrl(url) {
  if (!url) return '';
  try {
    // Step 1: Remove protocol and domain if present
    let normalized = url.replace(/^https?:\/\/[^\/]+\//, '');
    
    // Step 2: URL-decode to handle encoded characters
    normalized = decodeURIComponent(normalized);
    
    // Step 3: Remove trailing slash if present
    normalized = normalized.replace(/\/$/, '');
    
    return normalized;
  } catch (error) {
    console.error(`Error normalizing URL: ${error.message}`);
    return url;
  }
}

/**
 * Get SQL WHERE condition for URL matching
 * @param {string} urlFieldName - Name of the URL field in the database
 * @param {string} paramPlaceholder - Placeholder character (e.g., "?")
 * @returns {string} - SQL WHERE condition
 */
function getUrlMatchCondition(urlFieldName = 'url', paramPlaceholder = '?') {
  return `REPLACE(${urlFieldName}, '/', '') = REPLACE(${paramPlaceholder}, '/', '')`;
}

module.exports = {
  normalizeUrl,
  getUrlMatchCondition
}; 