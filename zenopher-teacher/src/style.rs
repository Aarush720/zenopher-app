//! Style profiles: validate, compile, cache. A profile that fails any check is not used.
use crate::config::override_range;
use crate::finding::Class;
use crate::sha256::sha256_hex;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PatternSpec {
    pub target: [f64; 2],
    pub tolerance: f64,
    pub weight: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StyleExample {
    pub image: String,
    pub source_url: String,
    pub license: String,
    pub attribution: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StyleProfile {
    pub id: String,
    pub version: u32,
    pub name: String,
    pub summary: String,
    pub families: Vec<String>,
    pub uses: Vec<String>,
    pub principles: Vec<String>,
    pub examples: Vec<StyleExample>,
    pub patterns: BTreeMap<String, PatternSpec>,
    #[serde(default)]
    pub professional: BTreeMap<String, PatternSpec>,
    #[serde(default)]
    pub overrides: BTreeMap<String, f64>,
    pub status: String,
    pub content_hash: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CompiledPattern {
    pub id: String,
    pub lo: f64,
    pub hi: f64,
    pub tolerance: f64,
    pub weight: f64,
    pub class: Class,
}

#[derive(Clone, Debug)]
pub struct CompiledStyle {
    pub id: String,
    pub version: u32,
    pub name: String,
    pub hash: String,
    pub patterns: Vec<CompiledPattern>,
    pub professional: Vec<CompiledPattern>,
    pub overrides: Vec<(String, f64)>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StyleErrorKind {
    NeedsAppUpdate,
}

#[derive(Clone, Debug)]
pub struct StyleError {
    pub kind: StyleErrorKind,
    pub detail: String,
}

fn fail<T>(detail: impl Into<String>) -> Result<T, StyleError> {
    Err(StyleError {
        kind: StyleErrorKind::NeedsAppUpdate,
        detail: detail.into(),
    })
}

const ALLOWED_LICENCES: &[&str] = &["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "PDM-1.0"];

/// The hash covers the profile as canonical JSON (keys sorted, no whitespace) without `content_hash` itself.
/// Canonical form matches `scripts/build-catalog.mjs`: objects sorted by key at every level,
/// arrays in order, numbers in shortest round-trip form (integer-valued floats as integers).
pub fn compute_hash(value: &serde_json::Value) -> String {
    let mut v = value.clone();
    if let Some(o) = v.as_object_mut() {
        o.remove("content_hash");
    }
    sha256_hex(canonical_string(&v).as_bytes())
}

fn canonical_string(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Null => "null".into(),
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Number(n) => canonical_number(n),
        serde_json::Value::String(s) => serde_json::to_string(s).unwrap_or_default(),
        serde_json::Value::Array(a) => {
            let mut out = String::from("[");
            for (i, x) in a.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&canonical_string(x));
            }
            out.push(']');
            out
        }
        serde_json::Value::Object(m) => {
            let mut keys: Vec<&String> = m.keys().collect();
            keys.sort();
            let mut out = String::from("{");
            for (i, k) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(k).unwrap_or_default());
                out.push(':');
                out.push_str(&canonical_string(&m[*k]));
            }
            out.push('}');
            out
        }
    }
}

fn canonical_number(n: &serde_json::Number) -> String {
    if let Some(u) = n.as_u64() {
        return u.to_string();
    }
    if let Some(i) = n.as_i64() {
        return i.to_string();
    }
    let f = n.as_f64().unwrap_or(0.0);
    if f.is_finite() && f.fract() == 0.0 && (-9e15..=9e15).contains(&f) {
        return (f as i64).to_string();
    }
    // Shortest round-trip, like JS JSON.stringify (serde_json already uses ryu/grisu).
    serde_json::to_string(n).unwrap_or_else(|_| "0".into())
}

/// Validation order follows section 14.2 of the spec.
pub fn validate_and_compile(json: &str) -> Result<CompiledStyle, StyleError> {
    let value: serde_json::Value =
        serde_json::from_str(json).or_else(|e| fail(format!("json: {e}")))?;
    // 1. Schema.
    let p: StyleProfile =
        serde_json::from_value(value.clone()).or_else(|e| fail(format!("schema: {e}")))?;
    // 2. Measurement ids.
    for id in p.patterns.keys().chain(p.professional.keys()) {
        if !crate::measure::is_registered(id) {
            return fail(format!("unknown measurement {id}"));
        }
    }
    // 2b. Targets and tolerances must be finite numbers; NaN/inf would poison every comparison.
    for (id, s) in p.patterns.iter().chain(p.professional.iter()) {
        for (n, v) in [
            ("lo", s.target[0]),
            ("hi", s.target[1]),
            ("tolerance", s.tolerance),
            ("weight", s.weight),
        ] {
            if !v.is_finite() {
                return fail(format!("{id}: {n} must be a finite number"));
            }
        }
    }
    for (k, v) in &p.overrides {
        if !v.is_finite() {
            return fail(format!("override {k} must be a finite number"));
        }
    }
    for k in p.overrides.keys() {
        if override_range(k).is_none() {
            return fail(format!("unknown override {k}"));
        }
    }
    // 3. Ranges.
    for (id, s) in p.patterns.iter().chain(p.professional.iter()) {
        if s.target[0].partial_cmp(&s.target[1]) == Some(std::cmp::Ordering::Greater) {
            return fail(format!("{id}: lo > hi"));
        }
        if s.tolerance.partial_cmp(&0.0) != Some(std::cmp::Ordering::Greater) {
            return fail(format!("{id}: tolerance must be above 0"));
        }
        if !(0.0..=1.0).contains(&s.weight) {
            return fail(format!("{id}: weight outside 0..1"));
        }
    }
    // 4. Overrides inside their allowed range.
    for (k, v) in &p.overrides {
        let (lo, hi) = override_range(k).unwrap();
        if *v < lo || *v > hi {
            return fail(format!("override {k} outside {lo}..{hi}"));
        }
    }
    // 5. Hash.
    let want = p.content_hash.trim_start_matches("sha256:");
    if compute_hash(&value) != want {
        return fail("content hash mismatch");
    }
    // 6. Examples carry a licence that allows use, and attribution.
    for ex in &p.examples {
        if !ALLOWED_LICENCES.contains(&ex.license.as_str()) || ex.attribution.trim().is_empty() {
            return fail(format!(
                "example {} has no usable licence or attribution",
                ex.image
            ));
        }
    }
    let compile = |m: &BTreeMap<String, PatternSpec>, class| -> Vec<CompiledPattern> {
        m.iter()
            .map(|(id, s)| CompiledPattern {
                id: id.clone(),
                lo: s.target[0],
                hi: s.target[1],
                tolerance: s.tolerance,
                weight: s.weight,
                class,
            })
            .collect()
    };
    Ok(CompiledStyle {
        id: p.id.clone(),
        version: p.version,
        name: p.name.clone(),
        hash: p.content_hash.clone(),
        patterns: compile(&p.patterns, Class::Pattern),
        professional: compile(&p.professional, Class::Professional),
        overrides: p.overrides.iter().map(|(k, v)| (k.clone(), *v)).collect(),
    })
}

/// Compiled styles are cached by hash, so a style is compiled once per session.
#[derive(Default)]
pub struct StyleStore {
    cache: HashMap<String, Arc<CompiledStyle>>,
}

impl StyleStore {
    pub fn load(&mut self, json: &str) -> Result<Arc<CompiledStyle>, StyleError> {
        let style = validate_and_compile(json)?;
        Ok(self
            .cache
            .entry(style.hash.clone())
            .or_insert_with(|| Arc::new(style))
            .clone())
    }
}

/// Score of one pattern: 1 inside the range, falling to 0 one tolerance outside it.
pub fn pattern_score(m: f64, lo: f64, hi: f64, tolerance: f64) -> f64 {
    let distance = if m < lo {
        lo - m
    } else if m > hi {
        m - hi
    } else {
        0.0
    };
    (1.0 - distance / tolerance).max(0.0)
}

/// Weighted mean of pattern scores. Optional display, decided by the product.
pub fn overall_fit(scores: &[(f64, f64)]) -> Option<f64> {
    let w: f64 = scores.iter().map(|(_, w)| w).sum();
    if w <= 0.0 {
        None
    } else {
        Some(scores.iter().map(|(s, w)| s * w).sum::<f64>() / w)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scoring_matches_worked_example() {
        assert!((pattern_score(0.27, 0.0, 0.2, 0.1) - 0.3).abs() < 1e-9);
        assert!((pattern_score(0.08, 0.1, 0.5, 0.15) - 0.8667).abs() < 1e-3);
        assert_eq!(pattern_score(0.55, 0.4, 0.8, 0.2), 1.0);
        assert_eq!(pattern_score(2.0, 0.0, 0.2, 0.1), 0.0);
    }
}
