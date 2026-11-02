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
