//! Outcomes of findings, never content. No layer ids, text, colours or page content.
use crate::finding::Class;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Applied,
    Dismissed,
    Undone,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct LearningEvent {
    pub rule: String,
    pub class: Class,
    pub outcome: Outcome,
    pub mode: String,
    pub style_id: Option<String>,
    pub occurred_at: u64,
}
