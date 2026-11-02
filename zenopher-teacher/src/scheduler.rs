//! When to run. Never during a gesture; 400 ms after the last change once the gesture ends.
use crate::model::LayerId;
use std::collections::BTreeSet;

#[derive(Debug, Default)]
pub struct Trigger {
    pub dirty_layers: Vec<LayerId>,
    pub page_dirty: bool,
}

#[derive(Debug)]
pub struct Scheduler {
    idle_ms: u64,
    gesture: bool,
    dirty: BTreeSet<LayerId>,
    page_dirty: bool,
    last_change: Option<u64>,
    forced: bool,
}

impl Scheduler {
    pub fn new(idle_ms: u64) -> Self {
        Scheduler {
            idle_ms,
            gesture: false,
            dirty: BTreeSet::new(),
            page_dirty: false,
            last_change: None,
            forced: false,
        }
    }
    pub fn gesture_active(&self) -> bool {
        self.gesture
    }
    /// A change during the idle window extends it.
    pub fn on_change(&mut self, layers: &[LayerId], page: bool, now: u64) {
        self.dirty.extend(layers.iter().copied());
        self.page_dirty |= page;
        self.last_change = Some(now);
    }
    pub fn gesture_start(&mut self) {
        self.gesture = true;
    }
    pub fn gesture_end(&mut self, now: u64) {
        self.gesture = false;
        if !self.dirty.is_empty() || self.page_dirty {
            self.last_change = Some(now);
        }
    }
    /// Run for the whole page regardless of the idle window (mode switch, style change). Still waits out a gesture.
    pub fn force(&mut self) {
        self.forced = true;
        self.page_dirty = true;
    }
    pub fn poll(&mut self, now: u64) -> Option<Trigger> {
        if self.gesture {
            return None;
        }
        let due = self.forced
            || self
                .last_change
                .is_some_and(|t| now.saturating_sub(t) >= self.idle_ms);
        if !due || (self.dirty.is_empty() && !self.page_dirty) {
            return None;
        }
        let t = Trigger {
            dirty_layers: std::mem::take(&mut self.dirty).into_iter().collect(),
            page_dirty: self.page_dirty,
        };
        self.page_dirty = false;
        self.forced = false;
        self.last_change = None;
        Some(t)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn waits_for_idle_and_gesture() {
        let mut s = Scheduler::new(400);
        s.gesture_start();
        s.on_change(&[1], false, 0);
        assert!(s.poll(10_000).is_none(), "nothing runs during a gesture");
        s.gesture_end(1000);
        assert!(s.poll(1399).is_none());
        s.on_change(&[2], false, 1300); // extends the window
        assert!(s.poll(1699).is_none());
        let t = s.poll(1700).unwrap();
        assert_eq!(t.dirty_layers, vec![1, 2]);
        assert!(s.poll(9999).is_none());
    }
    #[test]
    fn force_skips_the_window_but_not_the_gesture() {
        let mut s = Scheduler::new(400);
        s.gesture_start();
        s.force();
        assert!(s.poll(0).is_none());
        s.gesture_end(5);
        assert!(s.poll(5).unwrap().page_dirty);
    }
}
