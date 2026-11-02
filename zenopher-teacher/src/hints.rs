//! Hint policy: display-only adjustments from how familiar the user is with each rule.
//! It never changes what is measured, severity, or what the badge counts, and it never hides a must finding.
use crate::config::HintCfg;
use crate::finding::{Finding, Severity};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Matches what is stored in IndexedDB per rule.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct RuleStats {
    pub rule: String,
    pub applied: u32,
    pub dismissed: u32,
    pub undone_within_60s: u32,
    pub last_updated: u64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Display {
    /// First encounter: show the ⓘ text open.
    pub explain_open: bool,
    /// The user applies this fix routinely: show it compactly.
    pub compact: bool,
    /// An optional finding the user keeps dismissing: list it last.
    pub demoted: bool,
}

#[derive(Default)]
pub struct Hints {
    stats: HashMap<String, RuleStats>,
}

impl Hints {
    pub fn import(&mut self, rows: Vec<RuleStats>) {
        self.stats = rows.into_iter().map(|r| (r.rule.clone(), r)).collect();
    }
    pub fn export(&self) -> Vec<RuleStats> {
        let mut v: Vec<RuleStats> = self.stats.values().cloned().collect();
        v.sort_by(|a, b| a.rule.cmp(&b.rule));
        v
    }
    pub fn bump(&mut self, rule: &str, now: u64, f: impl FnOnce(&mut RuleStats)) {
        let s = self
            .stats
            .entry(rule.to_string())
            .or_insert_with(|| RuleStats {
                rule: rule.to_string(),
                ..Default::default()
            });
        f(s);
        s.last_updated = now;
    }
    pub fn display(&self, f: &Finding, cfg: &HintCfg) -> Display {
        let s = self.stats.get(&f.rule).cloned().unwrap_or_default();
        Display {
            explain_open: s.applied + s.dismissed == 0,
            compact: s.applied >= cfg.familiar_after_applies && s.undone_within_60s == 0,
            demoted: f.severity == Severity::Optional
                && s.applied == 0
                && s.dismissed >= cfg.demote_after_dismissals,
        }
    }
}
