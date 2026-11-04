//! Teacher fixes use existing engine commands, coalesced into one undo step.
use photocraft_engine::Session;
use serde_json::{Value, json};

pub fn apply(session: &mut Session, revision: u64, commands: &[Value], key: &str) -> Result<(), String> {
    let before = session.active().ok_or("No document is open")?.clone();
    if before.revision != revision {
        return Err("The canvas changed. Wait for the teacher to review it again.".into());
    }
    if commands.is_empty() || commands.len() > 2000 {
        return Err("The teacher fix batch has an invalid size".into());
    }
    let mut calls = Vec::with_capacity(commands.len());
    let mut sizes = std::collections::HashMap::<u64, f64>::new();
    for c in commands {
        let layer = c
            .get("layer")
            .and_then(Value::as_str)
            .and_then(|id| id.strip_prefix("photocraft-"))
            .and_then(|id| id.parse::<u64>().ok())
            .ok_or("Wait for the canvas to finish syncing before applying fixes")?;
        let mut p = json!({"layer": layer, "coalesce": key});
        let number = |name: &str| c.get(name).and_then(Value::as_f64).filter(|n| n.is_finite()).ok_or_else(|| format!("Invalid teacher {name}"));
        let id = match c.get("type").and_then(Value::as_str) {
            Some("set_text_color") => {
                let col = c.get("color").ok_or("Missing teacher colour")?;
                let channel =
                    |name: &str| col.get(name).and_then(Value::as_f64).filter(|v| v.is_finite() && (0.0..=1.0).contains(v)).ok_or("Invalid teacher colour");
                p["color"] = json!([channel("r")?, channel("g")?, channel("b")?, channel("a")?]);
                "type.setStyle"
            }
            Some("set_font_size") => {
                let size = number("size_px")?;
                p["size"] = json!(size);
                sizes.insert(layer, size);
                "type.setStyle"
            }
            Some("set_leading") => {
                let native = before.doc.layer(photocraft_doc::LayerId(layer)).ok_or("The layer no longer exists")?;
                let photocraft_doc::LayerContent::Text(text) = &native.content else { return Err("The layer is no longer text".into()) };
                p["leading"] = json!(number("leading")? * sizes.get(&layer).copied().unwrap_or(f64::from(text.size_pt)));
                "type.setStyle"
            }
            Some("move_by") => {
                p["matrix"] = json!([1.0, 0.0, 0.0, 1.0, number("dx")?, number("dy")?]);
                "edit.transform"
            }
            Some("set_bounds") => {
                let rect = c.get("rect").ok_or("Missing teacher bounds")?;
                let from = c.get("from").ok_or("Missing original teacher bounds")?;
                let n = |v: &Value, k: &str| v.get(k).and_then(Value::as_f64).filter(|v| v.is_finite()).ok_or("Invalid teacher bounds");
                let (w, h, fw, fh) = (n(rect, "w")?, n(rect, "h")?, n(from, "w")?, n(from, "h")?);
                if w <= 0.0 || h <= 0.0 || fw <= 0.0 || fh <= 0.0 {
                    return Err("Invalid teacher dimensions".into());
                }
                let (sx, sy) = (w / fw, h / fh);
                p["matrix"] = json!([sx, 0.0, 0.0, sy, n(rect, "x")? - sx * n(from, "x")?, n(rect, "y")? - sy * n(from, "y")?]);
                "edit.transform"
            }
            _ => return Err("Unknown teacher command".into()),
        };
        session.precheck(id, &p).map_err(|e| e.to_string())?;
        calls.push((id, p));
    }
    for (id, p) in calls {
        if let Err(error) = session.execute(id, p) {
            // A failed multi-fix must leave both document and undo history intact.
            if let Some(state) = session.active_mut() {
                *state = before;
            }
            return Err(error.to_string());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (Session, u64) {
        let mut s = Session::new();
        s.execute("file.new", json!({"width": 64, "height":64})).unwrap();
        let id = s.execute("type.create", json!({"text":"Test", "size":12,"x":5,"y":30})).unwrap()["layer"].as_u64().unwrap();
        (s, id)
    }
    #[test]
    fn fixes_are_one_undoable_step_and_stale_revisions_are_rejected() {
        let (mut s, id) = fixture();
        let rev = s.active().unwrap().revision;
        let cmds = vec![
            json!({"type":"set_font_size","layer":format!("photocraft-{id}"),"size_px":24}),
            json!({"type":"set_text_color","layer":format!("photocraft-{id}"),"color":{"r":1,"g":0,"b":0,"a":1}}),
        ];
        apply(&mut s, rev, &cmds, "teacher-test").unwrap();
        assert!(apply(&mut s, rev, &cmds, "stale").is_err());
        s.execute("edit.undo", json!({})).unwrap();
        let LayerContent::Text(t) = &s.active().unwrap().doc.layer(photocraft_doc::LayerId(id)).unwrap().content else { panic!() };
        assert_eq!(t.size_pt, 12.0);
        s.execute("edit.redo", json!({})).unwrap();
        let LayerContent::Text(t) = &s.active().unwrap().doc.layer(photocraft_doc::LayerId(id)).unwrap().content else { panic!() };
        assert_eq!(t.size_pt, 24.0);
    }
    use photocraft_doc::LayerContent;
    #[test]
    fn malformed_or_failed_batch_keeps_document_and_history() {
        let (mut s, id) = fixture();
        let before = s.active().unwrap().clone();
        for cmds in [
            vec![],
            vec![json!({"type":"move_by","layer":"bogus","dx":1,"dy":0})],
            vec![
                json!({"type":"set_font_size","layer":format!("photocraft-{id}"),"size_px":24}),
                json!({"type":"set_font_size","layer":format!("photocraft-{id}"),"size_px":-1}),
            ],
        ] {
            assert!(apply(&mut s, before.revision, &cmds, "fail").is_err());
            assert_eq!(s.active().unwrap().revision, before.revision);
            assert_eq!(s.active().unwrap().doc, before.doc);
        }
    }
}
