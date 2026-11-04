# PhotoCraft Feature Inventory

This document summarizes PhotoCraft's user-visible features and major platform
capabilities. It is intended as a reference when evaluating which features to
incorporate into another design tool.

The inventory was cross-checked against:

1. Product and README feature descriptions.
2. The generated Photoshop menu catalog.
3. Tool, UI, brush, hardware, and localization parity documents.
4. File-format, CLI, automation, and control-protocol documentation.
5. Crate, application, packaging, testing, and infrastructure surfaces.

The exact command-level source is
[`crates/ui-egui/src/menu_catalog.rs`](../crates/ui-egui/src/menu_catalog.rs).
The generated menu report is
[`parity-checklist.md`](parity-checklist.md).

## Status terminology

This inventory includes completed, partial, and tracked capabilities:

- **Implemented**: documented as available and wired into the product.
- **Partial**: available with known limitations, incomplete fidelity, or
  platform-specific gaps.
- **Missing/tracked**: documented as unavailable or still planned.

The project is currently documented as alpha. Feature presence does not imply
Photoshop-level depth, performance, or file fidelity.

## Application and document management

- New, open, close, close-all, close-others, save, Save As, Save a Copy, and
  revert.
- Multiple document tabs and separate document windows.
- Document arrangement, tiling, and window geometry persistence.
- Recent files and command-line file opening.
- Drag-and-drop file opening.
- File associations and native open dialogs.
- File metadata and File Info.
- Unsaved-change protection.
- Autosave, crash recovery, and native `.pcraft` recovery stores.
- Atomic saves and background saving.
- Large-file progress handling.
- Unsupported-content warnings.
- Invalid-path warnings.
- File-type filtering.
- Portable configuration and per-user settings.
- Single-instance handoff on Windows and Linux.
- macOS LaunchServices open-document events.

## Document structure and layers

- Pixel layers.
- Layer groups and nested groups.
- Artboards.
- Layer ordering and duplication.
- Layer deletion, naming, and color labels.
- Layer visibility.
- Layer opacity and fill opacity.
- Position, pixel, transparency, and content locks.
- Multi-layer selection.
- Layer linking.
- Layer alignment and distribution.
- Layer filtering by kind, name, and blend mode.
- Layer thumbnails.
- Clip thumbnails to layer bounds.
- Layer properties and geometry.
- Layer via Copy and Layer via Cut.
- Copy Merged.
- Paste, Paste in Place, Paste Into, and Paste Outside.
- Merge layers and merge visible.
- Flatten image.
- Rasterize layers, type, shapes, and effects.
- Empty-layer cleanup.
- Compound layer properties.
- Layer comps and layer-comp application.
- History states and snapshots.
- History panel and history-state deletion.
- History Brush.
- Art History Brush (partial).

## Masks and channels

- Pixel layer masks.
- Vector masks.
- Filter masks.
- Smart-filter masks.
- Mask targeting.
- Selection-to-mask conversion.
- Path-to-mask conversion.
- Mask inversion.
- Mask density.
- Mask feathering.
- Mask disabling and deletion.
- Mask application.
- Mask editing and thumbnails.
- Alpha channels.
- Spot channels.
- Channel visibility and targeting.
- Channel duplication and deletion.
- Channel calculations.
- Quick Mask.
- Selection/channel conversion.
- Multichannel documents.
- Bitmap documents.
- Duotone documents.

## Color and image depth

### Color modes

- RGB.
- Grayscale.
- CMYK.
- Lab.
- Indexed Color.
- Bitmap.
- Multichannel.
- Duotone.
- Alpha channels.
- Spot channels.

### Sample depths

- 8-bit integer.
- 16-bit integer.
- 32-bit floating point.
- Depth-aware filters and adjustments.
- Depth-aware masks and compositing.
- Depth-aware PSD/PSB and TIFF I/O.
- Half/float OpenEXR handling.
- Warnings when exporting higher-depth data to 8-bit formats.

### Color management

- Embedded ICC profiles.
- Assign Profile.
- Convert to Profile.
- Perceptual rendering intent.
- Relative Colorimetric rendering intent.
- Saturation rendering intent.
- Absolute Colorimetric rendering intent.
- Black Point Compensation.
- Soft Proof Colors.
- Gamut Warning.
- Monitor-profile conversion.
- GPU display color transforms and 3D LUTs.
- CPU color-conversion fallback.
- Working-space handling.
- Gamma/linear blending behavior.
- Color-managed previews.
- Hex color entry.
- Screen color sampling.
- Pixel loupe.
- Out-of-gamut warnings.
- Nearest printable-color display.
- Foreground/background color chips.
- Swatches and color ramps.
- Color panel modes and copy commands.
- Color Wheel mode in the Color panel:
  - HSB sliders.
  - Hue ring.
  - Saturation/brightness triangle.
  - Foreground/background chip selection.
  - Add-to-Swatches action.
  - Drag and click editing.
  - Persistence across themes and saved UI state.

## Toolbox

### Move, layout, and selection

- Move Tool.
- Artboard Tool.
- Rectangular Marquee.
- Elliptical Marquee.
- Single Row Marquee.
- Single Column Marquee.
- Lasso.
- Polygonal Lasso.
- Magnetic Lasso.
- Object Selection.
- Object Finder.
- Quick Selection.
- Magic Wand.
- Select Subject.
- Classical subject selection.

### Crop, frame, slice, and measurement

- Crop.
- Perspective Crop.
- Slice.
- Slice Select.
- Frame Tool.
- Rectangular and elliptical frames.
- Eyedropper.
- Color Sampler.
- Ruler.
- Note Tool.
- Count Tool.
- Crop presets and saved presets.
- Crop aspect ratios.
- Crop width/height/resolution mode.
- Crop overlays.
- Crop rotation.
- Crop Content-Aware Fill.
- Delete Cropped Pixels.
- Crop straightening.
- Trim.
- Reveal All.

### Retouching

- Remove Tool.
- Spot Healing Brush.
- Healing Brush.
- Patch Tool.
- Content-Aware Move.
- Content-Aware Fill.
- Content-Aware Scale.
- Red Eye Tool.
- Clone Stamp.
- Pattern Stamp.
- Color Replacement.

### Painting and tonal tools

- Brush.
- Pencil.
- Mixer Brush.
- Eraser.
- Background Eraser.
- Magic Eraser.
- History Brush.
- Art History Brush.
- Paint Bucket.
- Gradient.
- Blur.
- Sharpen.
- Smudge.
- Dodge.
- Burn.
- Sponge.

### Paths and type

- Pen.
- Freeform Pen.
- Curvature Pen.
- Add Anchor Point.
- Delete Anchor Point.
- Convert Point.
- Path Selection.
- Direct Selection.
- Horizontal Type.
- Vertical Type.
- Horizontal Type Mask.
- Vertical Type Mask.

### Shapes and view

- Rectangle.
- Ellipse.
- Triangle.
- Polygon.
- Star through polygon options.
- Line.
- Custom Shape.
- Hand.
- Rotate View.
- Zoom.
- Quick Mask.
- Screen Mode.
- Toolbar customization.

## Selection features

- New selection.
- Add, subtract, and intersect selection modes.
- Feather.
- Expand.
- Contract.
- Smooth.
- Grow.
- Similar.
- Border.
- Reselect.
- Deselect.
- Inverse.
- Color Range.
- Focus Area.
- Select Subject.
- Select Sky.
- Select All.
- Select All Layers.
- Selection preview.
- Marching ants.
- Device-pixel marching ants.
- Selection transforms.
- Selection-to-mask conversion.
- Selection-to-path conversion.
- Selection-to-shape conversion.
- Selection-to-channel conversion.
- Selection-based filtering.
- Selection-based adjustments.
- Selection-based fill and stroke.
- Selection-based Content-Aware operations.

## Transform and warp

- Free Transform.
- Scale.
- Rotate.
- Skew.
- Distort.
- Perspective.
- Warp.
- Transform Again.
- Rotate 90 degrees clockwise.
- Rotate 90 degrees counter-clockwise.
- Rotate 180 degrees.
- Flip horizontal.
- Flip vertical.
- Puppet Warp.
- Perspective Warp.
- Content-Aware Scale.
- Horizontal, vertical, and crosswise warp splits.
- Warp-split removal.
- Warp meshes.
- Smart-object warp preservation.
- Transforming layers, type, shapes, masks, selections, paths, and artboards.
- Eight transform handles.
- Proportional and free scaling.
- Centered scaling.
- Rotation snapping.
- Numeric transform fields.
- Horizontal and vertical skew fields.
- Transform previews.
- Transform commit and cancel.
- Transform undo/redo.
- Selection-bound transform boxes.

## Brush engine and painting

### Brush settings

- Brush Tip Shape: size, angle, roundness, hardness, spacing, and flips.
- Shape Dynamics: size, angle, roundness, pressure, tilt, rotation, wheel,
  minimums, flip jitter, and projection.
- Scattering on both axes.
- Count and count jitter.
- Texture pattern, scale, brightness, contrast, mode, depth, and per-tip
  behavior.
- Dual Brush.
- Color Dynamics: foreground/background, hue, saturation, brightness, purity,
  and per-tip behavior.
- Transfer: opacity, flow, wetness, mix, jitter, and controls.
- Brush Pose: tilt, rotation, pressure, and independent tilt-axis overrides.
- Noise.
- Wet Edges.
- Build-up.
- Protect Texture.
- Smoothing, Pulled String, Stroke Catch-up, Catch-up on End, and Adjust for
  Zoom.
- Section locks.
- Per-section state.
- Brush Settings persistence.
- Brush preset import/export.
- Brush preset preview, filtering, renaming, and deletion.
- Brush list/grid views.
- Brush picker and picker scaling.
- Brush picker card customization.
- Define Brush Preset from Selection.
- Dragged tip previews.
- Deterministic and replayable brush strokes.

### Painting gestures

- Pressure-sensitive size, opacity, and flow.
- Tilt-sensitive angle and roundness.
- Rotation-sensitive behavior where supported.
- Eraser-end behavior where supported.
- `[` and `]` size changes.
- `Shift+[`, `Shift+]` hardness changes.
- Number-key opacity.
- Shift-number flow.
- Alt/Option color sampling.
- Shift-click straight strokes.
- Temporary erase with `~`.
- Control/Option or Alt/right-drag size and hardness adjustment.
- Brush preset picker.
- Caps Lock precision cursor.
- Normal, full-size, and precise cursor modes.
- Rotated/flipped-view brush cursors.
- Live Brush and Eraser strokes.
- Live retouch-tool previews (Mixer Brush remains partial).

### Brush symmetry

- Vertical symmetry.
- Horizontal symmetry.
- Dual-axis symmetry.
- Diagonal symmetry.
- Symmetry from a path.
- Make Symmetry Path.

Tracked gaps include wavy, circle, spiral, parallel-line, radial, and mandala
symmetry; complete bristle, airbrush, and erodible tips; image-file brush-tip
creation; per-control pressure curves; and full platform-independent pen
behavior.

## Layers, blending, fills, and effects

### Blending and opacity

- Layer opacity.
- Layer fill.
- Photoshop blend modes.
- Paint blend modes.
- Paint.NET blend-mode variants.
- Pass-through groups.
- Clipping masks.
- Clipping bases.
- Advanced blending.
- Channel-specific blending.

### Fill and adjustment layers

- Solid-color fill layers.
- Gradient fill layers.
- Pattern fill layers.
- Editable fill parameters.
- Fill masks.
- Fill-layer copy and paste.
- Brightness/Contrast.
- Levels.
- Curves.
- Exposure.
- Vibrance.
- Hue/Saturation.
- Color Balance.
- Black & White.
- Photo Filter.
- Channel Mixer.
- Color Lookup.
- Invert.
- Posterize.
- Threshold.
- Gradient Map.
- Selective Color.
- Shadows/Highlights.
- Replace Color.
- Match Color.
- HDR Toning.
- Desaturate.
- Equalize.
- Per-channel Curves.
- Live histograms.
- Adjustment masks and clipping.
- Live adjustment previews.
- Adjustment copy/paste.
- CMYK, Lab, and 32-bit adjustment behavior.

### Layer styles

- Drop Shadow.
- Inner Shadow.
- Outer Glow.
- Inner Glow.
- Bevel and Emboss.
- Satin.
- Color Overlay.
- Gradient Overlay.
- Pattern Overlay.
- Stroke.
- Effect ordering and visibility.
- Hide all effects.
- Copy and paste styles.
- Style editing on pixel, type, and shape layers.
- PSD style import/export.
- Pattern libraries.
- `.pat` import/export.

### Smart objects and smart filters

- Embedded smart objects.
- Linked smart objects.
- Smart-object placement and replacement.
- Smart-object editing.
- Lossless transforms and warps.
- Smart filters.
- Smart-filter masks.
- Smart-filter reordering.
- Smart-filter visibility.
- Smart-filter deletion.
- Smart-filter editing.
- Smart-filter parameter preservation.
- Legacy Photoshop smart-object block reading.
- Modern smart-object block writing.
- Cylinder, custom mesh, and preserved warp behavior.

## Filters and image processing

### Blur and focus

- Gaussian Blur.
- Box Blur.
- Motion Blur.
- Radial Blur.
- Surface Blur.
- Smart Blur.
- Lens Blur.
- Shape Blur.
- Tilt-Shift.
- Iris Blur.
- Field Blur.
- Spin Blur.
- Path Blur.

### Sharpen and noise

- Sharpen.
- Sharpen Edges.
- Sharpen More.
- Smart Sharpen.
- Unsharp Mask.
- Shake Reduction.
- Reduce Noise.
- Dust and Scratches.
- Median.
- Despeckle.

### Distort

- Twirl.
- Wave.
- Ripple.
- Spherize.
- Pinch.
- Polar Coordinates.
- Shear.
- ZigZag.
- Displace.
- Glass.
- Ocean Ripple.
- Diffuse Glow.
- Lens Correction.
- Adaptive Wide Angle.
- Perspective Warp.

### Pixelate and stylize

- Color Halftone.
- Crystallize.
- Facet.
- Fragment.
- Mezzotint.
- Mosaic.
- Pointillize.
- Find Edges.
- Glowing Edges.
- Emboss.
- Solarize.
- Wind.
- Diffuse.
- Extrude.
- Oil Paint.
- Tiles.
- Trace Contour.

### Render and filter infrastructure

- Clouds.
- Difference Clouds.
- Fibers.
- Lens Flare.
- Lighting Effects.
- Flame.
- Tree.
- Picture Frame.
- Filter Gallery.
- Live filter previews.
- Filter application through selections.
- Smart-object filters.
- Editable smart filters.
- Filter masks.
- Filter ordering.
- Filter parameter serialization.
- Filter recording.
- Filter fade.
- Filter cancellation.
- CPU parallel filtering.
- Adaptive blur optimization.

## Image operations

- Image Size.
- Canvas Size.
- Canvas rotation.
- Crop.
- Trim.
- Reveal All.
- Auto Tone.
- Auto Contrast.
- Auto Color.
- Equalize.
- Duplicate Image.
- Apply Image.
- Calculations.
- Mode conversion.
- Bit-depth conversion.
- Profile assignment.
- Profile conversion.
- RGB/CMYK/Lab conversion.
- Grayscale conversion.
- Indexed-color conversion.
- Bitmap conversion.
- Duotone conversion.
- HDR Toning.
- Variables and data sets.
- Image Statistics.
- Contact Sheet.
- Photomerge.
- Merge to HDR Pro.
- Crop and Straighten Photos.
- Fit Image.
- Lens Correction.
- Image Processor.
- Load Files into Stack.
- Auto-align layers.
- Auto-blend layers.
- Panorama workflows.
- HDR workflows.

## Paths and vector design

- Paths panel.
- Work paths.
- Saved paths.
- Vector masks.
- Pen paths.
- Freeform and Curvature paths.
- Anchor-point editing.
- Direction-handle editing.
- Add/delete/convert points.
- Path Selection and Direct Selection.
- Path fill and stroke.
- Path-to-selection conversion.
- Selection-to-work-path conversion.
- Free Transform Path.
- Path duplication and deletion.
- Paths to Illustrator.
- Shape layers.
- Compound shape operations:
  - Unite.
  - Subtract.
  - Intersect.
  - Exclude.
- Shape fills and strokes.
- Gradient and pattern shape fills.
- Corner controls.
- Shape density and feathering.
- Resolution-independent shape rendering.
- PSD shape-layer round trips.

## Typography

- Point, paragraph, and area text.
- Type on a path.
- Horizontal and vertical type.
- Type masks.
- Character panel.
- Paragraph panel.
- Font family, style, and size.
- Leading.
- Tracking.
- Kerning.
- Baseline shift.
- Faux bold and faux italic.
- Alignment and direction.
- Paragraph direction.
- Text color.
- Type Color Picker.
- Font preview and recent fonts.
- Font search.
- Canvas text editing.
- Text selection.
- Cut, copy, and paste in text editing.
- Spell checking.
- Find and Replace Text.
- Warp Text.
- Rasterize Type.
- Convert type to shape.
- Create Work Path.
- Point/paragraph conversion.
- Anti-aliasing modes.
- Editable PSD type layers.
- Legacy PSD text compatibility.
- CJK and IME behavior.
- Japanese vertical text.
- Unicode shaping.
- Bidirectional text helpers.
- RTL paragraph controls.
- Devanagari shaping.
- Hangul support.

## Export, printing, and publishing

- Quick Export as PNG.
- Export As.
- Export Preferences.
- Save for Web Legacy.
- Artboards to Files.
- Artboards to PDF.
- Layers to Files.
- Layer Comps to Files.
- Color Lookup Tables.
- Data Sets as Files.
- Paths to Illustrator.
- Render Video command surface.
- Image Assets generation.
- Package.
- JPEG quality and options.
- PNG transparency.
- TIFF compression.
- WebP quality and lossless options.
- Export scaling.
- Export previews.
- File-size estimates.
- Multi-format export.
- Flattened PDF export.
- Layered-document export.
- Depth-preserving export where supported.
- Export warnings for depth reduction.
- Print.
- Print One Copy.
- Print Functions.
- Bleed settings.
- Native print dialogs.
- CUPS/IPP printing.
- Linux print portal support.

## File formats

### Document formats

- PSD.
- PSB.
- Layered TIFF.
- Native `.pcraft`.
- OpenRaster.
- GIMP XCF.
- Krita KRA.
- Paint.NET PDN.
- Affinity `.af`.
- Affinity `.afdesign`.
- Affinity `.afphoto`.
- Affinity `.afpub`.

### Raster formats

- PNG.
- JPEG.
- TIFF.
- Lossy WebP.
- Lossless WebP.
- Animated WebP.
- GIF.
- BMP.
- Indexed BMP.
- TGA.
- ICO.
- QOI.
- PBM.
- PGM.
- PPM.
- PNM.
- PAM.
- PFM.
- OpenEXR.
- Radiance HDR.
- FITS.
- PCX.
- DDS.
- XPM.
- DPX.
- Cineon.
- Amiga IFF/ILBM.
- DICOM.
- HEIC.
- HEIF.
- HIF.
- AVIF writing through optional build support.

### Camera RAW

- DNG.
- CR2.
- CR3 with limitations.
- NEF.
- NRW.
- ARW.
- PEF.
- ORF.
- RW2.
- RAF.
- Camera Raw defaults.
- Camera profiles.
- Calibration.
- Auto controls.
- Sidecar behavior.
- Lossy DNG support.
- RAW preview development.
- GPU per-pixel Camera Raw preview stages.

### Presets and data files

- Photoshop brushes `.abr`.
- Gradients `.grd`.
- Layer styles `.asl`.
- Swatches `.aco`.
- Color tables `.act`.
- Swatch Exchange `.ase`.
- Keyboard shortcuts `.kys`.
- Patterns `.pat`.
- Actions `.atn`.
- Contours `.shc`.
- LUTs `.cube`, `.3dl`, and `.look`.
- SVG and SVGZ.

Documented limitations include Adobe cloud PSD, AVIF decoding, JPEG XL,
Affinity export, complete Photoshop PDF fidelity, and some Photoshop files that
PhotoCraft can read but does not yet write in a way Photoshop reliably accepts.

## Automation and agents

### Command system

- Central command registry.
- Stable command IDs.
- Typed serializable parameters.
- Command enablement checks.
- Command labels and menu paths.
- UI, CLI, MCP, and control-server dispatch through the same commands.
- Command inspection.
- Command recording and replay.
- Command history.
- Command palette.
- Menu invocation.

### CLI

- Headless open.
- Inspect.
- Convert.
- Execute commands.
- Batch processing.
- Action-file processing.
- Output saving.
- Image Processor workflows.
- MCP server mode.
- MCP bridge mode.
- Subcommand help.
- Shell completions.
- Man-page generation.
- Unknown-flag rejection.
- Same-name output protection.
- Background command steps.
- Headless save safety.

### Control channel and MCP

- Loopback-only JSON-lines server.
- Token authentication.
- Token-file authentication.
- UI inspection.
- UI state changes.
- Tool selection.
- Panel state changes.
- Zoom and theme control.
- Brush and shape-stroke control.
- Menu listing and invocation.
- Engine command listing and execution.
- Pointer events.
- Keyboard events.
- Screenshot capture.
- Offscreen rendering.
- Queue timeout reporting.
- Dispatched-but-no-reply timeout reporting.
- Automation read/write roots.
- MCP bridge support.

### Actions and plugins

- Action recording and playback.
- `.atn` import and export.
- Action event mapping.
- Save As and Save a Copy action mapping.
- Folder-destination handling.
- Actions across multiple documents.
- Batch action execution.
- Droplet command surface.
- Script Events Manager command surface.
- Variable Data Sets.
- WebAssembly plugin support.
- Sandboxed plugin execution.
- Plugin filter integration.

Not fully supported are Photoshop `.8bf` plugins, UXP, ExtendScript, Photoshop
Libraries, and complete Photoshop scripting compatibility.

## UI and workspace

### Themes and design system

- Pro.
- Pro Medium.
- Studio.
- Studio Light.
- Classic.
- Dark and light variants.
- Shared design tokens.
- Shared colors, radii, spacing, and widgets.
- UI scale presets from 105% through 120%.

### Panels and workspace

- Layers.
- Channels.
- Paths.
- Properties.
- Adjustments.
- History.
- Brush Settings.
- Brushes.
- Color.
- Swatches.
- Gradients.
- Patterns.
- Styles.
- Navigator.
- Histogram.
- Info.
- Character.
- Paragraph.
- Tool Presets.
- Actions.
- Clone Source.
- Camera Raw-related panels.
- Document tabs.
- Panel docking.
- Panel resizing.
- Panel collapse.
- Panel tab ordering.
- Dock group ordering.
- Dock height persistence.
- Workspace persistence and locking.
- In-app floating panels.
- Multiple document windows.

### Navigation and menus

- Rulers.
- Guides.
- Smart Guides.
- Grids.
- Snapping to guides, grid, layers, and bounds.
- Extras visibility.
- Transform-control visibility.
- Pixel aspect ratio.
- Screen modes.
- Full-screen mode.
- Canvas rotation and flip.
- Navigator.
- Status bar.
- Color samplers.
- Measurement readouts.
- Keyboard menu navigation.
- Context menus.
- Accessibility labels.
- Screen-reader labels.

### Context menus

- Layer menus.
- Selection menus.
- Crop menus.
- Brush-preset menus.
- Type-editing menus.
- Committed-type menus.
- Path menus.
- Path Selection and Direct Selection menus.
- Zoom and Hand menus.
- Pasteboard menus.
- Panel-row menus.
- Document-tab menus.
- Conditional enablement and reasons.
- Keyboard context-menu navigation.
- Escape/outside-click dismissal.
- Target-specific hit testing.
- Protection against accidental painting or transformation.

## Rendering and performance

- CPU compositor.
- GPU compositor.
- wgpu.
- Metal.
- Vulkan.
- DirectX 12.
- OpenGL fallback.
- WebGPU.
- WebGL2 fallback.
- CPU rendering fallback.
- GPU/CPU parity tests.
- 1/255 rendering tolerance target.
- Copy-on-write 256×256 tiles.
- Sparse tile storage.
- Arc-shared document payloads.
- Cached effect maps.
- Rayon parallel processing.
- Background jobs.
- Job cancellation.
- Progress reporting.
- Large-radius blur optimization.
- Cached color transforms.
- GPU display LUTs.
- Large-document handling.
- GPU texture-limit CPU fallback.
- Software adapter mode.
- Safe GPU startup.
- GPU crash markers.
- Renderer fallback on restart.
- Linux GPU adapter selection.
- Frame-latency selection.
- FIFO, auto-vsync, and no-vsync presentation modes.
- Stroke tracing.
- Performance benchmarks and baselines.
- Budget enforcement.
- Nightly performance testing.
- Memory and GPU-memory measurements.

Known engineering gaps include several over-budget interaction scenarios,
high memory use for large documents, and a high-layer-count GPU failure case.

## Hardware and platform support

### Platforms

- macOS.
- Windows.
- Linux.
- FreeBSD.
- WebAssembly/browser.

### Pen and tablet input

- Pressure.
- Tilt.
- Rotation.
- Eraser-end input.
- Pressure curves.
- macOS AppKit monitoring.
- Windows WM_POINTER.
- Linux XInput2.
- Linux Xwayland fallback.
- Web Pointer Events.
- Stylus feed integration.
- Pen cursor behavior.
- Barrel-button behavior.

### Displays and input hardware

- High-DPI rendering.
- Physical 100% zoom.
- Multiple monitors.
- Per-display monitor profiles on macOS.
- Configurable ICC profiles on other platforms.
- Trackpad pinch zoom.
- Two-finger pan.
- Trackpad rotation.
- Touch-screen pointer input.
- Multiple native document windows.
- X11/Xwayland selection.
- Native and custom title bars.
- Caption controls.
- Window resizing.
- Window geometry persistence.

Tracked platform gaps include HDR/EDR output, Touch Bar, 3D mouse, MIDI,
Surface Dial, complete Windows touch support, native floating OS panels, and
WIA/TWAIN scanner integration.

## Localization and text internationalization

### Shipped language catalogs

- English.
- Simplified Chinese.
- Traditional Chinese.
- Spanish.
- French.
- Brazilian Portuguese.
- Indonesian.
- Japanese.
- German.
- Korean.
- Russian.
- Ukrainian.
- Czech.
- Polish.
- Greek.
- Dutch.
- Italian.
- Turkish.
- Serbian.

### International text features

- Translation catalogs.
- Plural handling.
- Dynamic-label translation.
- CJK fonts.
- Japanese vertical type.
- IME pre-edit and commit.
- Korean text support.
- Devanagari shaping.
- Arabic shaping helpers.
- Bidirectional text helpers.
- RTL shell layout.
- Paragraph direction controls.
- Locale-sensitive labels.
- Localized accessibility labels.

Known gaps include incomplete Hindi, Arabic, and Vietnamese coverage, English
engine errors and parameter help, incomplete RTL panel internals, incomplete
browser locale detection, and some IME/font limitations.

## Reliability and safety

- Strict panic-related Clippy lints.
- No production `unwrap`, `expect`, `panic`, `todo`, or `unreachable`.
- Input bounds validation.
- Checked and saturating arithmetic.
- Bounded recursion.
- Bounded file reads.
- Bounded control-channel input.
- Panic-hunt command testing.
- Crash guard.
- GPU crash detection.
- Safe GPU relaunch.
- Lock-poison recovery.
- Atomic file writes.
- Crash recovery.
- Temporary-file cleanup.
- Corrupt-file error reporting.
- Unsupported-feature errors.
- Large-allocation guards.
- Corpus regression tests.
- Synthetic malformed-input tests.
- Layer dependency checks.
- WASM checks.
- Localization coverage checks.
- Scorecard generation and verification.

## Build, packaging, and distribution

- Cargo workspace.
- Rust edition 2024.
- Rust 1.95 minimum.
- Workspace lint inheritance.
- Native release builds.
- WASM release profile.
- Thin LTO.
- Fat LTO for WASM.
- WASM size optimization and size gate.
- macOS packaging.
- Windows packaging.
- Linux AppImage.
- Linux `.deb`.
- Linux `.rpm`.
- Linux tarball.
- Linux Flatpak.
- FreeBSD packaging.
- Web hosting configuration.
- Application icons.
- Desktop-file integration.
- macOS signing and notarization workflow.
- Windows installer and version resources.
- Linux launcher registration.
- Optional external `craft-fonts` build input.
- Version generation.
- Corpus fetching and hash verification.
- Layer, WASM, CI, statistics, parity, performance, corpus, and scorecard
  commands through `xtask`.

## Authoritative references

- [Project guidance](../AGENTS.md)
- [Architecture](architecture.md)
- [Development guide](development.md)
- [Control protocol](control-protocol.md)
- [Roadmap](../ROADMAP.md)
- [Detailed roadmap](roadmap.md)
- [Target-app parity](target-app-parity.md)
- [Known gaps](gaps.md)
- [Scorecard](scorecard.md)
- [Menu parity checklist](parity-checklist.md)
- [UI parity](ui-parity.md)
- [Brush parity](brush-parity.md)
- [Context-menu parity](context-menu-parity.md)
- [File-format parity](file-format-parity.md)
- [Hardware parity](hardware-parity.md)
- [Localization parity](localization-parity.md)
