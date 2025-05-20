# Category Files System

The Vega API uses a category-based file system to efficiently serve content based on categories like genres, quality, year, and series types. This document explains how this system works and how to use it.

## Overview

Categories are organized into "types" (like `movies-by-genres` or `movies-by-quality`) with each type containing multiple "slugs" (like `action` or `1080p`). The system pre-generates JSON files for each category, making API requests faster and reducing database load.

## Directory Structure

```
api/data/categories/
├── manifest.json
├── movies-by-genres/
│   ├── action.json
│   ├── adventure.json
│   └── ...
├── movies-by-quality/
│   ├── 1080p.json
│   └── ...
└── ...
```

## File Types

For each category, a lightweight JSON file is generated:

**Lightweight Data File** (`{slug}.json`): Contains only essential movie data for this category:
- `id` - Movie identifier
- `title` - Movie title
- `thumbnail` - Path to thumbnail image
- `date` - Publication date
- `url` - Movie page URL

This approach significantly reduces file sizes while providing all the necessary information for displaying movie listings.

## How Category Files Are Generated

Category files are created by the `generate-category-files.js` script, which:

1. Reads the categories defined in `api/data/categories.json`
2. Loads all movie data from chunk files (`movies_0.json`, `movies_1.json`, etc.)
3. For each category type and slug, identifies matching movies based on:
   - Tags matching the category
   - Information fields like genre, quality, or year
   - Special matching logic for different category types
4. Creates lightweight JSON files with only essential fields

## How the API Uses Category Files

The API provides two ways to access category data:

### 1. Direct Slug Access (Simplified)

```
GET /api/categories/{slug}
```

This endpoint automatically searches for the slug across all category types and returns matching movies. For example:

```
GET /api/categories/adventure
```

The API will:
1. Find which category type contains the "adventure" slug (in this case, "movies-by-genres")
2. Look for a pre-generated category file at `api/data/categories/movies-by-genres/adventure.json`
3. If found, serve the pre-generated data with pagination
4. If not found, fall back to dynamically searching the movie data

### 2. Type and Slug Access (Explicit)

```
GET /api/categories/{type}/{slug}
```

This endpoint allows you to explicitly specify both the category type and slug:

```
GET /api/categories/movies-by-genres/adventure
```

Both endpoints support pagination with query parameters:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)

## When to Regenerate Category Files

Category files should be regenerated:

1. After adding new movies to the database
2. After updating existing movie data
3. After changing category definitions

Run the following command to regenerate all category files:

```
npm run generate-category-files
```

## Command Line Options

The `generate-category-files.js` script supports several options:

- `--force`: Regenerate files even if they already exist
- `--create-empty`: Create empty files for categories with no matching movies
- `--comprehensive`: Enable deep content searching in all text fields (title, URL, synopsis, plot, etc.)
- `--type=TYPE`: Only generate files for a specific category type
- `--slug=SLUG`: Only generate files for a specific category slug

Examples:

```
# Regenerate all category files
npm run generate-category-files

# Regenerate only action genre
npm run generate-category-files -- --type=movies-by-genres --slug=action

# Force regeneration of all quality categories
npm run generate-category-files -- --type=movies-by-quality --force

# Generate more complete category files by searching all text content
npm run generate-category-files -- --comprehensive

# Generate more matches for a specific category by searching all text content
npm run generate-category-files -- --slug=adventure --comprehensive --force
```

## Manifest File

The script also generates a `manifest.json` file in the categories directory with statistics about the generation process, including:

- Total categories processed
- Categories with matching movies
- Empty categories
- Errors encountered

This helps track the effectiveness of the categorization system. 