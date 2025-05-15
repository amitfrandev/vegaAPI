/**
 * Comprehensive TypeScript types for the Vega Movies API
 * https://vega-api-three.vercel.app/
 */

// Base API Response format
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Paginated response format
export interface PaginatedResponse<T> {
  items: T[];
  totalItems: number;
  page: number;
  totalPages: number;
  itemsPerPage: number;
}

// Movie/Series list response
export type MovieListResponse = PaginatedResponse<MovieItem>;

// Base content item (movie or series)
export interface ContentItem {
  id: string;
  title: string;
  url: string;
  date: string;
  thumbnail: string;
  type: "movie" | "series";
  tags?: string[];
  info: ContentInfo[];
  release_year?: string;
}

// Movie-specific item
export type MovieItem = ContentItem & {
  type: "movie";
  info: (ContentInfo & { movie_or_series: "movie" })[];
};

// Series-specific item
export type SeriesItem = ContentItem & {
  type: "series";
  info: (ContentInfo & { movie_or_series: "series" })[];
};

// Movie/Series information details
export interface ContentInfo {
  imdb_rating?: string;
  movie_or_series: "movie" | "series";
  title: string;
  season?: string | null;
  episode?: string | null;
  release_year?: string;
  language?: string;
  subtitle?: string;
  size?: string;
  episode_size?: string | null;
  complete_zip?: string | null;
  quality?: string;
  format?: string;
  details?: string[];
  synopsis?: string;
  plot?: string; 
  duration?: string;
  director?: string;
  actors?: string[];
  screenshots?: string[];
  movie_notes?: string[];
  sections?: Section[];
}

// Section containing download links for a specific quality/version
export interface Section {
  heading: string;
  links: LinkGroup[];
}

// Base link interface for individual download links
export interface DownloadLink {
  buttonLabel: string;
  link: string;
  type: string;
}

// For movie-style links grouped as a download option
export interface MovieLinkGroup {
  name: string;
  quality: string | null;
  size: string | null;
  links: DownloadLink[];
}

// For series-based links that map episode numbers to links
export interface SeriesLinkGroup {
  buttonLabel: string;
  type: string;
  links: {
    [episodeNumber: string]: string;
  };
}

// For batch/zip links with special format
export interface BatchZipLinkGroup {
  name: string;
  quality: string | null;
  type: "Batch/Zip";
  size: string | null;
  links: DownloadLink[];
}

// Union type for different link group types
export type LinkGroup = SeriesLinkGroup | MovieLinkGroup | BatchZipLinkGroup;

// Response for single movie/series details
export type MovieDetailResponse = ApiResponse<ContentItem>;

// Response format for chunk files
export type ContentChunk = ContentItem[];

// Index file structure
export interface ChunkIndex {
  totalMovies: number;
  chunks: {
    fileName: string;
    movieCount: number;
  }[];
  lastUpdated: string;
}

// Search params for API requests
export interface SearchParams {
  q?: string;          // Search query
  page?: number;       // Page number for pagination (default: 1)
  limit?: number;      // Items per page (default: 20)
  type?: "movie" | "series" | "all";  // Filter by content type
  quality?: string;    // Filter by quality (e.g., "720p", "1080p")
  language?: string;   // Filter by language
  year?: string;       // Filter by release year
  sort?: string;       // Sort parameter
}

// Categories
export interface Category {
  id: string;
  name: string;
  slug: string;
  count: number;
  type?: "movie" | "series";
}

// Categories response
export type CategoriesResponse = ApiResponse<Category[]>;

// Category items response
export type CategoryItemsResponse = ApiResponse<PaginatedResponse<ContentItem>>;

// Stats response
export interface StatsData {
  totalMovies: number;
  totalMoviesOnly: number;
  totalSeries: number;
  categories?: {
    totalCategories: number;
    movieCategories: number;
    seriesCategories: number;
  };
}

export type StatsResponse = ApiResponse<StatsData>;

// Featured response
export type FeaturedResponse = ApiResponse<PaginatedResponse<ContentItem>>;

// Tags response
export type TagsResponse = ApiResponse<string[]>;

// Tag items response
export type TagItemsResponse = ApiResponse<PaginatedResponse<ContentItem>>;

// Filters response
export interface FiltersData {
  qualities: string[];
  languages: string[];
  years: string[];
}

export type FiltersResponse = ApiResponse<FiltersData>; 