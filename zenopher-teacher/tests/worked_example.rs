//! Section 12 of the teacher spec, built as a real snapshot.
use zenopher_teacher::background::GeometricRenderer;
use zenopher_teacher::color::*;
use zenopher_teacher::config::Config;
use zenopher_teacher::finding::*;
use zenopher_teacher::model::*;
use zenopher_teacher::style::{compute_hash, validate_and_compile};
use zenopher_teacher::Teacher;

fn hex(s: &str) -> Color {
    Color::from_hex(s).unwrap()
}

fn layer(id: u32, kind: LayerKind, b: Rect) -> Layer {
    Layer {
        id,
        kind,
        bounds: b,
        visible: true,
        opacity: 1.0,
        version: 1,
        parent: None,
        text: None,
        fill: None,
        shape: None,
        image: None,
    }
}
fn shape(id: u32, b: Rect, fill: &str) -> Layer {
    Layer {
        fill: Some(hex(fill)),
        shape: Some(ShapeKind::Rect),
        ..layer(id, LayerKind::Shape, b)
    }
}
fn text(id: u32, b: Rect, size: f32, color: &str) -> Layer {
    Layer {
        text: Some(TextInfo {
            content: "Hello".into(),
            font_family: "Inter".into(),
            size_px: size,
            leading: 1.2,
            tracking: 0.0,
            bold: false,
            color: hex(color),
            lines: 1,
        }),
        ..layer(id, LayerKind::Text, b)
    }
}

pub fn bauhaus_json() -> String {
    let mut v = serde_json::json!({
        "id": "bauhaus", "version": 3, "name": "Bauhaus",
        "summary": "Geometric forms, a strict grid, a few hues, and large colour blocks.",
        "families": ["geometric", "print"], "uses": ["poster", "social"],
        "principles": ["Geometric forms are the main visual vocabulary.", "Layout follows a visible grid, often asymmetric."],
        "examples": [{"image": "bauhaus/poster-1.webp", "source_url": "https://example.org/source", "license": "CC-BY-4.0", "attribution": "Author, Title, Year"}],
        "patterns": {
            "colour.families": {"target": [1, 3], "tolerance": 1, "weight": 0.2},
            "colour.dominant_share": {"target": [0.4, 0.8], "tolerance": 0.2, "weight": 0.2},
            "colour.neutral_share": {"target": [0.15, 0.5], "tolerance": 0.15, "weight": 0.1},
            "colour.accent_share": {"target": [0.0, 0.2], "tolerance": 0.1, "weight": 0.2},
            "shape.geometric_share": {"target": [0.7, 1.0], "tolerance": 0.2, "weight": 0.15},
            "grid.edge_share": {"target": [0.7, 1.0], "tolerance": 0.2, "weight": 0.15}
        },
        "professional": {"balance.asymmetry": {"target": [0.1, 0.5], "tolerance": 0.15, "weight": 0.5}},
        "overrides": {"spacing.cv_threshold": 0.12},
        "status": "published", "content_hash": ""
    });
    let h = compute_hash(&v);
    v["content_hash"] = format!("sha256:{h}").into();
    v.to_string()
}

/// 1080 x 1080. Blue covers 0.55, yellow 0.27, a small photo sits at the bottom.
pub fn example() -> Snapshot {
    Snapshot {
        page: Page {
            width_px: 1080.0,
            height_px: 1080.0,
            background: hex("#ffffff"),
            ppi: None,
            bleed_mm: None,
            color_mode: ColorMode::Rgb,
        },
        layers: vec![
            shape(1, Rect::new(0.0, 0.0, 1080.0, 594.0), "#2f5fe0"),
            shape(2, Rect::new(0.0, 594.0, 1080.0, 291.6), "#fff500"),
            text(3, Rect::new(100.0, 150.0, 800.0, 90.0), 72.0, "#9db4ec"),
            text(4, Rect::new(120.0, 850.0, 300.0, 20.0), 14.0, "#222222"),
            Layer {
                image: Some(ImageInfo {
                    source_w: 1600,
                    source_h: 1200,
                    displayed_w: 160.0,
                    displayed_h: 160.0,
                }),
                ..layer(5, LayerKind::Image, Rect::new(122.0, 900.0, 160.0, 160.0))
            },
        ],
        style: None,
        mode: Level::CorporateFull,
        intent: Intent::Screen,
    }
}

fn settle(t: &mut Teacher, snap: &Snapshot) -> Option<zenopher_teacher::store::Diff> {
    let mut diff = None;
    for i in 0..100 {
        if let Some(d) = t.pump(snap, &GeometricRenderer, 10_000 + i) {
            diff = Some(d);
            break;
        }
    }
    diff
}

fn teacher_with_style() -> Teacher {
    let mut t = Teacher::new(Config::default());
    let style = t.load_style(&bauhaus_json()).expect("style validates");
    t.set_style(Some(style));
    t.set_level(Level::CorporateFull);
    t
}

#[test]
fn worked_example() {
    let snap = example();
    let mut t = teacher_with_style();
    let diff = settle(&mut t, &snap).expect("a run finished");
    let views = t.findings();
    let by = |rule: &str| {
        views
            .iter()
            .find(|v| v.finding.rule == rule)
            .unwrap_or_else(|| {
                panic!(
                    "missing {rule}: {:?}",
                    views.iter().map(|v| &v.finding.rule).collect::<Vec<_>>()
                )
            })
    };

    // 1. Headline contrast: must, flat background, fix reaches 3.0 and keeps hue.
    let c = by("contrast");
    assert_eq!(c.finding.severity, Severity::Must);
    assert_eq!(c.finding.layers, vec![3]);
    assert_eq!(c.finding.expected, Expected::AtLeast { value: 3.0 });
    assert_eq!(c.finding.measurement_confidence, 1.0);
    assert!(c.finding.measured.value < 3.0);
    let Command::SetTextColor { color, .. } = &c.finding.fix.as_ref().unwrap().commands[0] else {
        panic!()
    };
    assert!(effective_contrast(*color, 1.0, hex("#2f5fe0")) >= 3.0);

    // 2. Caption size: 14 px against a 16.2 px minimum, fix rounds up to 17.
    let s = by("text_size");
    assert_eq!(s.finding.severity, Severity::Must);
    assert_eq!(
        s.finding.fix.as_ref().unwrap().commands,
        vec![Command::SetFontSize {
            layer: 4,
            size_px: 17.0
        }]
    );

    // 3. Caption and photo are 2 px apart; the caption moves to the photo.
    let a = by("alignment");
    assert_eq!(a.finding.layers, vec![4, 5]);
    assert_eq!(a.finding.severity, Severity::Must);
    assert_eq!(
        a.finding.fix.as_ref().unwrap().commands,
        vec![Command::MoveBy {
            layer: 4,
            dx: 2.0,
            dy: 0.0
        }]
    );

    // 7. Photo distortion: 25 percent, restore aspect by height.
    let d = by("distortion");
    assert_eq!(d.finding.severity, Severity::Must);
    assert!((d.finding.measured.value - 0.25).abs() < 0.01);
    let Command::SetBounds { rect, .. } = &d.finding.fix.as_ref().unwrap().commands[0] else {
        panic!()
    };
    assert!((rect.h - 120.0).abs() < 0.01 && (rect.cy() - 980.0).abs() < 0.01);

    // 4. Dominant share is inside Bauhaus's range: nothing shown.
    assert!(!views
        .iter()
        .any(|v| v.finding.rule == "colour.dominant_share"));

    // 5. Accent share: optional, pattern, a low score, no fix.
    let accent = by("colour.accent_share");
    assert_eq!(accent.finding.severity, Severity::Optional);
    assert_eq!(accent.finding.class, Class::Pattern);
    assert!(accent.finding.fix.is_none());
    assert!(accent.finding.score.unwrap() < 0.5);

    // Badge counts must findings only.
    assert_eq!(diff.badge, 4);
    assert_eq!(t.badge(), 4);
    for v in &views {
        assert!(
            v.finding.class != Class::Base
                || v.finding.severity == Severity::Must
                || v.finding.unsure
        );
    }

    // 6. Balance is professional and optional and carries its centroid for the canvas.
    if let Some(b) = views.iter().find(|v| v.finding.rule == "balance.asymmetry") {
        assert_eq!(b.finding.class, Class::Professional);
        assert_eq!(b.finding.severity, Severity::Optional);
        assert!(b.finding.extra.as_ref().unwrap().centroid.is_some());
    }
}

#[test]
fn apply_all_batches_every_safe_fix_once() {
    let snap = example();
    let mut t = teacher_with_style();
    settle(&mut t, &snap);
    let plan = t.apply_all().unwrap();
    assert_eq!(plan.fixes.len(), 4);
    assert!(plan.skipped.is_empty());
    let batch = t.commit_apply_all(&plan, 20_000).unwrap();
    assert_eq!(batch.commands.len(), 4);
    // A plan can only be committed once.
    assert_eq!(
        t.commit_apply_all(&plan, 20_001),
        Err(zenopher_teacher::TeacherError::StalePlan)
    );
}

#[test]
fn creative_mode_is_silent_and_clears_findings() {
    let snap = example();
    let mut t = teacher_with_style();
    settle(&mut t, &snap);
    assert!(t.badge() > 0);
    let d = t.set_level(Level::Creative).unwrap();
    assert!(!d.resolved.is_empty());
    assert_eq!(t.findings().len(), 0);
    assert!(t.pump(&snap, &GeometricRenderer, 99_999).is_none());
}

#[test]
fn corporate_without_style_runs_base_checks_only() {
    let snap = example();
    let mut t = Teacher::new(Config::default());
    t.set_level(Level::CorporateFull); // no style attached: behaves as base
    settle(&mut t, &snap);
    let views = t.findings();
    assert!(views.iter().all(|v| v.finding.class == Class::Base));
    assert_eq!(t.badge(), 4);
}

#[test]
fn dismissal_lasts_until_the_layers_change() {
    let mut snap = example();
    let mut t = teacher_with_style();
    settle(&mut t, &snap);
    let key = t
        .findings()
        .iter()
        .find(|v| v.finding.rule == "text_size")
        .unwrap()
        .key
        .clone();
    t.dismiss(&key, &snap, 30_000).unwrap();
    assert_eq!(t.badge(), 3);
    // Unrelated edit: stays hidden.
    snap.layers[0].version += 1;
    t.on_change(&[1], false, 31_000);
    for i in 0..100 {
        t.pump(&snap, &GeometricRenderer, 40_000 + i);
    }
    assert_eq!(t.badge(), 3);
    // The caption itself changes: the finding comes back.
    snap.layers[3].version += 1;
    t.on_change(&[4], false, 50_000);
    for i in 0..100 {
        t.pump(&snap, &GeometricRenderer, 60_000 + i);
    }
    assert_eq!(t.badge(), 4);
}

#[test]
fn no_run_during_a_gesture() {
    let snap = example();
    let mut t = teacher_with_style();
    t.gesture_start();
    for i in 0..50 {
        assert!(t.pump(&snap, &GeometricRenderer, i * 1000).is_none());
    }
    t.gesture_end(100_000);
    assert!(
        t.pump(&snap, &GeometricRenderer, 100_100).is_none(),
        "idle window not over"
    );
    assert!(settle_from(&mut t, &snap, 100_500));
}
fn settle_from(t: &mut Teacher, snap: &Snapshot, from: u64) -> bool {
    (0..100).any(|i| t.pump(snap, &GeometricRenderer, from + i).is_some())
}

#[test]
fn critique_request_has_no_layer_ids_or_content() {
    let snap = example();
    let mut t = teacher_with_style();
    settle(&mut t, &snap);
    let body = serde_json::to_string(&t.critique_request()).unwrap();
    assert!(body.contains("\"style_name\":\"Bauhaus\""));
    assert!(body.contains("contrast"));
    assert!(
        !body.contains("Hello"),
        "document text must not leave the device"
    );
    assert!(!body.contains("layers"));
}

#[test]
fn tampered_style_is_rejected() {
    let good = bauhaus_json();
    assert!(validate_and_compile(&good).is_ok());
    assert!(
        validate_and_compile(&good.replace("\"version\":3", "\"version\":4")).is_err(),
        "hash mismatch"
    );
    assert!(validate_and_compile(&good.replace("CC-BY-4.0", "All-Rights-Reserved")).is_err());
    assert!(
        validate_and_compile(&good.replace("0.12", "0.9")).is_err(),
        "override outside range"
    );
}

#[test]
fn learning_events_carry_no_content() {
    let snap = example();
    let mut t = teacher_with_style();
    settle(&mut t, &snap);
    let key = t
        .findings()
        .iter()
        .find(|v| v.finding.rule == "text_size")
        .unwrap()
        .key
        .clone();
    t.apply(&key, 70_000).unwrap();
    t.note_undo(&key, 90_000);
    let ev = t.take_events();
    assert_eq!(ev.len(), 2);
    let json = serde_json::to_string(&ev).unwrap();
    assert!(json.contains("\"outcome\":\"applied\"") && json.contains("\"outcome\":\"undone\""));
    assert!(!json.contains("layer") && !json.contains("Hello"));
    let stats = t.export_stats();
    assert_eq!(stats[0].applied, 1);
    assert_eq!(stats[0].undone_within_60s, 1);
}
