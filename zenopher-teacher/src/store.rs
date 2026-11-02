//! Holds findings between runs, diffs them by key, and tracks dismissals.
use crate::finding::*;
use crate::model::LayerId;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Diff {
    pub added: Vec<Finding>,
    pub changed: Vec<Finding>,
    pub resolved: Vec<FindingKey>,
    /// Visible must findings. Optional findings never count toward the badge.
    pub badge: usize,
    /// Rules that threw or were too heavy this run. Their previous findings are kept.
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
    all: Vec<Finding>,
    /// First-seen order, so the list does not jump around between runs.
    order: HashMap<FindingKey, u64>,
    next_order: u64,
    dismissed: HashMap<FindingKey, Dismissal>,
}

impl FindingStore {
    pub fn visible(&self) -> Vec<&Finding> {
        let mut v: Vec<&Finding> = self
            .all
            .iter()
            .filter(|f| !self.dismissed.contains_key(&f.key()))
            .collect();
        v.sort_by_key(|f| self.order.get(&f.key()).copied().unwrap_or(u64::MAX));
        v
    }
    pub fn get(&self, key: &FindingKey) -> Option<&Finding> {
        self.visible().into_iter().find(|f| &f.key() == key)
    }
    pub fn badge(&self) -> usize {
        self.visible()
            .iter()
            .filter(|f| f.severity == Severity::Must)
            .count()
    }

    pub fn clear(&mut self) -> Diff {
        let resolved: Vec<FindingKey> = self.visible().iter().map(|f| f.key()).collect();
        self.all.clear();
        self.dismissed.clear();
        Diff {
            resolved,
            ..Default::default()
        }
    }

    /// Hide until the layers change. For findings with no layers, until the measured value moves by more than 0.05.
    pub fn dismiss(&mut self, key: &FindingKey, versions: &HashMap<LayerId, u64>) -> Option<Diff> {
        let f = self.get(key)?.clone();
        let v = f
            .layers
            .iter()
            .map(|id| (*id, versions.get(id).copied().unwrap_or(0)))
            .collect();
        self.dismissed.insert(
            key.clone(),
            Dismissal {
                versions: v,
                measured: f.measured.value,
            },
        );
        Some(Diff {
            resolved: vec![key.clone()],
            badge: self.badge(),
            ..Default::default()
        })
    }

    /// Replace findings with a finished run. `keep_rules` are rules that failed this run: their old findings stay.
    pub fn update(
        &mut self,
        mut fresh: Vec<Finding>,
        keep_rules: &[String],
        versions: &HashMap<LayerId, u64>,
    ) -> Diff {
        let before: HashMap<FindingKey, Finding> = self
            .visible()
            .into_iter()
            .map(|f| (f.key(), f.clone()))
            .collect();
        for f in self.all.iter().filter(|f| keep_rules.contains(&f.rule)) {
            fresh.push(f.clone());
        }
        for f in &fresh {
            let k = f.key();
            if !self.order.contains_key(&k) {
                self.order.insert(k, self.next_order);
                self.next_order += 1;
            }
        }
        self.all = fresh;
        // A dismissal ends when its layers changed, or (page-wide findings) when the value moved.
        let current: HashMap<FindingKey, &Finding> =
            self.all.iter().map(|f| (f.key(), f)).collect();
        self.dismissed.retain(|k, d| match current.get(k) {
            None => false,
            Some(f) if f.layers.is_empty() => (f.measured.value - d.measured).abs() <= 0.05,
            Some(_) => d.versions.iter().all(|(id, v)| versions.get(id) == Some(v)),
        });
        let after: HashMap<FindingKey, Finding> = self
            .visible()
            .into_iter()
            .map(|f| (f.key(), f.clone()))
            .collect();
        let mut diff = Diff {
            badge: self.badge(),
            ..Default::default()
        };
        for f in self.visible() {
            match before.get(&f.key()) {
                None => diff.added.push(f.clone()),
                Some(old) if old != f => diff.changed.push(f.clone()),
                _ => {}
            }
        }
        let mut gone: Vec<&FindingKey> =
            before.keys().filter(|k| !after.contains_key(*k)).collect();
        gone.sort();
        diff.resolved = gone.into_iter().cloned().collect();
        diff
    }
}
