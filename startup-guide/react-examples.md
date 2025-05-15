# Vega Movies API - React/Next.js Examples

This document provides examples of using the [Vega Movies API](https://vega-api-three.vercel.app/) with React and Next.js.

## Table of Contents
- [React Examples](#react-examples)
  - [Using React Hooks](#using-react-hooks)
  - [React Component Examples](#react-component-examples)
- [Next.js Examples](#nextjs-examples)
  - [Static Site Generation (SSG)](#static-site-generation-ssg)
  - [Server-Side Rendering (SSR)](#server-side-rendering-ssr)
  - [Incremental Static Regeneration (ISR)](#incremental-static-regeneration-isr)
  - [API Routes](#api-routes)

## React Examples

### Using React Hooks

#### Simple Movies List with useState and useEffect

```jsx
import React, { useState, useEffect } from 'react';

function MoviesList() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchMovies() {
      try {
        const response = await fetch('https://vega-api-three.vercel.app/api/all?page=1&limit=20');
        const data = await response.json();
        
        if (data.success) {
          setMovies(data.data.items);
        } else {
          setError(data.message || 'Failed to load movies');
        }
      } catch (err) {
        setError('Error fetching movies: ' + err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchMovies();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h1>Movies List</h1>
      <div className="movies-grid">
        {movies.map(movie => (
          <div key={movie.id} className="movie-card">
            <img src={movie.thumbnail} alt={movie.title} />
            <h2>{movie.title}</h2>
            <p>Type: {movie.type}</p>
            {movie.release_year && <p>Year: {movie.release_year}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default MoviesList;
```

#### Custom Hook for API Calls

```jsx
import { useState, useEffect } from 'react';

// Custom hook for fetching data from the Vega API
function useVegaApi(endpoint, params = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        
        // Build query string from params
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            queryParams.append(key, value);
          }
        });
        
        const queryString = queryParams.toString();
        const url = `https://vega-api-three.vercel.app${endpoint}${queryString ? `?${queryString}` : ''}`;
        
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success) {
          setData(result.data);
          setError(null);
        } else {
          setError(result.message || 'API returned an error');
          setData(null);
        }
      } catch (err) {
        setError('Error fetching data: ' + err.message);
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [endpoint, JSON.stringify(params)]); // Re-run when endpoint or params change

  return { data, loading, error };
}

// Example usage
function FeaturedMovies() {
  const { data, loading, error } = useVegaApi('/api/featured', { limit: 10 });
  
  if (loading) return <div>Loading featured movies...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return (
    <div>
      <h2>Featured Movies</h2>
      {data?.items?.map(movie => (
        <div key={movie.id}>{movie.title}</div>
      ))}
    </div>
  );
}

export { useVegaApi };
```

### React Component Examples

#### Movie Details Component

```jsx
import React, { useState, useEffect } from 'react';

function MovieDetails({ movieId }) {
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!movieId) return;
    
    async function fetchMovieDetails() {
      try {
        setLoading(true);
        const response = await fetch(`https://vega-api-three.vercel.app/api/id/${movieId}`);
        const data = await response.json();
        
        if (data.success) {
          setMovie(data.data);
        } else {
          setError(data.message || 'Failed to load movie details');
        }
      } catch (err) {
        setError('Error fetching movie details: ' + err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchMovieDetails();
  }, [movieId]);

  if (loading) return <div>Loading movie details...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!movie) return <div>No movie found</div>;

  // Extract movie info
  const info = movie.info && movie.info.length > 0 ? movie.info[0] : {};

  return (
    <div className="movie-details">
      <div className="movie-header">
        <img src={movie.thumbnail} alt={movie.title} className="movie-poster" />
        <div className="movie-info">
          <h1>{movie.title}</h1>
          <div className="movie-meta">
            {info.release_year && <span>Year: {info.release_year}</span>}
            {info.language && <span>Language: {info.language}</span>}
            {info.quality && <span>Quality: {info.quality}</span>}
            {info.duration && <span>Duration: {info.duration}</span>}
          </div>
          {info.plot && <p className="movie-plot">{info.plot}</p>}
        </div>
      </div>
      
      {/* Movie cast and crew */}
      {info.director && (
        <div className="movie-crew">
          <h2>Director</h2>
          <p>{info.director}</p>
        </div>
      )}
      
      {info.actors && info.actors.length > 0 && (
        <div className="movie-cast">
          <h2>Cast</h2>
          <div className="cast-list">
            {info.actors.map((actor, index) => (
              <span key={index}>{actor}</span>
            ))}
          </div>
        </div>
      )}
      
      {/* Screenshots */}
      {info.screenshots && info.screenshots.length > 0 && (
        <div className="movie-screenshots">
          <h2>Screenshots</h2>
          <div className="screenshots-grid">
            {info.screenshots.map((screenshot, index) => (
              <img key={index} src={screenshot} alt={`Screenshot ${index + 1}`} />
            ))}
          </div>
        </div>
      )}
      
      {/* Tags */}
      {movie.tags && movie.tags.length > 0 && (
        <div className="movie-tags">
          <h2>Tags</h2>
          <div className="tags-list">
            {movie.tags.map((tag, index) => (
              <span key={index} className="tag">{tag}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default MovieDetails;
```

#### Search Component with Debounce

```jsx
import React, { useState, useEffect, useCallback } from 'react';

function SearchMovies() {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Debounce search to avoid too many API calls
  const debouncedSearch = useCallback(
    debounce(async (searchQuery) => {
      if (!searchQuery || searchQuery.trim() === '') {
        setSearchResults([]);
        return;
      }
      
      try {
        setLoading(true);
        const response = await fetch(
          `https://vega-api-three.vercel.app/api/search?q=${encodeURIComponent(searchQuery)}&limit=10`
        );
        const data = await response.json();
        
        if (data.success) {
          setSearchResults(data.data.items || []);
        } else {
          setError(data.message || 'Search failed');
        }
      } catch (err) {
        setError('Error searching: ' + err.message);
      } finally {
        setLoading(false);
      }
    }, 500),
    []
  );

  // Update search results when query changes
  useEffect(() => {
    debouncedSearch(query);
    
    // Cleanup function to cancel any pending debounce
    return () => debouncedSearch.cancel();
  }, [query, debouncedSearch]);

  return (
    <div className="search-container">
      <div className="search-form">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for movies or series..."
          className="search-input"
        />
      </div>
      
      {loading && <div className="search-loading">Searching...</div>}
      {error && <div className="search-error">Error: {error}</div>}
      
      {searchResults.length > 0 ? (
        <div className="search-results">
          {searchResults.map(movie => (
            <div key={movie.id} className="search-result-item">
              <img src={movie.thumbnail} alt={movie.title} className="result-thumbnail" />
              <div className="result-details">
                <h3>{movie.title}</h3>
                <span className="result-type">{movie.type}</span>
              </div>
            </div>
          ))}
        </div>
      ) : query && !loading ? (
        <div className="search-no-results">No results found</div>
      ) : null}
    </div>
  );
}

// Simple debounce function
function debounce(func, wait) {
  let timeout;
  
  const debounced = function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
  
  debounced.cancel = function() {
    clearTimeout(timeout);
  };
  
  return debounced;
}

export default SearchMovies;
```

## Next.js Examples

### Static Site Generation (SSG)

Perfect for pages that can be pre-rendered at build time.

#### Home Page with Featured Movies

```jsx
// pages/index.js
import Head from 'next/head';
import Link from 'next/link';

export default function Home({ featuredMovies, stats }) {
  return (
    <div className="container">
      <Head>
        <title>Movie Database</title>
        <meta name="description" content="Browse our collection of movies and series" />
      </Head>

      <main>
        <h1>Welcome to the Movie Database</h1>
        
        <section className="stats">
          <p>Our database contains {stats.totalMovies} titles, including {stats.totalMoviesOnly} movies and {stats.totalSeries} series!</p>
        </section>
        
        <section className="featured">
          <h2>Featured Movies</h2>
          <div className="movies-grid">
            {featuredMovies.map(movie => (
              <Link href={`/movie/${movie.id}`} key={movie.id}>
                <a className="movie-card">
                  <img src={movie.thumbnail} alt={movie.title} />
                  <h3>{movie.title}</h3>
                  {movie.release_year && <p>Year: {movie.release_year}</p>}
                </a>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export async function getStaticProps() {
  try {
    // Fetch featured movies
    const featuredResponse = await fetch('https://vega-api-three.vercel.app/api/featured?limit=8');
    const featuredData = await featuredResponse.json();
    
    // Fetch stats
    const statsResponse = await fetch('https://vega-api-three.vercel.app/api/stats');
    const statsData = await statsResponse.json();
    
    return {
      props: {
        featuredMovies: featuredData.success ? featuredData.data.items : [],
        stats: statsData.success ? statsData.data : { totalMovies: 0, totalMoviesOnly: 0, totalSeries: 0 }
      },
      // Revalidate every day (86400 seconds)
      revalidate: 86400
    };
  } catch (error) {
    console.error('Error fetching data:', error);
    return {
      props: {
        featuredMovies: [],
        stats: { totalMovies: 0, totalMoviesOnly: 0, totalSeries: 0 }
      },
      revalidate: 3600 // Try again in an hour if there was an error
    };
  }
}
```

### Server-Side Rendering (SSR)

Good for pages that need to be rendered fresh on each request.

#### Search Results Page

```jsx
// pages/search.js
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function SearchResults({ results, query, totalItems }) {
  const router = useRouter();
  
  // Handle pagination
  const currentPage = parseInt(router.query.page || '1');
  const totalPages = Math.ceil(totalItems / 20);
  
  const handlePageChange = (newPage) => {
    router.push({
      pathname: '/search',
      query: { 
        q: query,
        page: newPage
      }
    });
  };
  
  return (
    <div className="container">
      <h1>Search Results for "{query}"</h1>
      <p>Found {totalItems} results</p>
      
      <div className="search-results">
        {results.length > 0 ? (
          results.map(movie => (
            <Link href={`/movie/${movie.id}`} key={movie.id}>
              <a className="search-result-item">
                <img src={movie.thumbnail} alt={movie.title} />
                <div>
                  <h2>{movie.title}</h2>
                  <p>Type: {movie.type}</p>
                  {movie.tags && movie.tags.length > 0 && (
                    <div className="tags">
                      {movie.tags.slice(0, 5).map((tag, i) => (
                        <span key={i} className="tag">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </a>
            </Link>
          ))
        ) : (
          <p>No results found. Try a different search term.</p>
        )}
      </div>
      
      {totalPages > 1 && (
        <div className="pagination">
          <button 
            onClick={() => handlePageChange(currentPage - 1)} 
            disabled={currentPage === 1}
          >
            Previous
          </button>
          
          <span>Page {currentPage} of {totalPages}</span>
          
          <button 
            onClick={() => handlePageChange(currentPage + 1)} 
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export async function getServerSideProps({ query }) {
  const searchQuery = query.q || '';
  const page = query.page || 1;
  
  if (!searchQuery) {
    return {
      redirect: {
        destination: '/',
        permanent: false,
      },
    };
  }
  
  try {
    const response = await fetch(
      `https://vega-api-three.vercel.app/api/search?q=${encodeURIComponent(searchQuery)}&page=${page}&limit=20`
    );
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Search failed');
    }
    
    return {
      props: {
        results: data.data.items || [],
        query: searchQuery,
        totalItems: data.data.totalItems || 0
      }
    };
  } catch (error) {
    console.error('Search error:', error);
    return {
      props: {
        results: [],
        query: searchQuery,
        totalItems: 0,
        error: error.message
      }
    };
  }
}
```

### Incremental Static Regeneration (ISR)

Perfect for movie details pages.

```jsx
// pages/movie/[id].js
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function MovieDetails({ movie, error }) {
  const router = useRouter();
  
  // Show a loading state when fallback is true
  if (router.isFallback) {
    return <div>Loading...</div>;
  }
  
  // Handle errors
  if (error) {
    return (
      <div className="error-container">
        <h1>Error</h1>
        <p>{error}</p>
        <Link href="/">
          <a>Go back to home</a>
        </Link>
      </div>
    );
  }
  
  // If no movie data
  if (!movie) {
    return (
      <div className="error-container">
        <h1>Movie Not Found</h1>
        <p>The movie you are looking for does not exist.</p>
        <Link href="/">
          <a>Go back to home</a>
        </Link>
      </div>
    );
  }
  
  // Extract movie info
  const info = movie.info && movie.info.length > 0 ? movie.info[0] : {};
  
  return (
    <div className="movie-container">
      <Head>
        <title>{movie.title} | Movie Database</title>
        <meta name="description" content={info.plot || `Details about ${movie.title}`} />
      </Head>
      
      <div className="movie-header">
        <img src={movie.thumbnail} alt={movie.title} className="movie-poster" />
        <div className="movie-info">
          <h1>{movie.title}</h1>
          
          <div className="movie-meta">
            {info.release_year && <span>Year: {info.release_year}</span>}
            {info.quality && <span>Quality: {info.quality}</span>}
            {info.language && <span>Language: {info.language}</span>}
            {info.imdb_rating && <span>IMDB: {info.imdb_rating}/10</span>}
          </div>
          
          {info.plot && <p className="movie-plot">{info.plot}</p>}
          
          {movie.tags && movie.tags.length > 0 && (
            <div className="movie-tags">
              <h3>Tags:</h3>
              <div className="tags-list">
                {movie.tags.map((tag, index) => (
                  <Link href={`/tag/${tag}`} key={index}>
                    <a className="tag">{tag}</a>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Screenshots section */}
      {info.screenshots && info.screenshots.length > 0 && (
        <div className="screenshots-section">
          <h2>Screenshots</h2>
          <div className="screenshots-grid">
            {info.screenshots.map((screenshot, index) => (
              <img 
                key={index}
                src={screenshot}
                alt={`${movie.title} screenshot ${index + 1}`}
                className="screenshot"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Generate static paths for the most popular movies
export async function getStaticPaths() {
  try {
    // Get top 100 featured movies for pre-rendering
    const response = await fetch('https://vega-api-three.vercel.app/api/featured?limit=100');
    const data = await response.json();
    
    const paths = data.success
      ? data.data.items.map(movie => ({ params: { id: movie.id.toString() } }))
      : [];
    
    return {
      paths,
      // Enable on-demand generation for other movie pages
      fallback: true
    };
  } catch (error) {
    console.error('Error generating paths:', error);
    return {
      paths: [],
      fallback: true
    };
  }
}

// Get the movie data
export async function getStaticProps({ params }) {
  try {
    const response = await fetch(`https://vega-api-three.vercel.app/api/id/${params.id}`);
    const data = await response.json();
    
    if (!data.success) {
      return {
        props: {
          error: data.message || 'Failed to load movie'
        },
        revalidate: 60 // Try again after 1 minute
      };
    }
    
    return {
      props: {
        movie: data.data
      },
      // Revalidate the page every 24 hours
      revalidate: 86400
    };
  } catch (error) {
    console.error('Error fetching movie:', error);
    return {
      props: {
        error: 'Failed to load movie details'
      },
      revalidate: 60
    };
  }
}
```

### API Routes

You can also create proxy endpoints in your Next.js API routes.

```jsx
// pages/api/movies.js
export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method Not Allowed',
      message: 'Only GET requests are allowed' 
    });
  }
  
  // Get query parameters
  const { page = 1, limit = 20, type, year, language, quality, sort } = req.query;
  
  // Construct URL with query parameters
  const url = new URL('https://vega-api-three.vercel.app/api/all');
  
  // Add query parameters
  if (page) url.searchParams.append('page', page);
  if (limit) url.searchParams.append('limit', limit);
  if (type) url.searchParams.append('type', type);
  if (year) url.searchParams.append('year', year);
  if (language) url.searchParams.append('language', language);
  if (quality) url.searchParams.append('quality', quality);
  if (sort) url.searchParams.append('sort', sort);
  
  try {
    // Fetch data from the API
    const response = await fetch(url.toString());
    const data = await response.json();
    
    // Return the data
    return res.status(response.status).json(data);
  } catch (error) {
    // Handle errors
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
}
```

Client-side usage:

```jsx
// Using the Next.js API route instead of directly calling the external API
import { useState, useEffect } from 'react';

function MoviesPage() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function fetchMovies() {
      setLoading(true);
      try {
        // Call your own Next.js API route
        const response = await fetch('/api/movies?limit=20');
        const data = await response.json();
        
        if (data.success) {
          setMovies(data.data.items);
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchMovies();
  }, []);
  
  if (loading) return <div>Loading...</div>;
  
  return (
    <div>
      <h1>Movies</h1>
      <div className="movies-list">
        {movies.map(movie => (
          <div key={movie.id}>{movie.title}</div>
        ))}
      </div>
    </div>
  );
}
``` 