const got = require('got');
const config = require('./config');
// Add delay function with configurable times
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Session management
let sessionData = {
  cookies: config.api.cookies,
  lastVisit: null,
  visitCount: 0
};

// Function to get content with got
async function getContentWithGot(url, options = {}) {
  try {
    // Determine delay based on URL type using config values
    let delayConfig;
    if (url.includes('page/')) {
      // Longer delay for page navigation
      delayConfig = config.delays.pageNavigation;
    } else if (url.includes('download-')) {
      // Medium delay for movie details
      delayConfig = config.delays.movieDetails;
    } else if (url.includes('nexdrive.lol')) {
      // Shorter delay for nexdrive links
      delayConfig = config.delays.nexdriveLinks;
    } else {
      // Default delay
      delayConfig = config.delays.default;
    }

    // Calculate delay time based on config (min + random range)
    const delayTime = delayConfig.min + Math.floor(Math.random() * delayConfig.range);
    
    console.log(`[${new Date().toISOString()}] Waiting ${delayTime}ms before fetching ${url}...`);
    await delay(delayTime);

    console.log('Attempting to fetch URL:', url);
    console.log('Using cookies:', sessionData.cookies ? 'Cookies present' : 'No cookies');

    const response = await got(url, {
      headers: {
        ...config.headers,
        'cookie': sessionData.cookies
      },
      timeout: config.api.timeout,
      retry: { 
        limit: 2,
        methods: ['GET'],
        statusCodes: [408, 413, 429, 500, 502, 503, 504, 521, 522, 524],
        errorCodes: ['ETIMEDOUT', 'ECONNRESET', 'EADDRINUSE', 'EPROTO']
      },
      decompress: false,
      responseType: 'text',
      followRedirect: true,
      maxRedirects: 5,
      ...options
    });

    // Update session data
    sessionData.lastVisit = new Date();
    sessionData.visitCount++;
    
    // Update cookies if new ones are provided
    if (response.headers['set-cookie']) {
      sessionData.cookies = response.headers['set-cookie']
        .map(cookie => cookie.split(';')[0])
        .join('; ');
      console.log('Updated session cookies');
    }

    console.log(`[${new Date().toISOString()}] Successfully fetched content from ${url}`);
    return response.body;
  } catch (error) {
    console.error('[HTTP] Error Details:', {
      message: error.message,
      code: error.code,
      url: url,
      statusCode: error.response?.statusCode,
      headers: error.response?.headers,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

module.exports = {
  getContentWithGot,
  sessionData
}; 