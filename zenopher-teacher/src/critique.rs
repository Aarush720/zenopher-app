//! What the client sends with the page image for "Review my design" (spec 17).
//! Findings are summarised by rule name and numbers only: no layer ids, no document content.
use crate::finding::*;
use crate::messages::{fmt_expected, fmt_value};
use crate::model::Level;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PageFacts {
    pub width_px: u32,
    pub height_px: u32,
    pub mode: String,
    pub style_name: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FindingSummary {
    pub rule: String,
    pub class: Class,
    pub severity: Severity,
    pub measured: String,
    pub expected: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CritiqueRequest {
    pub page: PageFacts,
    pub findings: Vec<FindingSummary>,
}

pub fn level_name(l: Level) -> &'static str {
    match l {
        Level::Creative => "creative",
        Level::CorporateBase => "corporate_base",
        Level::CorporateFull => "corporate_full",
    }
}

pub fn build_request(
    width: f32,
    height: f32,
    level: Level,
    style_name: Option<&str>,
    findings: &[&Finding],
) -> CritiqueRequest {
    CritiqueRequest {
        page: PageFacts {
            width_px: width.round() as u32,
            height_px: height.round() as u32,
            mode: level_name(level).into(),
            style_name: style_name.map(str::to_string),
        },
        findings: findings
            .iter()
            .map(|f| FindingSummary {
                rule: f.rule.clone(),
                class: f.class,
                severity: f.severity,
                measured: fmt_value(f.measured.unit, f.measured.value),
                expected: fmt_expected(f.measured.unit, &f.expected),
            })
            .collect(),
    }
}
