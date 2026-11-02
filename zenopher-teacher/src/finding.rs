//! One shape for every check result.
use crate::color::Color;
use crate::model::{LayerId, Rect};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Class {
    Base,
    Pattern,
    Professional,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Must,
    Optional,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Unit {
    Ratio,
    Px,
    Share,
    Fraction,
    Count,
    Dpi,
    Mm,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Measured {
    pub value: f64,
    pub unit: Unit,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Expected {
    AtLeast { value: f64 },
    AtMost { value: f64 },
    Range { lo: f64, hi: f64 },
    Exactly { value: f64 },
}

/// A message template id plus its arguments. English text comes from `messages`; other languages later.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MessageKey {
    pub key: String,
    pub args: BTreeMap<String, String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FixSafety {
    Safe,
    NeedsInput,
}

/// Engine commands a fix is made of. The shell runs a fix's commands as one undoable batch.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Command {
    SetTextColor { layer: LayerId, color: Color },
    SetFontSize { layer: LayerId, size_px: f32 },
    SetLeading { layer: LayerId, leading: f32 },
    SetBounds { layer: LayerId, rect: Rect },
    MoveBy { layer: LayerId, dx: f32, dy: f32 },
}

impl Command {
    /// What the command writes. Two commands that write the same thing conflict.
    pub fn touches(&self) -> (LayerId, &'static str) {
        match self {
            Command::SetTextColor { layer, .. } => (*layer, "colour"),
            Command::SetFontSize { layer, .. } => (*layer, "size"),
            Command::SetLeading { layer, .. } => (*layer, "leading"),
            Command::SetBounds { layer, .. } | Command::MoveBy { layer, .. } => {
                (*layer, "geometry")
            }
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Fix {
    pub safety: FixSafety,
    pub commands: Vec<Command>,
    /// For example "text:12:colour".
    pub conflict_key: String,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Extra {
    /// Normalised page position of the visual-weight centroid (balance).
    pub centroid: Option<(f32, f32)>,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct FindingKey(pub String);

impl std::fmt::Display for FindingKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

pub fn make_key(rule: &str, layers: &[LayerId]) -> FindingKey {
    let mut ids = layers.to_vec();
    ids.sort_unstable();
    let ids: Vec<String> = ids.iter().map(|i| i.to_string()).collect();
    FindingKey(format!("{}@{}", rule, ids.join("+")))
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Finding {
    pub rule: String,
    pub class: Class,
    pub severity: Severity,
    /// Sorted. Together with `rule` this is the stable key.
    pub layers: Vec<LayerId>,
    pub measured: Measured,
    pub expected: Expected,
    /// Pattern findings only, 0 to 1.
    pub score: Option<f32>,
    pub measurement_confidence: f32,
    pub message: MessageKey,
    pub explanation: MessageKey,
    pub fix: Option<Fix>,
    /// True when a must finding was downgraded for low measurement confidence.
    pub unsure: bool,
    pub extra: Option<Extra>,
}

impl Finding {
    pub fn key(&self) -> FindingKey {
        make_key(&self.rule, &self.layers)
    }
}
