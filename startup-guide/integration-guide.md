# Vega API Integration Guide

This document provides best practices for integrating with the Vega API, focusing on how to work effectively with its caching, user agent handling, and rate limiting features.

## Table of Contents

- [Working with Cached Responses](#working-with-cached-responses)
- [Optimizing Client Cache Usage](#optimizing-client-cache-usage)
- [Handling Rate Limits](#handling-rate-limits)
- [User Agent Considerations](#user-agent-considerations)
- [Performance Tips](#performance-tips)
- [Best Practices](#best-practices)

## Working with Cached Responses

The Vega API employs several layers of caching to improve performance. When integrating your application, consider the following:

### Server-Side Caching

The API caches responses according to the following schedule:

| Data Type | Cache Duration | Example Endpoints |
|-----------|---------------|-------------------|
| Search results | 2-5 minutes | `/api/search`, `/api/search/categories/:slug` |
| Basic listings | 5-10 minutes | `/api/all`, `/api/type/:type` |
| Movie details | 30 minutes | `/api/id/:id`, `/api/url/:url` |
| Static data | 60 minutes | `/api/filters`, `/api/categories`, `/api/stats` |

This means that changes to the underlying data might not be immediately reflected in the API responses until the cache expires.

### HTTP Cache Headers

The API sets the following cache headers:

```
Cache-Control: public, max-age=300
Surrogate-Control: max-age=3600
```

These headers indicate that:
- Browsers can cache responses for 5 minutes
- CDNs can cache responses for 1 hour

### Implementation Considerations

For data that needs to be fresh, consider:

1. Setting appropriate cache timeouts in your client application
2. Implementing refresh mechanisms for critical data
3. Using cache-busting techniques for urgent updates

## Optimizing Client Cache Usage

Implement client-side caching to complement the server's cache system:

### Browser Cache Optimization

```javascript
// Configure fetch with cache settings
function fetchAPI(url) {
  return fetch(url, {
    headers: {
      'Accept': 'application/json'
    },
    // Use cache but revalidate with server
    cache: 'no-cache'
  });
}
```

### Implementing a Cache Layer

```javascript
class APICache {
  constructor(ttl = 5 * 60 * 1000) { // 5 minutes default TTL
    this.cache = new Map();
    this.ttl = ttl;
  }

  async fetch(url) {
    const cacheKey = url;
    const cachedData = this.cache.get(cacheKey);
    
    if (cachedData && (Date.now() - cachedData.timestamp < this.ttl)) {
      return cachedData.data;
    }
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });
      
      return data;
    } catch (error) {
      // If fetch fails but we have cached data, return it even if expired
      if (cachedData) {
        console.warn('Using stale cache due to fetch error');
        return cachedData.data;
      }
      throw error;
    }
  }
  
  invalidate(url) {
    this.cache.delete(url);
  }
  
  clear() {
    this.cache.clear();
  }
}

// Usage
const apiCache = new APICache();
const movieData = await apiCache.fetch('https://vega-api-three.vercel.app/api/id/123');
```

## Handling Rate Limits

The API implements rate limiting at 100 requests per 15-minute window per IP address. When rate limited, the server will respond with:

```json
{
  "success": false,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please try again later."
}
```

### Implementing Retry Logic

```javascript
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        // Calculate backoff time: 1s, 2s, 4s, etc.
        const backoffTime = Math.pow(2, attempt) * 1000;
        console.warn(`Rate limited. Retrying in ${backoffTime}ms...`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        attempt++;
      } else {
        // Check if response is successful
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'API request failed');
        }
        
        return await response.json();
      }
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) {
        console.error('Max retries reached:', error);
        throw error;
      }
    }
  }
}
```

### Rate Limit Prevention

To avoid hitting rate limits:

1. Implement request batching where possible
2. Cache frequently accessed data
3. Implement request throttling
4. Use a queue system for intensive operations

## User Agent Considerations

The API tracks and analyzes user agents for security and analytics purposes.

### Best Practices for User Agents

1. **Use accurate and descriptive user agents**: Include your application name and version.

```javascript
fetch(url, {
  headers: {
    'User-Agent': 'MyMovieApp/1.0 (contact@example.com)'
  }
});
```

2. **Be honest about automation**: If you're building a bot or scraper, make it clear in the user agent.

3. **Avoid impersonating browsers**: Don't pretend to be Chrome or another browser if you're not.

### Blocked User Agents

The API blocks certain user agents known for aggressive scraping or malicious behavior:

- PetalBot
- Zgrab
- SemrushBot

If your legitimate application is being blocked, contact the API administrators.

## Performance Tips

To get the best performance from the Vega API:

### 1. Use Field Filtering

Request only the fields you need (when supported):

```
/api/all?fields=id,title,thumbnail,type
```

### 2. Implement Pagination Properly

Always use pagination parameters for listing endpoints:

```
/api/all?page=1&limit=20
```

Keep the limit reasonable (10-50 items) to prevent large responses.

### 3. Preload and Prefetch Critical Data

Identify and preload essential data:

```javascript
// Preload essential data
function preloadAppData() {
  return Promise.all([
    apiCache.fetch('https://vega-api-three.vercel.app/api/filters'),
    apiCache.fetch('https://vega-api-three.vercel.app/api/categories'),
    apiCache.fetch('https://vega-api-three.vercel.app/api/featured?limit=10')
  ]);
}
```

### 4. Implement Progressive Loading

For movie details pages, load basic information first, then enhance with additional details:

```javascript
async function loadMovieProgressively(id) {
  // First load basic movie info (faster)
  const basicMoviePromise = apiCache.fetch(`https://vega-api-three.vercel.app/api/all?id=${id}`);
  
  // Start rendering with basic data
  const basicData = await basicMoviePromise;
  renderMovieBasics(basicData);
  
  // Then load full details
  const fullDetailsPromise = apiCache.fetch(`https://vega-api-three.vercel.app/api/id/${id}`);
  
  // Update UI when full details arrive
  const fullDetails = await fullDetailsPromise;
  updateMovieWithFullDetails(fullDetails);
}
```

## Best Practices

### 1. Respect Cache Headers

Honor the Cache-Control headers sent by the server to reduce unnecessary requests.

### 2. Implement Graceful Degradation

When the API is unavailable or rate limited, have fallback content:

```javascript
async function fetchMovies() {
  try {
    return await apiCache.fetch('https://vega-api-three.vercel.app/api/featured');
  } catch (error) {
    console.error('Could not fetch featured movies:', error);
    // Return cached data or fallback content
    return { 
      success: true, 
      data: { 
        items: getSavedMovies() || getPlaceholderMovies() 
      } 
    };
  }
}
```

### 3. Monitor API Health

Implement monitoring of API response times and errors:

```javascript
function monitorAPIHealth() {
  const startTime = performance.now();
  
  return fetch('https://vega-api-three.vercel.app/api/stats')
    .then(response => {
      const responseTime = performance.now() - startTime;
      
      // Log or report response time
      console.log(`API response time: ${responseTime}ms`);
      
      if (responseTime > 1000) {
        console.warn('API response is slow');
      }
      
      return response.json();
    })
    .catch(error => {
      console.error('API health check failed:', error);
      // Trigger alerts or fallback measures
    });
}
```

### 4. Implement Circuit Breakers

Use circuit breaker patterns to prevent cascading failures:

```javascript
class CircuitBreaker {
  constructor(failureThreshold = 3, resetTimeout = 30000) {
    this.failureCount = 0;
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF-OPEN
    this.nextAttempt = Date.now();
  }
  
  async call(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() > this.nextAttempt) {
        this.state = 'HALF-OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await fn();
      this.success();
      return result;
    } catch (error) {
      this.failure();
      throw error;
    }
  }
  
  success() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }
  
  failure() {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold || this.state === 'HALF-OPEN') {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
    }
  }
}

// Usage
const apiBreaker = new CircuitBreaker();

async function getMovieDetails(id) {
  return apiBreaker.call(() => {
    return fetch(`https://vega-api-three.vercel.app/api/id/${id}`)
      .then(response => {
        if (!response.ok) throw new Error('API request failed');
        return response.json();
      });
  });
}
```

By following these guidelines, you can build robust applications that work efficiently with the Vega API's caching and rate limiting systems. 