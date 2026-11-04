# Zenopher teacher

Rust crate (compiles into the engine WASM) plus a thin TypeScript shell.

```
src/            engine side: model, colour (OKLab/WCAG), config, style loader, background sampling,
                measurements, rules, classification, finding store, fix planner, scheduler, hints, teacher API
tests/          the spec's section 12 worked example as a real snapshot, plus gesture, dismissal, apply-all, privacy tests
web/src/teacher TypeScript services: bridge, catalog sync, event recorder, critique client + prompt/validator, React hook + panel
```

Run: `cargo test` · WASM: `wasm-pack build --target web --features wasm` · Shell: `cd web && npm i && npm run typecheck`

## Wiring into the engine
1. Construct `Teacher::new(Config::default())` inside the engine; give `pump` your real `Renderer` (draw page with the layer hidden, read pixels). `GeometricRenderer` is only a fallback.
2. After every recorded command call `on_change(layer_ids, page_changed, now)`; bump `Layer.version` on change. Call `gesture_start/gesture_end` around drag, transform and typing.
3. Call `pump(snapshot, renderer, now)` from a ~50 ms timer. Run `apply`/`commit_apply_all` commands as one undo step.

## Decisions where the spec was silent or cut off (all are data or one function; change freely)
- Background confidence: spread < 0.03 → 1.0, < 0.12 → 0.7, else 0.4; no pixels → 0.3.
- Leading below the minimum is Must (lines collide); above the maximum is Optional.
- Overlap: text/text > 10% is Must; shape/shape > 25% is Optional and ignores one shape fully inside another.
- Spacing: rows/columns of ≥3 similar-sized objects; Must only with ≥5 objects (confidence 0.5 otherwise, so it drops to Optional).
- Alignment compares left/centre/right (top/middle/bottom); if any edge pair already lines up, nothing is raised. The object not anchored by the page moves, else the smaller one.
- Contrast fix picks the smaller lightness change (darker or lighter), same hue. Your example 1 says "darken"; for light text on mid blue, lightening is usually closer.
- Colour shares come from a 64×64 raster of the page background and shape fills. Photos are excluded; text is left out.
- Dismissed page-wide findings return when the measured value moves by more than 0.05.
- Hint policy never hides or re-ranks a Must finding.

## Things to check in the spec
- `colour.chroma_accent = 0.20` is hard to reach: in OKLCH, even pure yellow tops out near 0.21, and typical saturated yellows are 0.17–0.19, so they never count as accent. 0.15 is probably what you want.
- The D1 `learning_events` table has `command_id`, but section 16.4 records `rule` and `class`. The recorder sends `rule`/`class`; align the table.
- Rule evaluation is whole-page on each run. Only background sampling is cached incrementally (by layer and layers beneath). Pair rules stop at 400 objects and report themselves unavailable.

## Review efficiency and fix safety

The frontend runs this crate in a dedicated worker. The bridge creates one snapshot per review,
sleeps when there is no work, and pauses during gestures and hidden tabs. Colour statistics,
text hierarchy and identical contrast-fix searches are shared across slices of the same review.
Grid edge matching sorts edges instead of comparing every object pair. Findings retain cached
keys and display order, so reading a badge or looking up a fix does not sort the entire list.

Edits, mode changes and style changes invalidate automatic fixes until a complete review finishes.
Apply-all commits must match the plan the engine issued, including its commands. Failed checks
retain previous findings as manual guidance; uncertain photographic or unsupported geometric
backgrounds never authorize an automatic colour fix.

The live PhotoCraft bridge checks the canvas revision, executes existing engine commands as one
undo step, and restores the document/history if a batch fails. The teacher waits for the canvas
acknowledgement before recording a successful outcome. Initial sync supplies native layer IDs;
React receives the confirmed document content rather than an optimistic copy.

Run `npm run test:frontend` and `npm run benchmark:teacher` from `../zenopher-backend`.
The benchmark includes warmed full reviews of 1,000 shapes and 200 text layers, plus the idle
scheduler case. Timings are synthetic CPU measurements, not browser frame-rate guarantees.
The remaining pair rules still report themselves unavailable above 400 layout objects. The
geometric renderer cannot inspect photo pixels, and text line counts in the frontend snapshot
are estimated from bounds; a renderer/layout-backed snapshot is needed for more precise checks.
For a local, non-persistent browser integration check, open
`http://127.0.0.1:3000/test/teacher-preview.html` and apply the synthetic teacher fixes.

Native raster layers may carry a verified `reviewFill` colour when every exported
RGBA pixel matches. The snapshot adapter uses that colour for review only; the
original image remains intact. Opaque shapes can also hide unknown photo pixels
below them. Genuine photo/gradient uncertainty and impossible colour-only fixes
remain manual, with the reason included in the existing rule explanation.
