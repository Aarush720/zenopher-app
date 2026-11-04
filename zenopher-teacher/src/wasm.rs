//! JSON-in, JSON-out bridge for the browser. Build with: wasm-pack build --target web --features wasm
//! Inside the full engine crate you would call `Teacher` directly and pass the engine's own `Renderer`;
//! this bridge uses the geometric fallback renderer so the teacher also runs standalone.
use crate::background::GeometricRenderer;
use crate::config::Config;
use crate::finding::FindingKey;
use crate::hints::RuleStats;
use crate::model::{Level, Snapshot};
use crate::planner::ApplyAllPlan;
use crate::teacher::Teacher;
use wasm_bindgen::prelude::*;

fn err<E: std::fmt::Display>(e: E) -> JsValue {
    JsValue::from_str(&e.to_string())
}
fn json<T: serde::Serialize>(v: &T) -> Result<String, JsValue> {
    serde_json::to_string(v).map_err(err)
}
fn snap(s: &str) -> Result<Snapshot, JsValue> {
    serde_json::from_str(s).map_err(err)
}

#[wasm_bindgen]
pub struct WasmTeacher {
    inner: Teacher,
    snapshot_cache: Option<(String, Snapshot)>,
}

#[wasm_bindgen]
impl WasmTeacher {
    #[wasm_bindgen(constructor)]
    pub fn new(config_json: &str) -> Result<WasmTeacher, JsValue> {
        let cfg: Config = if config_json.is_empty() {
            Config::default()
        } else {
            serde_json::from_str(config_json).map_err(err)?
        };
        Ok(WasmTeacher {
            inner: Teacher::new(cfg),
            snapshot_cache: None,
        })
    }
    /// "creative" | "corporate_base" | "corporate_full". Returns a diff JSON when findings were cleared, else "".
    pub fn set_level(&mut self, level: &str) -> Result<String, JsValue> {
        let l: Level = serde_json::from_str(&format!("\"{level}\"")).map_err(err)?;
        match self.inner.set_level(l) {
            Some(d) => json(&d),
            None => Ok(String::new()),
        }
    }
    /// Validates and attaches a style profile. Throws with the reason key on failure.
    pub fn set_style_json(&mut self, profile_json: &str) -> Result<(), JsValue> {
        let s = self
            .inner
            .load_style(profile_json)
            .map_err(|e| err(format!("needs_update: {}", e.detail)))?;
        self.inner.set_style(Some(s));
        Ok(())
    }
    pub fn clear_style(&mut self) {
        self.inner.set_style(None);
    }
    pub fn on_change(&mut self, layer_ids: &[u32], page_changed: bool, now_ms: f64) {
        self.inner.on_change(layer_ids, page_changed, now_ms as u64);
    }
    pub fn gesture_start(&mut self) {
        self.inner.gesture_start();
    }
    pub fn gesture_end(&mut self, now_ms: f64) {
        self.inner.gesture_end(now_ms as u64);
    }
    pub fn run(&mut self) {
        self.inner.run();
    }
    /// Milliseconds until work is due, or -1 when the host can sleep until the next edit.
    pub fn next_pump_delay(&self, now_ms: f64) -> f64 {
        self.inner
            .next_pump_delay(now_ms as u64)
            .map_or(-1.0, |ms| ms as f64)
    }
    /// Drive a scheduled slice. Identical snapshots are decoded once across slices.
    pub fn pump(&mut self, snapshot_json: &str, now_ms: f64) -> Result<String, JsValue> {
        if self.inner.next_pump_delay(now_ms as u64) != Some(0) {
            return Ok(String::new());
        }
        if !self
            .snapshot_cache
            .as_ref()
            .is_some_and(|(json, _)| json == snapshot_json)
        {
            self.snapshot_cache = Some((snapshot_json.to_owned(), snap(snapshot_json)?));
        }
        let Some((_, snapshot)) = self.snapshot_cache.as_ref() else {
            return Ok(String::new());
        };
        match self.inner.pump(snapshot, &GeometricRenderer, now_ms as u64) {
            Some(d) => json(&d),
            None => Ok(String::new()),
        }
    }
    pub fn findings(&self) -> Result<String, JsValue> {
        json(&self.inner.findings())
    }
    pub fn badge(&self) -> usize {
        self.inner.badge()
    }
    pub fn explain(&self, key: &str) -> Result<String, JsValue> {
        self.inner.explain(&FindingKey(key.into())).map_err(err)
    }
    pub fn show(&self, key: &str) -> Result<String, JsValue> {
        json(&self.inner.show(&FindingKey(key.into())).map_err(err)?)
    }
    /// Returns a fix batch JSON. The shell runs its commands as one undoable step.
    pub fn apply(&mut self, key: &str, now_ms: f64) -> Result<String, JsValue> {
        json(
            &self
                .inner
                .apply(&FindingKey(key.into()), now_ms as u64)
                .map_err(err)?,
        )
    }
    pub fn apply_all(&mut self) -> Result<String, JsValue> {
        json(&self.inner.apply_all().map_err(err)?)
    }
    pub fn commit_apply_all(&mut self, plan_json: &str, now_ms: f64) -> Result<String, JsValue> {
        let plan: ApplyAllPlan = serde_json::from_str(plan_json).map_err(err)?;
        json(
            &self
                .inner
                .commit_apply_all(&plan, now_ms as u64)
                .map_err(err)?,
        )
    }
    pub fn reset_apply_all(&mut self) {
        self.inner.reset_apply_all();
    }
    pub fn dismiss(
        &mut self,
        key: &str,
        snapshot_json: &str,
        now_ms: f64,
    ) -> Result<String, JsValue> {
        json(
            &self
                .inner
                .dismiss(
                    &FindingKey(key.into()),
                    &snap(snapshot_json)?,
                    now_ms as u64,
                )
                .map_err(err)?,
        )
    }
    pub fn note_undo(&mut self, key: &str, now_ms: f64) {
        self.inner.note_undo(&FindingKey(key.into()), now_ms as u64);
    }
    pub fn take_events(&mut self) -> Result<String, JsValue> {
        json(&self.inner.take_events())
    }
    pub fn export_stats(&self) -> Result<String, JsValue> {
        json(&self.inner.export_stats())
    }
    pub fn import_stats(&mut self, rows_json: &str) -> Result<(), JsValue> {
        let rows: Vec<RuleStats> = serde_json::from_str(rows_json).map_err(err)?;
        self.inner.import_stats(rows);
        Ok(())
    }
    pub fn critique_request(&self) -> Result<String, JsValue> {
        json(&self.inner.critique_request())
    }
}
