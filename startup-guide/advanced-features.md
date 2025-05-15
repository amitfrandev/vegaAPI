# Vega API Advanced Features

This document provides detailed information about the advanced features implemented in the Vega API, including caching, user agent tracking, and rate limiting.

## Table of Contents

- [Caching System](#caching-system)
  - [In-Memory Cache Implementation](#in-memory-cache-implementation)
  - [Cache Middleware](#cache-middleware)
  - [Cache Duration Strategy](#cache-duration-strategy)
  - [Cache Headers](#cache-headers)
- [User Agent Handling](#user-agent-handling)
  - [User Agent Tracking](#user-agent-tracking)
  - [Browser Detection](#browser-detection)
  - [Bot Detection and Blocking](#bot-detection-and-blocking)
- [Rate Limiting](#rate-limiting)
  - [Implementation Details](#implementation-details)
  - [Customization](#customization)
- [Usage Examples](#usage-examples)
  - [Frontend Considerations](#frontend-considerations)

## Caching System

The Vega API implements a sophisticated in-memory caching system to improve performance and reduce server load. This system caches API responses to minimize database queries and computation.

### In-Memory Cache Implementation

The cache implementation uses a simple key-value store with time-based expiration:

```javascript
const cache = {
  data: {},
  maxAge: 5 * 60 * 1000, // 5 minutes in milliseconds
  
  // Set a value in the cache
  set: function(key, value, customMaxAge = null) {
    const expires = Date.now() + (customMaxAge || this.maxAge);
    this.data[key] = { value, expires };
    return value;
  },
  
  // Get a value from the cache
  get: function(key) {
    const item = this.data[key];
    if (!item) return null;
    
    // Return null if item has expired
    if (Date.now() > item.expires) {
      delete this.data[key];
      return null;
    }
    
    return item.value;
  },
  
  // Clear all cache
  clear: function() {
    this.data = {};
  },
  
  // Clear expired items
  clearExpired: function() {
    const now = Date.now();
    Object.keys(this.data).forEach(key => {
      if (now > this.data[key].expires) {
        delete this.data[key];
      }
    });
  }
};
```

The system automatically cleans up expired cache items every 10 minutes to prevent memory leaks:

```javascript
setInterval(() => {
  cache.clearExpired();
}, 10 * 60 * 1000);
```

### Cache Middleware

The caching behavior is implemented as Express middleware that intercepts responses and caches them based on the request URL:

```javascript
function cacheMiddleware(duration = null) {
  return (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') return next();
    
    // Generate a cache key from the request URL and query parameters
    const cacheKey = `${req.originalUrl || req.url}`;
    
    // Check if we have a cached response
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
      // Return the cached response
      return res.json(cachedResponse);
    }
    
    // Store the original json method
    const originalJson = res.json;
    
    // Override the json method to cache the response
    res.json = function(body) {
      // Cache the response
      cache.set(cacheKey, body, duration);
      // Call the original json method
      return originalJson.call(this, body);
    };
    
    next();
  };
}
```

### Cache Duration Strategy

Different types of data are cached for different durations based on how frequently they change:

| Endpoint Type | Cache Duration | Rationale |
|---------------|---------------|-----------|
| Search results | 2-5 minutes | Searches may be frequent but results can change |
| Movie listings | 5-10 minutes | Basic listings don't change very often |
| Movie details | 30 minutes | Detailed information rarely changes |
| Static data (filters, categories) | 60 minutes | These change very infrequently |

Example of applying different cache durations:

```javascript
apiRouter.get('/search', cacheMiddleware(2 * 60 * 1000), async (req, res) => {
  // Search implementation...
});

apiRouter.get('/id/:id', cacheMiddleware(30 * 60 * 1000), async (req, res) => {
  // Get movie by ID implementation...
});

apiRouter.get('/filters', cacheMiddleware(60 * 60 * 1000), async (req, res) => {
  // Get filters implementation...
});
```

### Cache Headers

The API also sets HTTP cache headers to enable browser and CDN caching:

```javascript
app.use('/api', (req, res, next) => {
  // Set cache control headers
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
  res.setHeader('Surrogate-Control', 'max-age=3600'); // 1 hour for CDNs
  next();
});
```

Static routes have longer cache durations:

```javascript
app.get('/api/docs', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
  // Documentation route implementation...
});
```

## User Agent Handling

The API includes comprehensive user agent tracking and analysis to understand client usage patterns and protect against malicious requests.

### User Agent Tracking

User agent information is captured and logged for each request:

```javascript
function userAgentMiddleware(req, res, next) {
  const userAgent = req.headers['user-agent'] || 'Unknown';
  
  // Log user agent for analytics
  console.log(`Request from: ${userAgent} - ${req.method} ${req.originalUrl}`);
  
  // Add user agent to request object for future use
  req.userAgentData = {
    userAgent,
    isMobile: /Mobile|Android|iPhone|iPad|iPod/i.test(userAgent),
    isBot: /bot|crawler|spider|googlebot|bingbot|yahoo|baidu/i.test(userAgent),
    browser: getBrowserInfo(userAgent),
    timestamp: new Date().toISOString()
  };
  
  // Bot detection and blocking logic
  if (req.userAgentData.isBot && isMaliciousBot(userAgent)) {
    return res.status(403).json({
      success: false,
      error: 'Access Denied',
      message: 'Suspicious request detected'
    });
  }
  
  next();
}
```

### Browser Detection

The API categorizes browsers to understand client distribution:

```javascript
function getBrowserInfo(userAgent) {
  if (/Chrome/i.test(userAgent)) return 'Chrome';
  if (/Firefox/i.test(userAgent)) return 'Firefox';
  if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) return 'Safari';
  if (/MSIE|Trident/i.test(userAgent)) return 'Internet Explorer';
  if (/Edge/i.test(userAgent)) return 'Edge';
  return 'Other';
}
```

### Bot Detection and Blocking

The API can detect and block potentially malicious bots:

```javascript
function isMaliciousBot(userAgent) {
  const maliciousBotPatterns = [
    /PetalBot/i,
    /zgrab/i,
    /SemrushBot/i,
    // Additional patterns can be added
  ];
  
  return maliciousBotPatterns.some(pattern => pattern.test(userAgent));
}
```

## Rate Limiting

To prevent abuse and ensure fair usage, the API implements IP-based rate limiting.

### Implementation Details

The rate limiting system tracks requests per IP address within a sliding time window:

```javascript
const rateLimits = {
  ips: {},
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100, // Max 100 requests per 15 minutes
  
  // Check if the IP has exceeded the limit
  isRateLimited: function(ip) {
    const now = Date.now();
    
    // Initialize or clear expired entries
    if (!this.ips[ip] || now - this.ips[ip].windowStart > this.windowMs) {
      this.ips[ip] = {
        windowStart: now,
        count: 0
      };
    }
    
    // Increment the request count
    this.ips[ip].count++;
    
    // Check if rate limit is exceeded
    return this.ips[ip].count > this.maxRequests;
  }
};
```

The rate limiting middleware applies these limits:

```javascript
function rateLimitMiddleware(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  
  if (rateLimits.isRateLimited(ip)) {
    return res.status(429).json({
      success: false,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.'
    });
  }
  
  next();
}
```

### Customization

The rate limiting parameters can be adjusted based on your needs:

- `windowMs`: The time window in milliseconds (default: 15 minutes)
- `maxRequests`: Maximum number of requests allowed in the time window (default: 100)

For higher traffic scenarios, consider increasing these values or implementing a more sophisticated rate limiting system using Redis or a similar technology.

## Usage Examples

### Frontend Considerations

When building a frontend application that consumes the Vega API, you can take advantage of the caching behaviors:

1. **Browser Cache**: The Cache-Control headers allow browsers to cache responses locally.

2. **Stale-While-Revalidate Pattern**: Implement this pattern to always show cached data while fetching fresh data in the background.

Example fetch implementation:

```javascript
async function fetchWithCache(url) {
  // Try to get from cache first
  const cachedData = localStorage.getItem(url);
  const cachedTime = localStorage.getItem(`${url}_time`);
  
  // Show cached data if it exists and is less than 5 minutes old
  if (cachedData && cachedTime) {
    const cachedAge = Date.now() - parseInt(cachedTime);
    if (cachedAge < 5 * 60 * 1000) {
      return JSON.parse(cachedData);
    }
  }
  
  // Fetch fresh data
  const response = await fetch(url);
  const data = await response.json();
  
  // Cache the new data
  localStorage.setItem(url, JSON.stringify(data));
  localStorage.setItem(`${url}_time`, Date.now().toString());
  
  return data;
}
```

3. **Handle Rate Limits**: Implement retry logic with exponential backoff when you encounter 429 Too Many Requests responses:

```javascript
async function fetchWithRetry(url, maxRetries = 3) {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      const response = await fetch(url);
      
      if (response.status === 429) {
        // Rate limited, wait and retry
        const backoffTime = Math.pow(2, retries) * 1000;
        console.log(`Rate limited. Retrying in ${backoffTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        retries++;
      } else {
        return await response.json();
      }
    } catch (error) {
      retries++;
      if (retries >= maxRetries) throw error;
    }
  }
} 