//! Measurements: the registry of things a style can score, and the environment rules run in.
use crate::background::*;
use crate::color::*;
use crate::config::Config;
use crate::finding::{Extra, Unit};
use crate::model::*;
use std::cell::RefCell;

/// Everything a rule may read. Rules never touch the live editor.
pub struct Env<'a> {
    pub snap: &'a Snapshot,
    pub cfg: &'a Config,
    pub renderer: &'a dyn Renderer,
    pub bg: &'a RefCell<BgCache>,
    pub objects: Vec<&'a Layer>,
}

impl<'a> Env<'a> {
    pub fn new(
        snap: &'a Snapshot,
        cfg: &'a Config,
        renderer: &'a dyn Renderer,
        bg: &'a RefCell<BgCache>,
    ) -> Self {
        Env {
            snap,
            cfg,
            renderer,
            bg,
            objects: snap.objects(),
        }
    }
    pub fn text_layers(&self) -> Vec<&'a Layer> {
        self.objects
            .iter()
            .copied()
            .filter(|l| {
                l.kind == LayerKind::Text
                    && l.text
                        .as_ref()
                        .is_some_and(|t| !t.content.trim().is_empty())
            })
            .collect()
    }
    /// Objects that count as design elements: everything visible except page-sized backgrounds.
    pub fn layout_objects(&self) -> Vec<&'a Layer> {
        self.objects
            .iter()
            .copied()
            .filter(|l| !self.snap.is_background(l))
            .collect()
    }
    pub fn background(&self, l: &Layer) -> BgSample {
        let stamp = stamp(self.snap, l);
        if let Some((s, b)) = self.bg.borrow().map.get(&l.id) {
            if *s == stamp {
                return *b;
            }
        }
        let b = sample_background(self.snap, l, self.renderer, &self.cfg.background);
        self.bg.borrow_mut().map.insert(l.id, (stamp, b));
        b
    }
}

pub struct Measurement {
    pub value: f64,
    pub confidence: f32,
    pub unit: Unit,
    pub extra: Option<Extra>,
}

/// Every measurement a style profile may refer to.
pub const REGISTRY: &[(&str, Unit)] = &[
    ("colour.families", Unit::Count),
    ("colour.dominant_share", Unit::Share),
    ("colour.neutral_share", Unit::Share),
    ("colour.accent_share", Unit::Share),
    ("shape.geometric_share", Unit::Share),
    ("grid.edge_share", Unit::Share),
    ("balance.asymmetry", Unit::Share),
    ("hierarchy.ratio", Unit::Ratio),
    ("text.count_sizes", Unit::Count),
];

pub fn is_registered(id: &str) -> bool {
    REGISTRY.iter().any(|(i, _)| *i == id)
}

pub fn measure(id: &str, env: &Env) -> Option<Measurement> {
    let unit = REGISTRY.iter().find(|(i, _)| *i == id)?.1;
    let m = |value: f64, confidence: f32| {
        Some(Measurement {
            value,
            confidence,
            unit,
            extra: None,
        })
    };
    match id {
        "colour.families" => colour_stats(env).and_then(|s| m(s.families as f64, 1.0)),
        "colour.dominant_share" => colour_stats(env).and_then(|s| m(s.dominant, 1.0)),
        "colour.neutral_share" => colour_stats(env).and_then(|s| m(s.neutral, 1.0)),
        "colour.accent_share" => colour_stats(env).and_then(|s| m(s.accent, 1.0)),
        "shape.geometric_share" => geometric_share(env).and_then(|v| m(v, 1.0)),
        "grid.edge_share" => grid_edge_share(env).and_then(|v| m(v, 1.0)),
        "balance.asymmetry" => balance(env),
        "hierarchy.ratio" => hierarchy(env).and_then(|(r, _)| m(r, 1.0)),
        "text.count_sizes" => hierarchy(env).and_then(|(_, n)| m(n as f64, 1.0)),
        _ => None,
    }
}

pub struct ColourStats {
    pub families: u32,
    pub dominant: f64,
    pub neutral: f64,
    pub accent: f64,
}

/// Colour shares from a coarse raster of the page: background, then shape fills in stacking order.
/// Photos are excluded because their pixels are not known here, and shares are taken over the rest.
/// Text is left out; it is thin and would skew the shares.
pub fn colour_stats(env: &Env) -> Option<ColourStats> {
    const N: usize = 64;
    let (pw, ph) = (env.snap.page.width_px, env.snap.page.height_px);
    if pw <= 0.0 || ph <= 0.0 {
        return None;
    }
    let mut cells: Vec<Option<Color>> = vec![Some(env.snap.page.background.with_alpha(1.0)); N * N];
    for l in &env.objects {
        let paint = match (l.kind, l.fill) {
            (LayerKind::Shape, Some(f)) => Some(f.with_alpha(f.a * l.opacity)),
            (LayerKind::Image, _) => None,
            _ => continue,
        };
        let gx0 = ((l.bounds.x / pw) * N as f32).floor().max(0.0) as usize;
        let gx1 = (((l.bounds.right() / pw) * N as f32).ceil().max(0.0) as usize).min(N);
        let gy0 = ((l.bounds.y / ph) * N as f32).floor().max(0.0) as usize;
        let gy1 = (((l.bounds.bottom() / ph) * N as f32).ceil().max(0.0) as usize).min(N);
        for gy in gy0..gy1 {
            for gx in gx0..gx1 {
                let (cx, cy) = (
                    (gx as f32 + 0.5) * pw / N as f32,
                    (gy as f32 + 0.5) * ph / N as f32,
                );
                let hit = if l.kind == LayerKind::Image {
                    l.bounds.contains_point(cx, cy)
                } else {
                    shape_contains(l, cx, cy)
                };
                if !hit {
                    continue;
                }
                let i = gy * N + gx;
                cells[i] = match (paint, cells[i]) {
                    (Some(p), Some(under)) => Some(composite(p, under)),
                    (Some(_), None) => cells[i],
                    (None, _) => None,
                };
            }
        }
    }
    let lch: Vec<Option<Oklch>> = cells.iter().map(|c| c.map(to_oklch)).collect();
    let total = lch.iter().flatten().count() as f64;
    if total == 0.0 {
        return None;
    }
    let cc = &env.cfg.colour;
    let neutral = lch
        .iter()
        .flatten()
        .filter(|c| c.c < cc.chroma_neutral)
        .count() as f64;
    // Cluster chromatic cells by hue: sort, split where the gap exceeds the merge angle, join across 0/360.
    let mut idx: Vec<usize> = (0..lch.len())
        .filter(|&i| lch[i].is_some_and(|c| c.c >= cc.chroma_neutral))
        .collect();
    idx.sort_by(|&a, &b| lch[a].unwrap().h.partial_cmp(&lch[b].unwrap().h).unwrap());
    let mut cluster_of = vec![usize::MAX; lch.len()];
    let mut n_clusters = 0usize;
    for (k, &i) in idx.iter().enumerate() {
        if k > 0 && lch[i].unwrap().h - lch[idx[k - 1]].unwrap().h > cc.hue_merge_deg {
            n_clusters += 1;
        }
        cluster_of[i] = n_clusters;
    }
    if !idx.is_empty() {
        n_clusters += 1;
        let (first, last) = (lch[idx[0]].unwrap().h, lch[*idx.last().unwrap()].unwrap().h);
        if n_clusters > 1 && (first + 360.0 - last) <= cc.hue_merge_deg {
            let last_id = n_clusters - 1;
            for c in cluster_of.iter_mut() {
                if *c == last_id {
                    *c = 0;
                }
            }
            n_clusters -= 1;
        }
    }
    let mut share = vec![0.0f64; n_clusters];
    for &i in &idx {
        share[cluster_of[i]] += 1.0;
    }
    let families = share
        .iter()
        .filter(|s| **s / total >= cc.min_family_share as f64)
        .count() as u32;
    let (best_cluster, best_share) = share.iter().enumerate().fold(
        (usize::MAX, 0.0f64),
        |a, (i, s)| if *s > a.1 { (i, *s) } else { a },
    );
    let dominant_is_neutral = neutral >= best_share;
    let dominant = neutral.max(best_share) / total;
    let accent = idx
        .iter()
        .filter(|&&i| {
            lch[i].unwrap().c >= cc.chroma_accent
                && (dominant_is_neutral || cluster_of[i] != best_cluster)
        })
        .count() as f64
        / total;
    Some(ColourStats {
        families,
        dominant,
        neutral: neutral / total,
        accent,
    })
}

fn geometric_share(env: &Env) -> Option<f64> {
    let shapes: Vec<&Layer> = env
        .objects
        .iter()
        .copied()
        .filter(|l| l.kind == LayerKind::Shape)
        .collect();
    let total: f32 = shapes.iter().map(|l| l.bounds.area()).sum();
    if total <= 0.0 {
        return None;
    }
    let geo: f32 = shapes
        .iter()
        .filter(|l| l.shape.is_none_or(|s| s.is_geometric()))
        .map(|l| l.bounds.area())
        .sum();
    Some((geo / total) as f64)
}

/// Share of object edges that sit on a line another object also uses.
fn grid_edge_share(env: &Env) -> Option<f64> {
    let objs = env.layout_objects();
    if objs.len() < 2 {
        return None;
    }
    let tol = 0.005 * env.snap.page.short_side();
    let (mut shared, mut total) = (0u32, 0u32);
    for (i, a) in objs.iter().enumerate() {
        let xs = |l: &Layer| [l.bounds.x, l.bounds.right()];
        let ys = |l: &Layer| [l.bounds.y, l.bounds.bottom()];
        for (edges, other) in [
            (xs(a), xs as fn(&Layer) -> [f32; 2]),
            (ys(a), ys as fn(&Layer) -> [f32; 2]),
        ] {
            for e in edges {
                total += 1;
                if objs
                    .iter()
                    .enumerate()
                    .any(|(j, b)| j != i && other(b).iter().any(|o| (o - e).abs() <= tol))
                {
                    shared += 1;
                }
            }
        }
    }
    Some(shared as f64 / total as f64)
}

/// Visual-weight centroid and its distance from the page centre, scaled so a corner is 1.
fn balance(env: &Env) -> Option<Measurement> {
    let objs = env.layout_objects();
    if objs.is_empty() {
        return None;
    }
    let bg_l = to_oklab(env.snap.page.background).l;
    let (mut sw, mut sx, mut sy) = (0.0f32, 0.0f32, 0.0f32);
    for l in &objs {
        let (lightness, presence) = match l.kind {
            LayerKind::Text => (
                l.text.as_ref().map(|t| to_oklab(t.color).l).unwrap_or(0.0),
                0.4,
            ),
            LayerKind::Image => (bg_l - 0.5, 0.6),
            _ => (l.fill.map(|f| to_oklab(f).l).unwrap_or(bg_l), 1.0),
        };
        let w = l.bounds.area() * presence * (0.15 + (lightness - bg_l).abs());
        sw += w;
        sx += w * l.bounds.cx();
        sy += w * l.bounds.cy();
    }
    if sw <= 0.0 {
        return None;
    }
    let (nx, ny) = (
        sx / sw / env.snap.page.width_px,
        sy / sw / env.snap.page.height_px,
    );
    let asym = (nx - 0.5).hypot(ny - 0.5) / 0.5f32.hypot(0.5);
    Some(Measurement {
        value: asym as f64,
        confidence: if objs.len() >= 2 { 1.0 } else { 0.5 },
        unit: Unit::Share,
        extra: Some(Extra {
            centroid: Some((nx, ny)),
        }),
    })
}

/// (largest ÷ second largest distinct font size, number of distinct sizes).
fn hierarchy(env: &Env) -> Option<(f64, usize)> {
    let texts = env.text_layers();
    if texts.is_empty() {
        return None;
    }
    let mut sizes: Vec<f32> = texts
        .iter()
        .map(|l| (l.text.as_ref().unwrap().size_px * 2.0).round() / 2.0)
        .collect();
    sizes.sort_by(|a, b| b.partial_cmp(a).unwrap());
    sizes.dedup();
    let ratio = if sizes.len() >= 2 {
        (sizes[0] / sizes[1]) as f64
    } else {
        1.0
    };
    Some((ratio, sizes.len()))
}
