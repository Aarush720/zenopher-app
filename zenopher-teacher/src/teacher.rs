//! The public teacher API (spec 15.2). The shell calls these and nothing else.
use crate::background::{BgCache, Renderer};
use crate::config::Config;
use crate::critique::{self, CritiqueRequest};
use crate::events::{LearningEvent, Outcome};
use crate::finding::*;
use crate::hints::{Display, Hints, RuleStats};
use crate::measure::Env;
use crate::messages;
use crate::model::*;
use crate::planner::{self, ApplyAllPlan, FixBatch};
use crate::rules::{self, RuleDef};
use crate::runner::classify;
use crate::scheduler::Scheduler;
use crate::store::{Diff, FindingStore};
use crate::style::{CompiledPattern, CompiledStyle, StyleError, StyleStore};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TeacherError {
    NotFound,
    NoSafeFix,
    StalePlan,
    PassLimit,
}

impl std::fmt::Display for TeacherError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            TeacherError::NotFound => "That finding is no longer there.",
            TeacherError::NoSafeFix => "This finding has no automatic fix.",
            TeacherError::StalePlan => "The design changed since the summary was shown.",
            TeacherError::PassLimit => "Apply all has already run its maximum number of passes.",
        })
    }
}

/// A finding with its text and display hints, ready for a shell to render.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FindingView {
    pub key: FindingKey,
    pub finding: Finding,
    pub message: String,
    pub explanation: String,
    pub display: Display,
}

enum Job {
    Rule(&'static RuleDef),
    Pattern(CompiledPattern),
}

struct RunState {
    jobs: Vec<Job>,
    next: usize,
    fresh: Vec<Finding>,
    failed: Vec<String>,
    cfg: Config,
}

struct Recent {
    rule: String,
    class: Class,
    at: u64,
}

type Subscriber = Box<dyn FnMut(&Diff) + Send>;

pub struct Teacher {
    cfg: Config,
    level: Level,
    style: Option<Arc<CompiledStyle>>,
    styles: StyleStore,
    sched: Scheduler,
    run: Option<RunState>,
    store: FindingStore,
    hints: Hints,
    subs: Vec<Subscriber>,
    events: Vec<LearningEvent>,
    recent: HashMap<FindingKey, Recent>,
    bg: RefCell<BgCache>,
    next_plan: u64,
    last_plan: Option<u64>,
    passes: u8,
    last_unavailable: Vec<String>,
    last_versions: HashMap<LayerId, u64>,
    page_size: (f32, f32),
}

impl Teacher {
    pub fn new(cfg: Config) -> Self {
        let sched = Scheduler::new(cfg.orchestration.idle_ms);
        Teacher {
            cfg,
            level: Level::Creative,
            style: None,
            styles: StyleStore::default(),
            sched,
            run: None,
            store: FindingStore::default(),
            hints: Hints::default(),
            subs: vec![],
            events: vec![],
            recent: HashMap::new(),
            bg: RefCell::new(BgCache::default()),
            next_plan: 1,
            last_plan: None,
            passes: 0,
            last_unavailable: vec![],
            last_versions: HashMap::new(),
            page_size: (0.0, 0.0),
        }
    }

    pub fn level(&self) -> Level {
        self.level
    }
    pub fn style(&self) -> Option<&Arc<CompiledStyle>> {
        self.style.as_ref()
    }

    /// Full checks need a style; without one a Corporate design gets base checks only.
    fn effective(&self) -> Level {
        match self.level {
            Level::CorporateFull if self.style.is_none() => Level::CorporateBase,
            l => l,
        }
    }

    fn emit(&mut self, d: &Diff) {
        for s in self.subs.iter_mut() {
            s(d);
        }
    }

    pub fn subscribe(&mut self, cb: Subscriber) {
        self.subs.push(cb);
    }

    /// Creative clears findings and stops the teacher. The other levels schedule a full run.
    pub fn set_level(&mut self, level: Level) -> Option<Diff> {
        if level == self.level {
            return None;
        }
        self.level = level;
        self.run = None;
        self.passes = 0;
        self.last_plan = None;
        if level == Level::Creative {
            let d = self.store.clear();
            self.emit(&d);
            return Some(d);
        }
        self.sched.force();
        None
    }

    pub fn set_style(&mut self, style: Option<Arc<CompiledStyle>>) {
        self.style = style;
        self.run = None;
        self.passes = 0;
        self.last_plan = None;
        if self.level != Level::Creative {
            self.sched.force();
        }
    }

    pub fn load_style(&mut self, json: &str) -> Result<Arc<CompiledStyle>, StyleError> {
        self.styles.load(json)
    }

    // --- inputs from the document core ---

    /// The document core recorded a command. Changes abandon any run in flight.
    /// They also invalidate any pending Apply-all plan: the design changed
    /// since the summary was shown, so committing it must fail as stale.
    pub fn on_change(&mut self, layers: &[LayerId], page_changed: bool, now: u64) {
        self.run = None;
        self.last_plan = None;
        self.sched.on_change(layers, page_changed, now);
    }
    pub fn gesture_start(&mut self) {
        self.sched.gesture_start();
    }
    pub fn gesture_end(&mut self, now: u64) {
        self.sched.gesture_end(now);
    }
    /// Force a run for the whole page (mode switch, style change, or the shell asking).
    pub fn run(&mut self) {
        if self.level != Level::Creative {
            self.run = None;
            self.sched.force();
        }
    }

    /// Drive the teacher from the shell's frame or idle callback. Rules run a few at a time so the editor stays
    /// responsive; a finished run returns its diff. Nothing runs during a gesture.
    pub fn pump(&mut self, snap: &Snapshot, renderer: &dyn Renderer, now: u64) -> Option<Diff> {
        if self.level == Level::Creative || self.sched.gesture_active() {
            return None;
        }
        if self.run.is_none() {
            self.sched.poll(now)?;
            self.start_run();
        }
        let eff = self.effective();
        let mut run = self.run.take()?;
        self.page_size = (snap.page.width_px, snap.page.height_px);
        let env = Env::new(snap, &run.cfg, renderer, &self.bg);
        let mut done = 0;
        while run.next < run.jobs.len() && done < self.cfg.orchestration.rules_per_slice {
            let (id, class, result) = match &run.jobs[run.next] {
                Job::Rule(def) => (def.id.to_string(), def.class, guarded(|| (def.run)(&env))),
                Job::Pattern(p) => (p.id.clone(), p.class, guarded(|| rules::pattern(&env, p))),
            };
            match result {
                Ok(raws) => run
                    .fresh
                    .extend(raws.into_iter().map(|r| classify(r, class, &run.cfg))),
                Err(_) => run.failed.push(id),
            }
            run.next += 1;
            done += 1;
        }
        if run.next < run.jobs.len() {
            self.run = Some(run);
            return None;
        }
        // Finished.
        let versions = snap.layer_versions();
        self.bg
            .borrow_mut()
            .map
            .retain(|id, _| versions.contains_key(id));
        let mut diff = self
            .store
            .update(run.fresh, &expand(&run.failed), &versions);
        run.failed.sort();
        run.failed.dedup();
        diff.unavailable = run.failed;
        self.last_versions = versions;
        let unavailable_changed = diff.unavailable != self.last_unavailable;
        self.last_unavailable = diff.unavailable.clone();
        if diff.added.is_empty()
            && diff.changed.is_empty()
            && diff.resolved.is_empty()
            && !unavailable_changed
        {
            return None;
        }
        self.emit(&diff);
        Some(diff)
    }

    fn start_run(&mut self) {
        let eff = self.effective();
        let full = eff == Level::CorporateFull;
        let mut jobs: Vec<Job> = rules::RULES
            .iter()
            .filter(|r| r.class == Class::Base || full)
            .map(Job::Rule)
            .collect();
        let overrides = self
            .style
            .as_ref()
            .map(|s| s.overrides.clone())
            .unwrap_or_default();
        if full {
            let s = self.style.as_ref().unwrap();
            jobs.extend(s.patterns.iter().cloned().map(Job::Pattern));
            jobs.extend(s.professional.iter().cloned().map(Job::Pattern));
        }
        self.run = Some(RunState {
            jobs,
            next: 0,
            fresh: vec![],
            failed: vec![],
            cfg: self.cfg.with_overrides(&overrides),
        });
    }

    // --- reading ---

    pub fn badge(&self) -> usize {
        self.store.badge()
    }

    pub fn view(&self, f: &Finding) -> FindingView {
        FindingView {
            key: f.key(),
            finding: f.clone(),
            message: messages::message(&f.message),
            explanation: messages::explanation(&f.explanation),
            display: self.hints.display(f, &self.cfg.hints),
        }
    }

    pub fn findings(&self) -> Vec<FindingView> {
        self.store
            .visible()
            .into_iter()
            .map(|f| self.view(f))
            .collect()
    }

    /// The ⓘ text.
    pub fn explain(&self, key: &FindingKey) -> Result<String, TeacherError> {
        self.store
            .get(key)
            .map(|f| messages::explanation(&f.explanation))
            .ok_or(TeacherError::NotFound)
    }

    /// Layers to select on the canvas. For balance, the shell also draws `finding.extra.centroid`.
    pub fn show(&self, key: &FindingKey) -> Result<Vec<LayerId>, TeacherError> {
        self.store
            .get(key)
            .map(|f| f.layers.clone())
            .ok_or(TeacherError::NotFound)
    }

    // --- acting ---

    fn record(&mut self, rule: &str, class: Class, outcome: Outcome, now: u64) {
        self.hints.bump(rule, now, |s| match outcome {
            Outcome::Applied => s.applied += 1,
            Outcome::Dismissed => s.dismissed += 1,
            Outcome::Undone => s.undone_within_60s += 1,
        });
        self.events.push(LearningEvent {
            rule: rule.to_string(),
            class,
            outcome,
            mode: critique::level_name(self.level).into(),
            style_id: self.style.as_ref().map(|s| s.id.clone()),
            occurred_at: now,
        });
    }

    /// One safe fix, returned as commands for one undoable step.
    pub fn apply(&mut self, key: &FindingKey, now: u64) -> Result<FixBatch, TeacherError> {
        let f = self.store.get(key).ok_or(TeacherError::NotFound)?.clone();
        let fix = f
            .fix
            .as_ref()
            .filter(|x| x.safety == FixSafety::Safe && !x.commands.is_empty())
            .ok_or(TeacherError::NoSafeFix)?;
        let batch = FixBatch {
            keys: vec![key.clone()],
            commands: fix.commands.clone(),
        };
        self.record(&f.rule, f.class, Outcome::Applied, now);
        self.recent.insert(
            key.clone(),
            Recent {
                rule: f.rule.clone(),
                class: f.class,
                at: now,
            },
        );
        Ok(batch)
    }

    /// Step one of Apply all: the summary. Nothing changes until `commit_apply_all`.
    pub fn apply_all(&mut self) -> Result<ApplyAllPlan, TeacherError> {
        let max = self.cfg.orchestration.apply_all_max_passes;
        if self.passes >= max {
            return Err(TeacherError::PassLimit);
        }
        let visible = self.store.visible();
        let id = self.next_plan;
        let plan = planner::plan(&visible, id, self.passes + 1, max, &|k| {
            messages::message(k)
        });
        if plan.fixes.is_empty() {
            self.passes = 0;
            return Ok(plan);
        }
        self.next_plan += 1;
        self.last_plan = Some(id);
        Ok(plan)
    }

    /// Step two, after the user confirms. Counts one pass; a later run may offer more fixes.
    pub fn commit_apply_all(
        &mut self,
        plan: &ApplyAllPlan,
        now: u64,
    ) -> Result<FixBatch, TeacherError> {
        if self.last_plan != Some(plan.id) {
            return Err(TeacherError::StalePlan);
        }
        self.last_plan = None;
        self.passes += 1;
        for f in &plan.fixes {
            let class = self
                .store
                .get(&f.key)
                .map(|x| x.class)
                .unwrap_or(Class::Base);
            self.record(&f.rule, class, Outcome::Applied, now);
            self.recent.insert(
                f.key.clone(),
                Recent {
                    rule: f.rule.clone(),
                    class,
                    at: now,
                },
            );
        }
        Ok(planner::batch_of(plan))
    }

    /// The shell calls this when the user does something other than Apply all, so the pass counter starts over.
    pub fn reset_apply_all(&mut self) {
        self.passes = 0;
        self.last_plan = None;
    }

    pub fn dismiss(
        &mut self,
        key: &FindingKey,
        snap: &Snapshot,
        now: u64,
    ) -> Result<Diff, TeacherError> {
        let f = self.store.get(key).ok_or(TeacherError::NotFound)?.clone();
        let diff = self
            .store
            .dismiss(key, &snap.layer_versions())
            .ok_or(TeacherError::NotFound)?;
        self.record(&f.rule, f.class, Outcome::Dismissed, now);
        self.emit(&diff);
        Ok(diff)
    }

    /// The user undid an applied fix. Counts only within 60 seconds.
    pub fn note_undo(&mut self, key: &FindingKey, now: u64) {
        if let Some(r) = self.recent.remove(key) {
            if now.saturating_sub(r.at) <= 60_000 {
                self.record(&r.rule, r.class, Outcome::Undone, now);
            }
        }
    }

    // --- learning and critique ---

    /// Events for the shell's recorder. The shell uploads them only if learning consent is granted.
    pub fn take_events(&mut self) -> Vec<LearningEvent> {
        std::mem::take(&mut self.events)
    }
    pub fn export_stats(&self) -> Vec<RuleStats> {
        self.hints.export()
    }
    pub fn import_stats(&mut self, rows: Vec<RuleStats>) {
        self.hints.import(rows);
    }

    /// Request body for "Review my design". The shell adds the page PNG.
    pub fn critique_request(&self) -> CritiqueRequest {
        let v = self.store.visible();
        critique::build_request(
            self.page_size.0,
            self.page_size.1,
            self.level,
            self.style.as_ref().map(|s| s.name.as_str()),
            &v,
        )
    }
}

/// A rule that panics is isolated: it counts as unavailable and the others carry on.
fn guarded<F: FnOnce() -> rules::RuleResult>(f: F) -> rules::RuleResult {
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(f))
            .unwrap_or_else(|_| Err(rules::RuleError("panic".into())))
    }
    #[cfg(target_arch = "wasm32")]
    {
        f()
    }
}

/// Failed ids are job ids; a base rule like "print" emits findings named "print.dpi" and so on.
fn expand(failed: &[String]) -> Vec<String> {
    let mut v = failed.to_vec();
    for f in failed {
        if f == "print" {
            v.extend(["print.dpi", "print.bleed", "print.colour_mode"].map(String::from));
        }
    }
    v
}
