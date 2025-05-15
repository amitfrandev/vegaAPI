// Types for Vega API movie/series data

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

// Section containing download links for a specific quality/version
export interface Section {
  heading: string;
  links: LinkGroup[];
}

// Movie/Series information details
export interface ContentInfo {
  imdb_rating: string;
  movie_or_series: "movie" | "series";
  title: string;
  season: string | null;
  episode: string | null;
  release_year: string;
  language: string;
  subtitle: string;
  size: string;
  episode_size: string | null;
  complete_zip: string | null;
  quality: string;
  format: string;
  details: string[];
  synopsis: string;
  screenshots: string[];
  movie_notes?: string[];
  sections: Section[];
}

// Main Movie/Series content item
export interface ContentItem {
  title: string;
  url: string;
  date: string;
  thumbnail: string;
  info: ContentInfo[];
}

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

// Helper Types

// Type for filtering movies only
export type MovieItem = ContentItem & {
  info: (ContentInfo & { movie_or_series: "movie" })[];
};

// Type for filtering series only
export type SeriesItem = ContentItem & {
  info: (ContentInfo & { movie_or_series: "series" })[];
};

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  totalItems: number;
  page: number;
  totalPages: number;
  itemsPerPage: number;
}

// Search params type
export interface SearchParams {
  query?: string;
  page?: number;
  limit?: number;
  type?: "movie" | "series" | "all";
  quality?: string;
  language?: string;
  year?: string;
} 