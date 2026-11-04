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

To run the frontend, backend and persistent local database together, run
`./run-project.sh` from the repository root and open `http://127.0.0.1:3000`.

## Performance checks

Corporate reviews run in a dedicated Web Worker. The teacher schedules work after
edits, pauses during gestures and hidden tabs, and stops waking once a review is
complete. Unchanged layer objects retain their revision without hashing image
payloads. Secondary screens and the teacher runtime load on demand.

Local writes coalesce for 300 ms (with a two-second maximum during continuous
editing) and flush when leaving a document or hiding the page. API sync skips
unchanged remote versions and limits concurrent document downloads to three.
The PhotoCraft host skips sync during gestures and uses a slower idle fallback;
asynchronous PhotoCraft commands can therefore take up to 15 seconds to reach
the outer app while idle.

From `zenopher-backend`, run `npm run test:frontend` for scheduling, persistence,
sync and real worker/WASM integration regressions, and `npm run benchmark:teacher`
for repeatable idle checks and full 1,000-shape / 200-text-layer reviews. These checks do not measure browser
frame rate or GPU-heavy PhotoCraft filters; those still need browser profiling.

## PhotoCraft editor modes

Creative and Corporate modes use PhotoCraft's Rust/egui WebAssembly editor with
a shared React host menu. Package PhotoCraft before updating the local bundle
so its boot loader, compressed WASM and generated JavaScript stay matched:

```bash
cd ../photocraft-main-2
CARGO_PROFILE_WASM_RELEASE_LTO=thin packaging/web/package.sh
rm -rf ../frontend/public/photocraft
mkdir -p ../frontend/public/photocraft
unzip -q dist/release/photocraft-web-*.zip -d /tmp/photocraft-package
cp -R /tmp/photocraft-package/photocraft-web-*/. ../frontend/public/photocraft/
```

The packaged site includes the boot loader, compressed WASM parts, generated
glue, and generated eframe snippets at `/photocraft/index.html`. A direct
`trunk build --release` runs PhotoCraft standalone; the Zenopher iframe uses the
packaged boot loader and compressed parts.

Then start Zenopher with `npm run dev`. PhotoCraft is intentionally loaded from
the local `/photocraft/index.html` bundle during development.

The local rebuild uses thin LTO to reduce link time while keeping the release
optimization levels for drawing and image operations. Omit that environment
override when producing the smallest distribution bundle with full LTO.

The two apps communicate through a same-origin `postMessage` bridge. Zenopher
sends `zenopher:open-design` with the `Design` JSON; PhotoCraft replies with
`photocraft:ready`, `photocraft:opened`, or `photocraft:error`. The host's
`Save .pcraft` control sends `zenopher:save`, and PhotoCraft returns the native
`.pcraft` bytes as a structured-cloned `Uint8Array` in `photocraft:saved`.

Both editor modes use the shared React Bits PillNav menu bar. With
`zenopherMenu=pill`, the iframe hides its native menu row. `zenopher:menu-list`
and `zenopher:menu-invoke` return correlated `photocraft:menu-result` replies
from the native catalogue and menu dispatcher, preserving command enablement,
modal restrictions, dialogs, shortcuts, appearance and workspace presets.
Rebuild the PhotoCraft bundle after changing this protocol; replacing only the
React source leaves the old WASM unable to answer menu requests.

Safari uses the embedded editor's WebGL2 renderer: the current WebGPU build
clips its canvas after the first 1024-pixel compositor chunk on Safari. This is
a display issue; the design dimensions remain intact. Both modes keep the
design's own width and height, including portrait and landscape presets.
For a synthetic browser check without opening saved work, visit
`/test/canvas-preview.html` on the development server. The page can compare
renderers, sizes and modes and never persists its test document.


Teacher fixes use `zenopher:teacher-fix` / `photocraft:teacher-result`. A request carries
native layer IDs and the last confirmed canvas revision. The editor rejects stale revisions,
coalesces the existing engine commands into one undo step, and returns confirmed content.
The worker waits for that response before recording a successful fix. The synthetic local
`/test/teacher-preview.html` page verifies this path without saving a design.

Both Zenopher modes start with **Show Transform Controls** enabled. Select an object
with the Move tool (`V`), drag its corner or edge handles, and press Enter to apply
the transform (Escape cancels). The checkbox in the existing options bar can hide
the handles when desired.
