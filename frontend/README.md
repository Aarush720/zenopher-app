# Zenopher — Desktop-First Creative Design Application

Zenopher is a desktop-first creative design application built strictly to the Zenopher Frontend UI Specification and User Workflow architecture.

## Visual & Interaction System

- **Monochrome Surfaces**: Pure `#000000` workspace, `#111111` floating panels, `#2C2C2C` control containers, and `#FFFFFF` high-contrast typography and actions. No `#6684FF` blue accents.
- **Floating Panels**: Strict separation via spatial contrast and 14px grid spacing. Zero shadows, zero borders, zero outlines, zero glows, and zero glassmorphism on regular surfaces.
- **Blurred Modal Backdrops**: `backdrop-filter: blur(18px)` with `rgba(0, 0, 0, 0.48)` backdrops for popups while modal panels remain flat `#111111` surfaces.
- **Consistent Geometry Tokens**:
  - Panel Radius: `26px`
  - Section Radius: `22px`
  - Tile Radius: `18px`
  - Control Radius: `16px`
- **Two Creative Levels**:
  - **Creative Mode**: Quiet, distraction-free environment. No findings, no teacher indicators, no quality counters.
  - **Corporate Mode**: Continuous layout checks (Contrast, Text Size, Alignment, Spacing, Crop, Style Consistency) with one-click fixes and "Apply all".

## Features & Destinations

1. **Navigation Rail**: Square 48×48px icon controls for Home, Designs, Templates, Trash (30-day retention countdown), Tutorials, Style Library, Settings, Privacy, Help, Legal, and "Sign in (coming later)".
2. **Floating Top Bar**: Search bar with `⌘K` shortcut, back/forward history navigation, context headers, and mode/export action chips.
3. **Creation Wizard**: Step-by-step modal for Choose Size (Instagram post, A4 document, Business card, Presentation slide, Custom) → Choose Mode (Creative vs Corporate) → Choose Style (Bauhaus, Swiss Modernism, Editorial Luxe, Brutalist Grid, Neo-Corporate) → Editor.
4. **Editor**:
   - `FloatingLayersPanel`: Object hierarchy, visibility toggles, lock controls, reordering, inline rename.
   - `FloatingCanvasWorkspace`: Interactive artboard with pan/zoom, grid toggle, guide toggle, preview mode, and direct layer manipulation.
   - `FloatingPropertiesPanel`: Compact accordion rows for Position, Size, Rotation, Alignment, Typography, Color, and Effects.
   - `ReviewPanel`: Categorized checklists with measured values, required criteria, and instant fix actions in Corporate mode.
5. **Local Storage & Export**: Complete IndexedDB persistence for offline-first resilience. Export lossless `.zph` (Zenopher Project JSON), `.png` (1x, 2x, 3x raster), or `.svg` (vector markup).

## Development

```bash
# Install dependencies
npm install

# Start local development server (port 3000)
npm run dev

# Build for production
npm run build
```

## PhotoCraft Creative Mode

Creative Mode is rendered by PhotoCraft's Rust/egui WebAssembly app. Zenopher
does not recreate that editor in React. Build PhotoCraft first, then serve its
generated browser files at `/photocraft/index.html`:

```bash
cd ../photocraft-main-2/apps/photocraft-web
trunk build --release
mkdir -p ../../../frontend/public/photocraft
cp -R ../../dist/web/. ../../../frontend/public/photocraft/
```

Then start Zenopher with `npm run dev`. To point at a separately hosted
PhotoCraft build, set `VITE_PHOTOCRAFT_WEB_URL` in `.env`.

The two apps communicate through a same-origin `postMessage` bridge. Zenopher
sends `zenopher:open-design` with the `Design` JSON; PhotoCraft replies with
`photocraft:ready`, `photocraft:opened`, or `photocraft:error`. The host's
`Save .pcraft` control sends `zenopher:save`, and PhotoCraft returns the native
`.pcraft` bytes as a structured-cloned `Uint8Array` in `photocraft:saved`.
When PhotoCraft is hosted on another origin, the host passes its origin through
the `zenopherOrigin` query parameter and the Rust side validates it before
accepting messages.

