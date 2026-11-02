//! Background colour behind a text layer: sample, take the median in OKLab, rate confidence from the spread.
use crate::color::*;
use crate::config::BackgroundCfg;
use crate::model::*;
use std::collections::HashMap;

#[derive(Clone, Copy, Debug)]
pub struct BgSample {
    pub color: Color,
    pub spread: f32,
    pub confidence: f32,
}

/// The engine implements this with its real renderer: draw the page with `layer` hidden and read pixels.
/// Return None when pixels are unavailable.
pub trait Renderer {
    fn sample_behind(
        &self,
        snap: &Snapshot,
        layer: &Layer,
        points: &[(f32, f32)],
    ) -> Option<Vec<Color>>;
}

/// Fallback that composites shape fills below the layer. Photos make it give up (low confidence),
/// because it cannot know their pixels.
pub struct GeometricRenderer;

fn shape_hit(l: &Layer, x: f32, y: f32) -> bool {
    if !l.bounds.contains_point(x, y) {
        return false;
    }
    if l.shape == Some(ShapeKind::Ellipse) {
        let (rx, ry) = (l.bounds.w / 2.0, l.bounds.h / 2.0);
        if rx <= 0.0 || ry <= 0.0 {
            return false;
        }
        return ((x - l.bounds.cx()) / rx).powi(2) + ((y - l.bounds.cy()) / ry).powi(2) <= 1.0;
    }
    l.shape != Some(ShapeKind::Line)
}

pub fn shape_contains(l: &Layer, x: f32, y: f32) -> bool {
    shape_hit(l, x, y)
}

impl Renderer for GeometricRenderer {
    fn sample_behind(
        &self,
        snap: &Snapshot,
        layer: &Layer,
        points: &[(f32, f32)],
    ) -> Option<Vec<Color>> {
        let idx = snap.index_of(layer.id)?;
        let below: Vec<&Layer> = snap.layers[..idx]
            .iter()
            .filter(|l| l.visible && l.opacity > 0.0)
            .collect();
        let mut out = Vec::with_capacity(points.len());
        for &(x, y) in points {
            let mut c = snap.page.background.with_alpha(1.0);
            for l in &below {
                match l.kind {
                    LayerKind::Image if l.bounds.contains_point(x, y) => return None,
                    LayerKind::Shape if shape_hit(l, x, y) => {
                        if let Some(f) = l.fill {
                            c = composite(f.with_alpha(f.a * l.opacity), c);
                        }
                    }
                    _ => {}
                }
            }
            out.push(c);
        }
        Some(out)
    }
}

fn median(v: &mut [f32]) -> f32 {
    v.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = v.len();
    if n % 2 == 1 {
        v[n / 2]
    } else {
        (v[n / 2 - 1] + v[n / 2]) / 2.0
    }
}

pub fn sample_background(
    snap: &Snapshot,
    layer: &Layer,
    r: &dyn Renderer,
    cfg: &BackgroundCfg,
) -> BgSample {
    let page = snap.page.rect();
    let mut b = layer.bounds;
    let x0 = b.x.max(page.x);
    let y0 = b.y.max(page.y);
    let x1 = b.right().min(page.right());
    let y1 = b.bottom().min(page.bottom());
    if x1 > x0 && y1 > y0 {
        b = Rect::new(x0, y0, x1 - x0, y1 - y0);
    }
    let n = (cfg.max_samples as f32).sqrt().floor().max(1.0) as usize;
    let mut points = Vec::with_capacity(n * n);
    for j in 0..n {
        for i in 0..n {
            points.push((
                b.x + b.w * (i as f32 + 0.5) / n as f32,
                b.y + b.h * (j as f32 + 0.5) / n as f32,
            ));
        }
    }
    let Some(samples) = r
        .sample_behind(snap, layer, &points)
        .filter(|s| !s.is_empty())
    else {
        return BgSample {
            color: snap.page.background,
            spread: f32::INFINITY,
            confidence: 0.3,
        };
    };
    let labs: Vec<Oklab> = samples.iter().map(|c| to_oklab(*c)).collect();
    let med = Oklab {
        l: median(&mut labs.iter().map(|x| x.l).collect::<Vec<_>>()),
        a: median(&mut labs.iter().map(|x| x.a).collect::<Vec<_>>()),
        b: median(&mut labs.iter().map(|x| x.b).collect::<Vec<_>>()),
    };
    let mut d: Vec<f32> = labs.iter().map(|x| delta_ok(*x, med)).collect();
    d.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let spread = d[((d.len() - 1) as f32 * 0.9).round() as usize];
    // Flat: full confidence. Gradient-like: usable. Busy or photographic: the teacher is unsure.
    let confidence = if spread < cfg.low_spread {
        1.0
    } else if spread < cfg.high_spread {
        0.7
    } else {
        0.4
    };
    BgSample {
        color: oklab_to_color(med),
        spread,
        confidence,
    }
}

#[derive(Default)]
pub struct BgCache {
    pub map: HashMap<LayerId, (u64, BgSample)>,
}

fn mix(h: &mut u64, v: u64) {
    *h ^= v;
    *h = h.wrapping_mul(0x0000_0100_0000_01b3);
}

/// What the background depends on: the layer itself, the page, and every visible layer below that touches it.
pub fn stamp(snap: &Snapshot, layer: &Layer) -> u64 {
    let mut h = 0xcbf2_9ce4_8422_2325u64;
    let bg = snap.page.background;
    for v in [bg.r, bg.g, bg.b] {
        mix(&mut h, v.to_bits() as u64);
    }
    mix(&mut h, layer.version);
    for v in [
        layer.bounds.x,
        layer.bounds.y,
        layer.bounds.w,
        layer.bounds.h,
    ] {
        mix(&mut h, v.to_bits() as u64);
    }
    if let Some(idx) = snap.index_of(layer.id) {
        for l in &snap.layers[..idx] {
            if l.visible && l.bounds.intersection_area(&layer.bounds) > 0.0 {
                mix(&mut h, l.id as u64);
                mix(&mut h, l.version);
            }
        }
    }
    h
}
