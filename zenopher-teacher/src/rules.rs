//! The rules. Each reads the snapshot through `Env` and returns raw findings; `runner` classifies them.
use crate::color::find_contrast_fix;
use crate::finding::*;
use crate::measure::{measure, Env};
use crate::model::*;
use crate::style::{pattern_score, CompiledPattern};
use std::collections::BTreeMap;

#[derive(Debug)]
pub struct RuleError(pub String);
pub type RuleResult = Result<Vec<Raw>, RuleError>;

/// A finding before classification.
pub struct Raw {
    pub rule: String,
    pub layers: Vec<LayerId>,
    pub measured: Measured,
    pub expected: Expected,
    pub confidence: f32,
    /// What the check wants to be. Classification may lower it, never raise it.
    pub default: Severity,
    pub fix: Option<Fix>,
    pub score: Option<f32>,
    pub extra: Option<Extra>,
    pub args: BTreeMap<String, String>,
}

impl Raw {
    fn new(rule: &str, layers: Vec<LayerId>, measured: Measured, expected: Expected) -> Self {
        Raw {
            rule: rule.into(),
            layers,
            measured,
            expected,
            confidence: 1.0,
            default: Severity::Must,
            fix: None,
            score: None,
            extra: None,
            args: BTreeMap::new(),
        }
    }
    fn fix(mut self, f: Option<Fix>) -> Self {
        self.fix = f;
        self
    }
    fn conf(mut self, c: f32) -> Self {
        self.confidence = c;
        self
    }
    fn sev(mut self, s: Severity) -> Self {
        self.default = s;
        self
    }
    fn arg(mut self, k: &str, v: String) -> Self {
        self.args.insert(k.into(), v);
        self
    }
}

pub struct RuleDef {
    pub id: &'static str,
    pub class: Class,
    pub run: fn(&Env) -> RuleResult,
}

pub static RULES: &[RuleDef] = &[
    RuleDef {
        id: "contrast",
        class: Class::Base,
        run: contrast,
    },
    RuleDef {
        id: "text_size",
        class: Class::Base,
        run: text_size,
    },
    RuleDef {
        id: "text.cropped",
        class: Class::Base,
        run: text_cropped,
    },
    RuleDef {
        id: "leading",
        class: Class::Base,
        run: leading,
    },
    RuleDef {
        id: "alignment",
        class: Class::Base,
        run: alignment,
    },
    RuleDef {
        id: "spacing",
        class: Class::Base,
        run: spacing,
    },
    RuleDef {
        id: "overlap",
        class: Class::Base,
        run: overlap,
    },
    RuleDef {
        id: "distortion",
        class: Class::Base,
        run: distortion,
    },
    RuleDef {
        id: "print",
        class: Class::Base,
        run: print,
    },
    RuleDef {
        id: "tangency",
        class: Class::Professional,
        run: tangency,
    },
];

fn measured(value: f64, unit: Unit) -> Measured {
    Measured { value, unit }
}
fn safe(commands: Vec<Command>, conflict_key: String) -> Option<Fix> {
    Some(Fix {
        safety: FixSafety::Safe,
        commands,
        conflict_key,
    })
}

// --- Contrast -----------------------------------------------------------------------------------

fn contrast(env: &Env) -> RuleResult {
    let c = &env.cfg.contrast;
    let mut out = vec![];
    for l in env.text_layers() {
        let t = l.text.as_ref().unwrap();
        let bg = env.background(l);
        let ratio = crate::color::effective_contrast(t.color, l.opacity, bg.color);
        let large = t.size_px >= c.large_text_px || (t.bold && t.size_px >= c.large_bold_px);
        let need = if large {
            c.required_large
        } else {
            c.required_normal
        };
        if ratio + 1e-4 >= need {
            continue;
        }
        let fix =
            find_contrast_fix(t.color, l.opacity, bg.color, need + c.fix_margin).and_then(|col| {
                safe(
                    vec![Command::SetTextColor {
                        layer: l.id,
                        color: col,
                    }],
                    format!("text:{}:colour", l.id),
                )
            });
        out.push(
            Raw::new(
                "contrast",
                vec![l.id],
                measured(ratio as f64, Unit::Ratio),
                Expected::AtLeast { value: need as f64 },
            )
            .conf(bg.confidence)
            .fix(fix),
        );
    }
    Ok(out)
}

// --- Text ---------------------------------------------------------------------------------------

fn text_size(env: &Env) -> RuleResult {
    let min = env.cfg.text_size.min_ratio_of_short_side * env.snap.page.short_side();
    let mut out = vec![];
    for l in env.text_layers() {
        let t = l.text.as_ref().unwrap();
        if t.size_px + 1e-4 >= min {
            continue;
        }
        let fix = safe(
            vec![Command::SetFontSize {
                layer: l.id,
                size_px: min.ceil(),
            }],
            format!("text:{}:size", l.id),
        );
        out.push(
            Raw::new(
                "text_size",
                vec![l.id],
                measured(t.size_px as f64, Unit::Px),
                Expected::AtLeast { value: min as f64 },
            )
            .fix(fix),
        );
    }
    Ok(out)
}

fn text_cropped(env: &Env) -> RuleResult {
    let page = env.snap.page.rect();
    let mut out = vec![];
    for l in env.text_layers() {
        let area = l.bounds.area();
        if area <= 0.0 {
            continue;
        }
        let inside = l.bounds.intersection_area(&page);
        // Entirely off the page is treated as parked, not cropped.
        if inside <= 0.0 {
            continue;
        }
        let outside = 1.0 - inside / area;
        let overhang = (-l.bounds.x)
            .max(-l.bounds.y)
            .max(l.bounds.right() - page.w)
            .max(l.bounds.bottom() - page.h);
        if overhang > 1.0 {
            out.push(Raw::new(
                "text.cropped",
                vec![l.id],
                measured(outside as f64, Unit::Fraction),
                Expected::AtMost { value: 0.0 },
            ));
        }
    }
    Ok(out)
}

fn leading(env: &Env) -> RuleResult {
    let c = &env.cfg.leading;
    let mut out = vec![];
    for l in env.text_layers() {
        let t = l.text.as_ref().unwrap();
        if t.lines <= 1 || (t.leading >= c.min && t.leading <= c.max) {
            continue;
        }
        let sev = if t.leading < c.min {
            Severity::Must
        } else {
            Severity::Optional
        };
        let fix = safe(
            vec![Command::SetLeading {
                layer: l.id,
                leading: c.fix_to,
            }],
            format!("text:{}:leading", l.id),
        );
        out.push(
            Raw::new(
                "leading",
                vec![l.id],
                measured(t.leading as f64, Unit::Ratio),
                Expected::Range {
                    lo: c.min as f64,
                    hi: c.max as f64,
                },
            )
            .sev(sev)
            .fix(fix),
        );
    }
    Ok(out)
}

// --- Pair rules ---------------------------------------------------------------------------------

/// Cap on pair rules, which are O(n²). Above it the rule reports itself unavailable instead of stalling the editor.
const MAX_PAIR_OBJECTS: usize = 400;

fn guard(objs: &[&Layer]) -> Result<(), RuleError> {
    if objs.len() > MAX_PAIR_OBJECTS {
        Err(RuleError(format!(
            "{} objects is above the pair-rule limit",
            objs.len()
        )))
    } else {
        Ok(())
    }
}

/// Offset that moves `a`'s edge onto `b`'s, if the closest differing edge pair is a near miss.
/// Returns None when any edge pair already lines up, or when no pair is close enough to be a near miss.
fn near_miss(a: [f32; 3], b: [f32; 3], eps: f32, tol: f32) -> Option<f32> {
    let mut best: Option<f32> = None;
    for k in 0..3 {
        let d = b[k] - a[k];
        if d.abs() <= eps {
            return None;
        }
        if d.abs() <= tol && best.is_none_or(|x| d.abs() < x.abs()) {
            best = Some(d);
        }
    }
    best
}
fn xs(l: &Layer) -> [f32; 3] {
    [l.bounds.x, l.bounds.cx(), l.bounds.right()]
}
fn ys(l: &Layer) -> [f32; 3] {
    [l.bounds.y, l.bounds.cy(), l.bounds.bottom()]
}

fn anchored(env: &Env, l: &Layer) -> bool {
    let p = env.snap.page.rect();
    let e = 0.5;
    l.bounds.x.abs() <= e
        || l.bounds.y.abs() <= e
        || (l.bounds.right() - p.w).abs() <= e
        || (l.bounds.bottom() - p.h).abs() <= e
        || (l.bounds.cx() - p.cx()).abs() <= e
        || (l.bounds.cy() - p.cy()).abs() <= e
}

fn alignment(env: &Env) -> RuleResult {
    let objs = env.layout_objects();
    guard(&objs)?;
    let c = &env.cfg.alignment;
    let short = env.snap.page.short_side();
    let (tol, nb) = (c.tolerance_ratio * short, c.neighbourhood_ratio * short);
    let mut out = vec![];
    for i in 0..objs.len() {
        for j in (i + 1)..objs.len() {
            let (a, b) = (objs[i], objs[j]);
            if a.bounds.gap(&b.bounds) > nb {
                continue;
            }
            let (dx, dy) = (
                near_miss(xs(a), xs(b), c.epsilon_px, tol),
                near_miss(ys(a), ys(b), c.epsilon_px, tol),
            );
            if dx.is_none() && dy.is_none() {
                continue;
            }
            // Move the object the page does not anchor; otherwise the smaller one; otherwise the later one.
            let move_b = match (anchored(env, a), anchored(env, b)) {
                (true, false) => true,
                (false, true) => false,
                _ => b.bounds.area() <= a.bounds.area(),
            };
            let sign = if move_b { -1.0 } else { 1.0 };
            let mover = if move_b { b } else { a };
            let (mx, my) = (dx.unwrap_or(0.0) * sign, dy.unwrap_or(0.0) * sign);
            let off = dx.unwrap_or(0.0).abs().max(dy.unwrap_or(0.0).abs());
            let fix = safe(
                vec![Command::MoveBy {
                    layer: mover.id,
                    dx: mx,
                    dy: my,
                }],
                format!("layer:{}:geometry", mover.id),
            );
            out.push(
                Raw::new(
                    "alignment",
                    vec![a.id, b.id],
                    measured(off as f64, Unit::Px),
                    Expected::Exactly { value: 0.0 },
                )
                .fix(fix),
            );
        }
    }
    Ok(out)
}

fn tangency(env: &Env) -> RuleResult {
    let objs = env.layout_objects();
    guard(&objs)?;
    let c = &env.cfg.tangency;
    let eps = env.cfg.alignment.epsilon_px;
    let mut out = vec![];
    for i in 0..objs.len() {
        for j in (i + 1)..objs.len() {
            let (a, b) = (objs[i], objs[j]);
            let gap = a.bounds.gap(&b.bounds);
            if !(gap > 0.0 && gap <= c.max_gap_px) {
                continue;
            }
            let aligned = xs(a)
                .iter()
                .any(|p| xs(b).iter().any(|q| (p - q).abs() <= eps))
                || ys(a)
                    .iter()
                    .any(|p| ys(b).iter().any(|q| (p - q).abs() <= eps));
            if aligned {
                continue;
            }
            out.push(
                Raw::new(
                    "tangency",
                    vec![a.id, b.id],
                    measured(gap as f64, Unit::Px),
                    Expected::AtLeast {
                        value: c.suggest_gap_px as f64,
                    },
                )
                .sev(Severity::Optional)
                .arg("suggest", format!("{:.0}", c.suggest_gap_px)),
            );
        }
    }
    Ok(out)
}

fn overlap(env: &Env) -> RuleResult {
    let objs = env.layout_objects();
    guard(&objs)?;
    let c = &env.cfg.overlap;
    let mut out = vec![];
    for i in 0..objs.len() {
        for j in (i + 1)..objs.len() {
            let (a, b) = (objs[i], objs[j]);
            let inter = a.bounds.intersection_area(&b.bounds);
            let smaller = a.bounds.area().min(b.bounds.area());
            if inter <= 0.0 || smaller <= 0.0 {
                continue;
            }
            let ratio = inter / smaller;
            let layers = vec![a.id, b.id];
            match (a.kind, b.kind) {
                (LayerKind::Text, LayerKind::Text) if ratio > c.text_text_ratio => {
                    out.push(Raw::new(
                        "overlap",
                        layers,
                        measured(ratio as f64, Unit::Fraction),
                        Expected::AtMost {
                            value: c.text_text_ratio as f64,
                        },
                    ));
                }
                // One shape sitting fully inside another is layering, not a collision.
                (LayerKind::Shape, LayerKind::Shape)
                    if ratio > c.shape_shape_ratio && ratio < 0.98 =>
                {
                    out.push(
                        Raw::new(
                            "overlap",
                            layers,
                            measured(ratio as f64, Unit::Fraction),
                            Expected::AtMost {
                                value: c.shape_shape_ratio as f64,
                            },
                        )
                        .sev(Severity::Optional),
                    );
                }
                _ => {}
            }
        }
    }
    Ok(out)
}

/// Repeated, similar-sized objects in a row or column whose gaps are uneven.
fn spacing(env: &Env) -> RuleResult {
    let objs = env.layout_objects();
    guard(&objs)?;
    let c = &env.cfg.spacing;
    let mut out = vec![];
    for horizontal in [true, false] {
        let mut used = vec![false; objs.len()];
        for s in 0..objs.len() {
            if used[s] {
                continue;
            }
            let seed = objs[s];
            let along = |l: &Layer| {
                if horizontal {
                    (l.bounds.w, l.bounds.h)
                } else {
                    (l.bounds.h, l.bounds.w)
                }
            };
            let centre = |l: &Layer| {
                if horizontal {
                    l.bounds.cy()
                } else {
                    l.bounds.cx()
                }
            };
            let (sa, sp) = along(seed);
            let mut group: Vec<usize> = (0..objs.len())
                .filter(|&k| {
                    let (a, p) = along(objs[k]);
                    !used[k]
                        && (a - sa).abs() <= 0.1 * sa
                        && (p - sp).abs() <= 0.1 * sp
                        && (centre(objs[k]) - centre(seed)).abs() <= 0.25 * sp
                })
                .collect();
            if group.len() < 3 {
                continue;
            }
            let start = |l: &Layer| if horizontal { l.bounds.x } else { l.bounds.y };
            let size = |l: &Layer| along(l).0;
            group.sort_by(|&a, &b| start(objs[a]).partial_cmp(&start(objs[b])).unwrap());
            let gaps: Vec<f32> = group
                .windows(2)
                .map(|w| start(objs[w[1]]) - (start(objs[w[0]]) + size(objs[w[0]])))
                .collect();
            if gaps.iter().any(|g| *g < 0.0) {
                continue;
            }
            let mean = gaps.iter().sum::<f32>() / gaps.len() as f32;
            if mean <= 0.0 {
                continue;
            }
            let cv = (gaps.iter().map(|g| (g - mean).powi(2)).sum::<f32>() / gaps.len() as f32)
                .sqrt()
                / mean;
            for &k in &group {
                used[k] = true;
            }
            if cv <= c.cv_threshold {
                continue;
            }
            // Keep the first object where it is and the last where it is; spread the ones between evenly.
            let mut cmds = vec![];
            let mut pos = start(objs[group[0]]);
            for &k in &group {
                let delta = pos - start(objs[k]);
                if delta.abs() > 0.01 {
                    cmds.push(if horizontal {
                        Command::MoveBy {
                            layer: objs[k].id,
                            dx: delta,
                            dy: 0.0,
                        }
                    } else {
                        Command::MoveBy {
                            layer: objs[k].id,
                            dx: 0.0,
                            dy: delta,
                        }
                    });
                }
                pos += size(objs[k]) + mean;
            }
            let ids: Vec<LayerId> = group.iter().map(|&k| objs[k].id).collect();
            let conf = if group.len() >= c.must_min_objects {
                1.0
            } else {
                0.5
            };
            let key = format!("group:{}:spacing", ids.iter().min().unwrap());
            out.push(
                Raw::new(
                    "spacing",
                    ids,
                    measured(cv as f64, Unit::Fraction),
                    Expected::AtMost {
                        value: c.cv_threshold as f64,
                    },
                )
                .conf(conf)
                .fix(safe(cmds, key)),
            );
        }
    }
    Ok(out)
}

fn distortion(env: &Env) -> RuleResult {
    let mut out = vec![];
    for l in env.objects.iter().filter(|l| l.kind == LayerKind::Image) {
        let Some(img) = &l.image else { continue };
        if img.source_w == 0
            || img.source_h == 0
            || img.displayed_w <= 0.0
            || img.displayed_h <= 0.0
        {
            continue;
        }
        let src = img.source_w as f32 / img.source_h as f32;
        let shown = img.displayed_w / img.displayed_h;
        let dev = (shown - src).abs() / src;
        if dev <= env.cfg.distortion.max_deviation {
            continue;
        }
        // Restore the source aspect by changing the height, keeping the vertical centre.
        let new_h = l.bounds.w / src;
        let rect = Rect::new(l.bounds.x, l.bounds.cy() - new_h / 2.0, l.bounds.w, new_h);
        out.push(
            Raw::new(
                "distortion",
                vec![l.id],
                measured(dev as f64, Unit::Fraction),
                Expected::AtMost {
                    value: env.cfg.distortion.max_deviation as f64,
                },
            )
            .fix(safe(
                vec![Command::SetBounds { layer: l.id, rect }],
                format!("layer:{}:geometry", l.id),
            )),
        );
    }
    Ok(out)
}

// --- Print --------------------------------------------------------------------------------------

fn print(env: &Env) -> RuleResult {
    if env.snap.intent != Intent::Print {
        return Ok(vec![]);
    }
    let (p, page) = (&env.cfg.print, &env.snap.page);
    let mut out = vec![];
    if let Some(ppi) = page.ppi.filter(|p| *p > 0.0) {
        for l in env.objects.iter().filter(|l| l.kind == LayerKind::Image) {
            let Some(img) = &l.image else { continue };
            if img.source_w == 0 || img.displayed_w <= 0.0 {
                continue;
            }
            let dpi = img.source_w as f32 / (img.displayed_w / ppi);
            if dpi >= p.dpi_optional {
                continue;
            }
            let (sev, need) = if dpi < p.dpi_must {
                (Severity::Must, p.dpi_must)
            } else {
                (Severity::Optional, p.dpi_optional)
            };
            out.push(
                Raw::new(
                    "print.dpi",
                    vec![l.id],
                    measured(dpi as f64, Unit::Dpi),
                    Expected::AtLeast { value: need as f64 },
                )
                .sev(sev),
            );
        }
    }
    let bleed = page.bleed_mm.unwrap_or(0.0);
    if bleed < p.min_bleed_mm {
        out.push(Raw::new(
            "print.bleed",
            vec![],
            measured(bleed as f64, Unit::Mm),
            Expected::AtLeast {
                value: p.min_bleed_mm as f64,
            },
        ));
    }
    if page.color_mode == ColorMode::Rgb {
        out.push(
            Raw::new(
                "print.colour_mode",
                vec![],
                measured(0.0, Unit::Count),
                Expected::Exactly { value: 1.0 },
            )
            .sev(Severity::Optional),
        );
    }
    Ok(out)
}

// --- Pattern and professional checks -----------------------------------------------------------

/// One pattern from the style profile. Findings carry a score and never a pass/fail verdict.
pub fn pattern(env: &Env, p: &CompiledPattern) -> RuleResult {
    let Some(m) = measure(&p.id, env) else {
        return Ok(vec![]);
    };
    let score = pattern_score(m.value, p.lo, p.hi, p.tolerance);
    if score >= 1.0 - 1e-9 {
        return Ok(vec![]);
    }
    let mut raw = Raw::new(
        &p.id,
        vec![],
        Measured {
            value: m.value,
            unit: m.unit,
        },
        Expected::Range { lo: p.lo, hi: p.hi },
    )
    .conf(m.confidence)
    .sev(Severity::Optional);
    raw.score = Some(score as f32);
    raw.extra = m.extra;
    Ok(vec![raw])
}
