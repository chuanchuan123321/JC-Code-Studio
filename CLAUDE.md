# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Code Studio is a React-based web application that provides an AI-powered coding environment. It allows users to create, edit, and preview web projects (HTML/CSS/JavaScript) with real-time AI assistance. The application features a resizable three-panel layout with a chat interface, code editor, and live preview pane.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (runs on port 3000)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Environment Setup

1. Create a `.env.local` file in the project root
2. Set environment variables:
   - `API_URL`: API endpoint (defaults to `https://yunwu.ai/v1`)
   - `API_KEY`: Your API key
   - `MODEL`: Model name (defaults to `gemini-3-pro-preview`)

The application uses Vite's environment variable loading to inject these values via `vite.config.ts`.

## Core Architecture

### Main Components
- **App.tsx** (~3300 lines): Root component managing all application state including:
  - File management and project persistence
  - Chat interface with AI streaming
  - Resizable three-panel layout (chat, editor, preview)
  - Project saving/loading from localStorage
  - Image upload support for multimodal AI interactions

- **components/CodeEditor.tsx**: Code editing interface using Prism.js for syntax highlighting
  - Overlays transparent textarea on top of syntax-highlighted pre element
  - Supports HTML, CSS, JavaScript, and TypeScript

- **components/Preview.tsx**: Live preview pane using iframe
  - Automatically injects CSS and JavaScript files into HTML
  - Debounced updates to prevent flashing during streaming
  - Finds entry point (prioritizes `index.html`)

- **components/Icons.tsx**: SVG icon components

- **services/geminiService.ts**: AI API integration
  - Uses OpenAI-compatible API format (not Google Gemini directly)
  - Streaming responses with custom XML tag parsing (`<file name="path">content</file>`)
  - Supports multimodal inputs (text + images)

- **types.ts**: TypeScript interfaces for `ProjectFile`, `ChatMessage`, and `SavedProject`

- **constants.ts**: Initial file configurations with default template

### State Management
- React hooks (useState, useEffect, useCallback, useRef)
- localStorage for project persistence and workspace restoration
- Real-time streaming updates during AI responses
- Custom drag handlers for resizable panels

### Key Technical Details

#### AI Integration
- Uses OpenAI-compatible API endpoint (configurable via `API_URL`)
- Streaming responses with async generator pattern
- Custom XML tag parsing for file generation
- System instructions enforce:
  - **No ES6 modules** in generated JavaScript (use traditional scripts)
  - Modular code structure with creative folder organization
  - Project naming via `${projectName}` template variable
  - Sequential script loading via `<script>` tags

#### File Structure Support
- Multi-level folder hierarchy with parent/child relationships
- File types: HTML, CSS, JavaScript, TypeScript, JSON
- Automatic language detection from filename extensions
- Folder expansion state management
- Tab-based interface for open files

#### Layout System
- Custom resizable panels with mouse drag handlers
- Global drag overlay prevents iframe interference during resize
- Configurable sidebar width (default: 320px)
- Fullscreen preview mode
- Responsive three-panel layout

#### Preview System
- Iframe-based rendering with isolated JavaScript execution
- Automatic CSS injection into `<head>`
- JavaScript files appended before closing `</body>` tag
- Scripts execute sequentially without ES module support
- Preview refresh triggered by `previewKey` state change

## Important Constraints

### JavaScript in Preview
The preview environment does NOT support ES6 modules:
- NO `import`/`export` statements
- Use traditional function declarations, object literals, global variables
- Load utility files before files that depend on them
- Use IIFEs or global `window.` prefix for sharing code

### Project Naming
Projects use a `${projectName}` template variable that gets replaced with the actual project name. The AI service enforces using this as the root folder for all generated files.

## Development Notes

- **React 19** with TypeScript
- **Vite** for development server and building
- **Tailwind CSS** via CDN (not npm package)
- **Prism.js** via CDN for syntax highlighting
- **React Markdown** for chat message rendering
- **JSZip** for potential export functionality
- No testing framework configured
- No build process for CSS (uses Tailwind CDN and inline styles)
- Environment variables injected at build time via Vite's `define` option

## Build Output

- Production build goes to `dist/` directory
- Static assets are served from build output
- Vite HMR is disabled in preview iframe via meta tag
