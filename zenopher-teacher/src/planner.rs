//! Single fixes and "Apply all". Commands are never run here; the shell runs them as one undoable batch.
use crate::finding::*;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PlannedFix {
    pub key: FindingKey,
    pub rule: String,
    pub message: String,
    pub commands: Vec<Command>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Skipped {
    pub key: FindingKey,
    pub reason: String,
}

/// What the user is shown before anything changes.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ApplyAllPlan {
    pub id: u64,
    pub pass: u8,
    pub max_passes: u8,
    pub fixes: Vec<PlannedFix>,
    pub skipped: Vec<Skipped>,
    pub summary: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FixBatch {
    pub keys: Vec<FindingKey>,
    pub commands: Vec<Command>,
}

/// Safe fixes only, must findings first, in list order. A fix that writes something an earlier fix already writes is
/// skipped; the next pass will see the result and decide again.
pub fn plan(
    findings: &[&Finding],
    id: u64,
    pass: u8,
    max_passes: u8,
    render: &dyn Fn(&MessageKey) -> String,
) -> ApplyAllPlan {
    let mut ordered: Vec<&&Finding> = findings.iter().collect();
    ordered.sort_by_key(|f| if f.severity == Severity::Must { 0 } else { 1 });
    let mut touched: HashSet<(u32, &'static str)> = HashSet::new();
    let (mut fixes, mut skipped) = (vec![], vec![]);
    for f in ordered {
        let Some(fix) = f
            .fix
            .as_ref()
            .filter(|x| x.safety == FixSafety::Safe && !x.commands.is_empty())
        else {
            continue;
        };
        let writes: Vec<_> = fix.commands.iter().map(|c| c.touches()).collect();
        if writes.iter().any(|w| touched.contains(w)) {
            skipped.push(Skipped {
                key: f.key(),
                reason: "conflicts with another fix in this batch".into(),
            });
            continue;
        }
        touched.extend(writes);
        fixes.push(PlannedFix {
            key: f.key(),
            rule: f.rule.clone(),
            message: render(&f.message),
            commands: fix.commands.clone(),
        });
    }
    let summary = match fixes.len() {
        0 => "Nothing can be fixed automatically.".to_string(),
        1 => "1 fix will be applied as one step you can undo.".to_string(),
        n => format!("{n} fixes will be applied as one step you can undo."),
    };
    ApplyAllPlan {
        id,
        pass,
        max_passes,
        fixes,
        skipped,
        summary,
    }
}

pub fn batch_of(plan: &ApplyAllPlan) -> FixBatch {
    FixBatch {
        keys: plan.fixes.iter().map(|f| f.key.clone()).collect(),
        commands: plan.fixes.iter().flat_map(|f| f.commands.clone()).collect(),
    }
}
