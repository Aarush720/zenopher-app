//! Colour maths: sRGB, OKLab/OKLCH, WCAG contrast, and the contrast fixer.
use serde::{Deserialize, Serialize};

fn one() -> f32 {
    1.0
}

/// sRGB, channels 0..1.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Color {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    #[serde(default = "one")]
    pub a: f32,
}

impl Color {
    pub const fn rgb(r: f32, g: f32, b: f32) -> Self {
        Color { r, g, b, a: 1.0 }
    }
    pub fn with_alpha(self, a: f32) -> Self {
        Color { a, ..self }
    }
    pub fn from_hex(s: &str) -> Option<Self> {
        let s = s.trim_start_matches('#');
        if s.len() != 6 {
            return None;
        }
        let v = u32::from_str_radix(s, 16).ok()?;
        Some(Color::rgb(
            ((v >> 16) & 255) as f32 / 255.0,
            ((v >> 8) & 255) as f32 / 255.0,
            (v & 255) as f32 / 255.0,
        ))
    }
    pub fn to_hex(&self) -> String {
        let q = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
        format!("#{:02x}{:02x}{:02x}", q(self.r), q(self.g), q(self.b))
    }
}

pub fn to_linear(c: f32) -> f32 {
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}
pub fn from_linear(c: f32) -> f32 {
    if c <= 0.003_130_8 {
        c * 12.92
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Oklab {
    pub l: f32,
    pub a: f32,
    pub b: f32,
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Oklch {
    pub l: f32,
    pub c: f32,
    pub h: f32,
}

#[allow(clippy::excessive_precision)]
pub fn to_oklab(c: Color) -> Oklab {
    let (r, g, b) = (to_linear(c.r), to_linear(c.g), to_linear(c.b));
    let l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b).cbrt();
    let m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b).cbrt();
    let s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b).cbrt();
    Oklab {
        l: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    }
}

#[allow(clippy::excessive_precision)]
fn oklab_to_linear(lab: Oklab) -> (f32, f32, f32) {
    let l_ = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
    let m_ = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
    let s_ = lab.l - 0.0894841775 * lab.a - 1.2914855480 * lab.b;
    let (l, m, s) = (l_ * l_ * l_, m_ * m_ * m_, s_ * s_ * s_);
    (
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    )
}

pub fn oklab_to_color(lab: Oklab) -> Color {
    let (r, g, b) = oklab_to_linear(lab);
    Color::rgb(
        from_linear(r.clamp(0.0, 1.0)),
        from_linear(g.clamp(0.0, 1.0)),
        from_linear(b.clamp(0.0, 1.0)),
    )
}

pub fn to_oklch(c: Color) -> Oklch {
    let lab = to_oklab(c);
    Oklch {
        l: lab.l,
        c: lab.a.hypot(lab.b),
        h: lab.b.atan2(lab.a).to_degrees().rem_euclid(360.0),
    }
}

fn lch_to_lab(l: f32, c: f32, h: f32) -> Oklab {
    let hr = h.to_radians();
    Oklab {
        l,
        a: c * hr.cos(),
        b: c * hr.sin(),
    }
}

fn in_gamut(lab: Oklab) -> bool {
    let (r, g, b) = oklab_to_linear(lab);
    let e = 1e-4;
    [r, g, b].iter().all(|v| *v >= -e && *v <= 1.0 + e)
}

/// Convert OKLCH to sRGB. Out-of-gamut colours keep L and h and lose chroma.
pub fn oklch_to_color(lch: Oklch) -> Color {
    let l = lch.l.clamp(0.0, 1.0);
    if in_gamut(lch_to_lab(l, lch.c, lch.h)) {
        return oklab_to_color(lch_to_lab(l, lch.c, lch.h));
    }
    let (mut lo, mut hi) = (0.0f32, lch.c);
    for _ in 0..14 {
        let mid = (lo + hi) / 2.0;
        if in_gamut(lch_to_lab(l, mid, lch.h)) {
            lo = mid
        } else {
            hi = mid
        }
    }
    oklab_to_color(lch_to_lab(l, lo, lch.h))
}

pub fn delta_ok(a: Oklab, b: Oklab) -> f32 {
    ((a.l - b.l).powi(2) + (a.a - b.a).powi(2) + (a.b - b.b).powi(2)).sqrt()
}

pub fn relative_luminance(c: Color) -> f32 {
    0.2126 * to_linear(c.r) + 0.7152 * to_linear(c.g) + 0.0722 * to_linear(c.b)
}

/// Source-over in sRGB space. The result is opaque.
pub fn composite(fg: Color, bg: Color) -> Color {
    let a = fg.a.clamp(0.0, 1.0);
    Color::rgb(
        fg.r * a + bg.r * (1.0 - a),
        fg.g * a + bg.g * (1.0 - a),
        fg.b * a + bg.b * (1.0 - a),
    )
}

/// WCAG contrast ratio between two opaque colours.
pub fn contrast_ratio(a: Color, b: Color) -> f32 {
    let (la, lb) = (relative_luminance(a), relative_luminance(b));
    let (hi, lo) = if la > lb { (la, lb) } else { (lb, la) };
    (hi + 0.05) / (lo + 0.05)
}

/// Contrast of text (colour, layer opacity) over a background.
pub fn effective_contrast(fg: Color, opacity: f32, bg: Color) -> f32 {
    contrast_ratio(composite(fg.with_alpha(fg.a * opacity), bg), bg)
}

/// Find the closest colour in OKLCH (same hue and chroma, gamut-limited) that reaches `target`.
/// Tries darker and lighter and returns the one with the smaller lightness change.
pub fn find_contrast_fix(fg: Color, opacity: f32, bg: Color, target: f32) -> Option<Color> {
    let lch = to_oklch(fg);
    let mut best: Option<(f32, Color)> = None;
    for dir in [-1.0f32, 1.0] {
        for i in 1..=200 {
            let l = (lch.l + dir * i as f32 * 0.005).clamp(0.0, 1.0);
            let c = oklch_to_color(Oklch { l, ..lch }).with_alpha(fg.a);
            if effective_contrast(c, opacity, bg) >= target {
                let delta = (l - lch.l).abs();
                if best.is_none_or(|(d, _)| delta < d) {
                    best = Some((delta, c));
                }
                break;
            }
            if l <= 0.0 || l >= 1.0 {
                break;
            }
        }
    }
    best.map(|(_, c)| c)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wcag_reference_values() {
        let black = Color::rgb(0.0, 0.0, 0.0);
        let white = Color::rgb(1.0, 1.0, 1.0);
        assert!((contrast_ratio(black, white) - 21.0).abs() < 0.01);
        // #767676 on white is the classic 4.54:1 boundary for AA.
        let grey = Color::from_hex("#767676").unwrap();
        let r = contrast_ratio(grey, white);
        assert!(r > 4.5 && r < 4.6, "{r}");
    }
    #[test]
    fn oklab_roundtrip() {
        let c = Color::from_hex("#3b6fd1").unwrap();
        let back = oklch_to_color(to_oklch(c));
        assert!(
            (c.r - back.r).abs() < 0.01
                && (c.g - back.g).abs() < 0.01
                && (c.b - back.b).abs() < 0.01
        );
    }
    #[test]
    fn fix_reaches_target_and_keeps_hue() {
        let bg = Color::from_hex("#ffffff").unwrap();
        let fg = Color::from_hex("#9fb4e0").unwrap();
        let fixed = find_contrast_fix(fg, 1.0, bg, 4.52).unwrap();
        assert!(effective_contrast(fixed, 1.0, bg) >= 4.52);
        assert!((to_oklch(fixed).h - to_oklch(fg).h).abs() < 6.0);
    }
}
