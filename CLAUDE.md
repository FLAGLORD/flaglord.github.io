# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Hexo static blog using the Fluid theme, deployed to GitHub Pages at flaglord.com.

## Common Commands

```bash
# Development server with hot reload
pnpm server

# Build static files to ./public
pnpm build

# Clean generated files
pnpm clean

# Deploy to GitHub Pages
pnpm deploy

# Create a new post
pnpm exec hexo new post "post-title"

# Create a new page
pnpm exec hexo new page "page-name"
```

## Package Manager

This project uses **pnpm** for dependency management.

## Project Structure

- `source/_posts/` - Blog posts (Markdown files)
- `source/` - Static pages and assets
- `_config.yml` - Hexo configuration
- `_config.fluid.yml` - Theme configuration
- `themes/` - Theme files
- `public/` - Generated static files (gitignored)

## Deployment

- Source code: `backup` branch
- Generated site: deployed to `master` branch via `hexo deploy`