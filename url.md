# API URL Examples

This document provides examples of how to use the API endpoints.

## Base URL

```
http://127.0.0.1:3000/api
```

## Movies Endpoints

### Get All Movies

Get a paginated list of all movies/series with basic info:

```
http://127.0.0.1:3000/api/all
http://127.0.0.1:3000/api/all?page=2&limit=10
http://127.0.0.1:3000/api/all?type=movie&year=2023
```

### Get Movies by Type

Get movies or series specifically:

```
http://127.0.0.1:3000/api/type/movie
http://127.0.0.1:3000/api/type/series
http://127.0.0.1:3000/api/type/movie?quality=1080p&page=2
```

### Get Movie by ID

Get detailed movie/series information by ID:

```
http://127.0.0.1:3000/api/id/1234
```

### Get Movie by URL

Get detailed movie/series information by URL path:

```
http://127.0.0.1:3000/api/url/2023/movie-name-2023-download
```

### Search Movies

Search for movies/series by title:

```
http://127.0.0.1:3000/api/search?q=avengers
http://127.0.0.1:3000/api/search?q=thor&type=movie&year=2022
```

### Get Featured Movies

Get featured movies sorted by both post date and release year:

```
http://127.0.0.1:3000/api/featured
http://127.0.0.1:3000/api/featured?type=movie&limit=10
```

## Tags and Categories

### Get Movies by Tag

Get movies filtered by specific tag:

```
http://127.0.0.1:3000/api/tags/netflix
http://127.0.0.1:3000/api/tags/amazon
http://127.0.0.1:3000/api/tags/hindi?page=2&limit=15
```

### Get All Categories

Get all categories organized by type:

```
http://127.0.0.1:3000/api/categories
```

### Get Categories by Type

Get categories of a specific type:

```
http://127.0.0.1:3000/api/categories/web-series
http://127.0.0.1:3000/api/categories/movies-by-genres
```

### Get Movies by Category

Get movies for a specific category:

```
http://127.0.0.1:3000/api/categories/web-series/netflix
http://127.0.0.1:3000/api/categories/movies-by-genres/sci-fi
http://127.0.0.1:3000/api/categories/movies-by-year/2023
```

### Search Movies by Category

Comprehensive search for a category across all fields (tags, title, info, notes, synopsis):

```
http://127.0.0.1:3000/api/search/categories/netflix
http://127.0.0.1:3000/api/search/categories/zee-5?page=1&limit=20
```

## Metadata and Filters

### Get Filter Options

Get available filter options:

```
http://127.0.0.1:3000/api/filters
```

### Get Database Statistics

Get movie database statistics:

```
http://127.0.0.1:3000/api/stats
```

## Query Parameters

These query parameters can be used with most endpoints:

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)
- `type`: Content type ('movie', 'series', or 'all')
- `year`: Filter by release year
- `language`: Filter by language
- `quality`: Filter by quality (e.g., 720p, 1080p)
- `sort`: Sort order ('newest', 'oldest', 'title', 'rating', etc.)

Example with multiple parameters:

```
http://127.0.0.1:3000/api/all?page=2&limit=15&type=movie&language=English&quality=1080p&sort=newest
``` 