require('dotenv').config();
const path = require('path');

const maindoamin = 'vegamovies.yoga';
const mainUrl = `https://${maindoamin}`;
// Get the domain from API_URL or use default
const getDomain = () => {
  // Use fixed domain instead of environment variable
  const apiUrl = mainUrl;
  try {
    return new URL(apiUrl).hostname;
  } catch (error) {
    console.error('Error parsing API_URL:', error);
    return maindoamin;
  }
};

const domain = getDomain();

// Define base paths
const basePaths = {
  output: 'output',
  db: 'db',
  json: 'json'
};

// Construct full paths
const paths = {
  output: path.join(process.cwd(), basePaths.output),
  db: path.join(process.cwd(), basePaths.output, basePaths.db),
  json: path.join(process.cwd(), basePaths.output, basePaths.json),
  moviesJson: path.join(process.cwd(), basePaths.output, basePaths.json, 'movies-db.json'),
  dbFile: path.join(process.cwd(), basePaths.output, basePaths.db, 'movies.db'),
  pagesDir: path.join(process.cwd(), basePaths.output, basePaths.json, 'pages'),
  fetchedPagesJson: path.join(process.cwd(), basePaths.output, basePaths.json, 'pages', 'fetched.json'),
  moviesChunkDir: path.join(process.cwd(), basePaths.output, basePaths.json, 'movies_chunks')
};

// API Configuration
const apiConfig = {
  rootUrl: mainUrl,
  port: 3000,
  host: '127.0.0.1',
  cookies: '_ga=GA1.1.1008300213.1746132442; cf_clearance=pb455Hlp3XcXVXIzrUBXkLWAZAahiKVnrAlxfSm3KSw-1746687834-1.2.1.1-lzQMvS2bud73ezayP6MteRHNFS3asr7VdaPCUdvUOKh2.NpNHYK4_BeeYpNoWUxmDWto5_aWVgwPYfEn027dQyOL6exqZdJDntRit8W4ZCIuwreTnTofYk8QYaB6ifPIamkukzd64MRP9MAJOzc6Yy0PjTOTbUKMj_VcMRkGIostWuHn5IM9Rp2maonIDlIpEzDh6R9g9R4EE_StKcsov5W2odEFEMA7rjtnqlIXG56aDTjx9bMan8yz8ZFASEFgirnqt3uCxTLutAY_mrFkwVcBbUVDp.Vv3.nYjrVrqazmbHrhZH7K5f04wQpU2_ND6A.wRWL9PMxirTAP30TtlVixnJs_ZADGQJPew.6eJGM; _ga_BLZGKYN5PF=GS2.1.s1746855438$o14$g0$t1746855438$j0$l0$h0',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  timeout: 30000
};

// Database Configuration
const dbConfig = {
  path: paths.dbFile,
  chunkSize: 50
};

// Delay configurations for different URL types
const delayConfig = {
  pageNavigation: {
    min: 100,
    range: 50
  },
  movieDetails: {
    min: 150,
    range: 50
  },
  nexdriveLinks: {
    min: 150,
    range: 50
  },
  default: {
    min: 150,
    range: 50
  }
};

// Movie JSON chunking configuration
const movieChunkingConfig = {
  enabled: true,
  moviesPerChunk: 50,
  keepCombinedFile: true
};

// Headers configuration
const headersConfig = {
  'authority': domain,
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'accept-encoding': 'identity',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'max-age=0',
  'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
  'user-agent': apiConfig.userAgent
};

// Export the complete configuration
const config = {
  api: apiConfig,
  db: dbConfig,
  paths: paths,
  headers: headersConfig,
  delays: delayConfig,
  movieChunking: movieChunkingConfig
};

module.exports = config; 