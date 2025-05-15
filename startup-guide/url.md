# Vega Movies API Documentation

API Base URL: [https://vega-api-three.vercel.app/](https://vega-api-three.vercel.app/)

## Table of Contents
- [API Endpoints](#api-endpoints)
- [Usage Examples](#usage-examples)
  - [Fetch All Movies](#fetch-all-movies)
  - [Filter By Type](#filter-by-type)
  - [Get Movie Details](#get-movie-details)
  - [Search Movies](#search-movies)
  - [Get Movies by Category](#get-movies-by-category)
- [TypeScript Interfaces](#typescript-interfaces)
- [Error Handling](#error-handling)

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/all` | Get paginated list of movies/series (basic info) |
| `GET /api/type/:type` | Get movies or series (type must be 'movie' or 'series') |
| `GET /api/id/:id` | Get detailed movie/series information by ID |
| `GET /api/url/:url` | Get detailed movie/series information by URL path |
| `GET /api/search?q=query` | Search for movies/series |
| `GET /api/filters` | Get available filter options |
| `GET /api/stats` | Get database statistics |
| `GET /api/featured` | Get featured movies sorted by release year and date |
| `GET /api/tags/:tag` | Get movies filtered by specific tag |
| `GET /api/categories` | Get all categories organized by type |
| `GET /api/categories/:type` | Get categories of a specific type |
| `GET /api/categories/:type/:slug` | Get movies for a specific category |
| `GET /api/search/categories/:slug` | Search for a category across all fields |

## Query Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `page` | Page number | 1 |
| `limit` | Items per page | 20 |
| `type` | Content type ('movie', 'series', or 'all') | all |
| `year` | Filter by release year | - |
| `language` | Filter by language | - |
| `quality` | Filter by quality (e.g., 720p, 1080p) | - |
| `sort` | Sort order ('newest', 'oldest', 'title', etc.) | newest |

## Usage Examples

### Fetch All Movies

**JavaScript (Fetch API):**
```javascript
fetch('https://vega-api-three.vercel.app/api/all?page=1&limit=10')
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      const movies = data.data.items;
      console.log(`Found ${data.data.totalItems} movies`);
      movies.forEach(movie => console.log(movie.title));
    }
  })
  .catch(error => console.error('Error fetching movies:', error));
```

**JavaScript (Axios):**
```javascript
import axios from 'axios';

axios.get('https://vega-api-three.vercel.app/api/all', {
  params: {
    page: 1,
    limit: 10,
    sort: 'newest'
  }
})
.then(response => {
  const { data } = response.data;
  console.log(`Found ${data.totalItems} movies`);
  data.items.forEach(movie => console.log(movie.title));
})
.catch(error => console.error('Error:', error));
```

**Python (Requests):**
```python
import requests

response = requests.get('https://vega-api-three.vercel.app/api/all', 
                       params={'page': 1, 'limit': 10})
data = response.json()

if data['success']:
    movies = data['data']['items']
    print(f"Found {data['data']['totalItems']} movies")
    for movie in movies:
        print(movie['title'])
```

### Filter By Type

**JavaScript:**
```javascript
// Get only movies
fetch('https://vega-api-three.vercel.app/api/type/movie?page=1&limit=10')
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      console.log(`Found ${data.data.totalItems} movies`);
      data.data.items.forEach(movie => console.log(movie.title));
    }
  });

// Get only series
fetch('https://vega-api-three.vercel.app/api/type/series?page=1&limit=10')
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      console.log(`Found ${data.data.totalItems} series`);
      data.data.items.forEach(series => console.log(series.title));
    }
  });
```

### Get Movie Details

**JavaScript:**
```javascript
// Get by ID
const movieId = 1234;
fetch(`https://vega-api-three.vercel.app/api/id/${movieId}`)
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      const movie = data.data;
      console.log(`Title: ${movie.title}`);
      console.log(`Release Year: ${movie.info[0].release_year}`);
      console.log(`Quality: ${movie.info[0].quality}`);
      console.log(`Language: ${movie.info[0].language}`);
    }
  });

// Get by URL
const movieUrl = 'example-movie-path';
fetch(`https://vega-api-three.vercel.app/api/url/${encodeURIComponent(movieUrl)}`)
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      const movie = data.data;
      console.log(`Title: ${movie.title}`);
      // Access other movie details
    }
  });
```

### Search Movies

**JavaScript:**
```javascript
const searchQuery = 'Avengers';
fetch(`https://vega-api-three.vercel.app/api/search?q=${encodeURIComponent(searchQuery)}&page=1&limit=10`)
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      console.log(`Found ${data.data.totalItems} results for "${searchQuery}"`);
      data.data.items.forEach(movie => console.log(movie.title));
    }
  });
```

### Get Movies by Category

**JavaScript:**
```javascript
const categoryType = 'movies-by-genres';
const categorySlug = 'action';

fetch(`https://vega-api-three.vercel.app/api/categories/${categoryType}/${categorySlug}?page=1&limit=10`)
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      console.log(`Found ${data.data.totalItems} ${categorySlug} movies`);
      data.data.items.forEach(movie => console.log(movie.title));
    }
  });
```

## TypeScript Interfaces

```typescript
// Base response interface
interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

// Pagination details
interface PaginationInfo {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

// Basic movie information
interface BasicMovieInfo {
  id: number;
  title: string;
  url: string;
  date: string;
  thumbnail: string;
  type: 'movie' | 'series' | 'unknown';
  tags: string[];
  release_year?: number;
}

// API response for paginated movie lists
interface MovieListResponse extends PaginationInfo {
  items: BasicMovieInfo[];
}

// Movie quality information
interface QualityInfo {
  quality: string;
  size?: string;
  format?: string;
}

// Movie detail information
interface MovieDetailInfo {
  movie_or_series: 'movie' | 'series';
  release_year?: number;
  language?: string;
  quality?: string;
  duration?: string;
  genre?: string;
  director?: string;
  actors?: string[];
  plot?: string;
  country?: string;
  imdb_rating?: number;
  screenshots?: string[];
  download_links?: {
    quality: string;
    links: Array<{
      host: string;
      url: string;
    }>;
  }[];
}

// Full movie details
interface MovieDetail {
  id: number;
  title: string;
  url: string;
  date: string;
  thumbnail: string;
  info: MovieDetailInfo[];
  tags: string[];
  created_at: string;
  updated_at: string;
}

// Filter options
interface FilterOptions {
  years: number[];
  qualities: string[];
  languages: string[];
}

// Category item
interface CategoryItem {
  slug: string;
  path: string;
  name: string;
  isMainCategory: boolean;
}

// Category 
interface Category {
  title: string;
  description: string;
  items: CategoryItem[];
  stats: {
    total: number;
  };
}

// Categories response
interface CategoriesResponse {
  timestamp: string;
  totalCategories: number;
  categories: Record<string, Category>;
}

// Stats response
interface StatsResponse {
  totalMovies: number;
  totalSeries: number;
  totalMoviesOnly: number;
  lastUpdated: string;
}

// Usage example
async function getMovies(): Promise<BasicMovieInfo[]> {
  const response = await fetch('https://vega-api-three.vercel.app/api/all');
  const result: ApiResponse<MovieListResponse> = await response.json();
  
  if (result.success) {
    return result.data.items;
  } else {
    throw new Error(result.message || 'Failed to fetch movies');
  }
}

async function getMovieDetails(id: number): Promise<MovieDetail> {
  const response = await fetch(`https://vega-api-three.vercel.app/api/id/${id}`);
  const result: ApiResponse<MovieDetail> = await response.json();
  
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.message || 'Failed to fetch movie details');
  }
}
```

## Error Handling

The API returns errors in the following format:

```json
{
  "success": false,
  "error": "Error type",
  "message": "Detailed error message"
}
```

Common error types:
- `Method Not Allowed` - The API is read-only and only accepts GET requests
- `Not Found` - The requested resource was not found
- `Invalid parameter` - A parameter was invalid or missing
- `Internal server error` - Something went wrong on the server

Example error handling:

```javascript
fetch('https://vega-api-three.vercel.app/api/id/999999999')
  .then(response => response.json())
  .then(data => {
    if (!data.success) {
      console.error(`Error: ${data.error} - ${data.message}`);
    } else {
      // Process data
    }
  })
  .catch(error => console.error('Network error:', error));
```

## Rate Limiting

Please be considerate with your API usage and implement caching where appropriate. The API currently does not enforce strict rate limiting, but excessive usage may be restricted in the future. 