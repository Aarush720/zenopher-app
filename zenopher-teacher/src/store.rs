//! Holds findings between runs, diffs them by key, and tracks dismissals.
use crate::finding::*;
use crate::model::LayerId;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Diff {
    pub added: Vec<Finding>,
    pub changed: Vec<Finding>,
    pub resolved: Vec<FindingKey>,
    pub badge: usize,
    /// Rules that failed this run. Their previous findings are kept as manual guidance.
    pub unavailable: Vec<String>,
}
impl Diff {
    pub fn is_empty(&self) -> bool {
        self.added.is_empty()
            && self.changed.is_empty()
            && self.resolved.is_empty()
            && self.unavailable.is_empty()
    }
}
struct Dismissal {
    versions: Vec<(LayerId, u64)>,
    measured: f64,
}
#[derive(Default)]
pub struct FindingStore {
    // Keys are built once, and entries stay in display order between reads.
    all: Vec<(FindingKey, Finding)>,
    indexes: HashMap<FindingKey, usize>,
    order: HashMap<FindingKey, u64>,
    next_order: u64,
    dismissed: HashMap<FindingKey, Dismissal>,
}
impl FindingStore {
    pub fn visible(&self) -> Vec<&Finding> {
        self.all
            .iter()
            .filter(|(k, _)| !self.dismissed.contains_key(k))
            .map(|(_, f)| f)
            .collect()
    }
    pub fn get(&self, key: &FindingKey) -> Option<&Finding> {
        if self.dismissed.contains_key(key) {
            return None;
        }
        self.indexes
            .get(key)
            .and_then(|i| self.all.get(*i))
            .map(|(_, f)| f)
    }
    pub fn badge(&self) -> usize {
        self.all
            .iter()
            .filter(|(k, f)| f.severity == Severity::Must && !self.dismissed.contains_key(k))
            .count()
    }
    pub fn clear(&mut self) -> Diff {
        let resolved = self
            .all
            .iter()
            .filter(|(k, _)| !self.dismissed.contains_key(k))
            .map(|(k, _)| k.clone())
            .collect();
        self.all.clear();
        self.indexes.clear();
        self.dismissed.clear();
        self.order.clear();
        self.next_order = 0;
        Diff {
            resolved,
            ..Default::default()
        }
    }
    pub fn dismiss(&mut self, key: &FindingKey, versions: &HashMap<LayerId, u64>) -> Option<Diff> {
        let f = self.get(key)?;
        let d = Dismissal {
            versions: f
                .layers
                .iter()
                .map(|id| (*id, versions.get(id).copied().unwrap_or(0)))
                .collect(),
            measured: f.measured.value,
        };
        self.dismissed.insert(key.clone(), d);
        Some(Diff {
            resolved: vec![key.clone()],
            badge: self.badge(),
            ..Default::default()
        })
    }
    pub fn update(
        &mut self,
        mut fresh: Vec<Finding>,
        keep_rules: &[String],
        versions: &HashMap<LayerId, u64>,
    ) -> Diff {
        let old = std::mem::take(&mut self.all);
        let before: HashMap<&FindingKey, &Finding> = old
            .iter()
            .filter(|(k, _)| !self.dismissed.contains_key(k))
            .map(|(k, f)| (k, f))
            .collect();
        for (_, f) in old.iter().filter(|(_, f)| keep_rules.contains(&f.rule)) {
            let mut kept = f.clone();
            kept.fix = None; // A failed check cannot authorize commands based on an older snapshot.
            fresh.push(kept);
        }
        let mut seen = HashSet::new();
        for f in fresh {
            let k = f.key();
            if !seen.insert(k.clone()) {
                continue;
            }
            if !self.order.contains_key(&k) {
                self.order.insert(k.clone(), self.next_order);
                self.next_order += 1;
            }
            self.all.push((k, f));
        }
        self.all
            .sort_by_key(|(k, _)| self.order.get(k).copied().unwrap_or(u64::MAX));
        self.indexes = self
            .all
            .iter()
            .enumerate()
            .map(|(i, (k, _))| (k.clone(), i))
            .collect();
        self.dismissed.retain(
            |k, d| match self.indexes.get(k).and_then(|i| self.all.get(*i)) {
                None => false,
                Some((_, f)) if f.layers.is_empty() => {
                    (f.measured.value - d.measured).abs() <= 0.05
                }
                Some(_) => d.versions.iter().all(|(id, v)| versions.get(id) == Some(v)),
            },
        );
        let mut diff = Diff {
            badge: self.badge(),
            ..Default::default()
        };
        for (k, f) in self
            .all
            .iter()
            .filter(|(k, _)| !self.dismissed.contains_key(k))
        {
            match before.get(k) {
                None => diff.added.push(f.clone()),
                Some(old) if *old != f => diff.changed.push(f.clone()),
                _ => {}
            }
        }
        diff.resolved = before
            .keys()
            .filter(|k| !self.indexes.contains_key(*k) || self.dismissed.contains_key(*k))
            .map(|k| (*k).clone())
            .collect();
        diff.resolved.sort();
        diff
    }
}
