//! The Zenopher hosted profile: corporate and creative modes share the same full
//! PhotoCraft engine and toolbar.
//!
//! This module is shared by the browser shell (`web.rs`, wasm32 only) and host tests, so full
//! parity is verified by every `cargo test` run: the corporate allow-list must always equal
//! [`Tool::ALL`], hiding nothing. The document bridge (`bridge.rs`) intentionally has no mode
//! branching — both Zenopher modes open, edit, and sync documents through identical engine logic.

use photocraft_ui_egui::dock::{self, Group};
use photocraft_ui_egui::state::ColorPanelMode;
use photocraft_ui_egui::{PhotocraftApp, Tool};

/// Room for the native HSB controls and a usable wheel above Layers.
const COLOR_PANEL_HEIGHT: f32 = 360.0;

/// Apply hosted editing defaults once at startup. The native controls can still change
/// the picker, resize/collapse the panels, and hide Move's transform handles afterwards.
pub fn configure_editing_defaults(app: &mut PhotocraftApp, mode: Option<&str>) {
    if matches!(mode, Some("creative" | "corporate")) {
        app.ui.tool_options.move_show_transform = true;
        app.ui.tool_options.move_auto_select = true;
        // Pen draws selectable shape layers by default: a Path-mode pen leaves a
        // work path with no layer, which reads as "not selectable". Shape mode
        // commits every pen stroke as a real layer with transform handles.
        app.ui.tool_options.vector_mode = "shape".into();
        app.ui.color_panel.mode = ColorPanelMode::ColorWheel;
        app.ui.dock_tabs.color = Group::Color.tabs(app.ui.theme.is_pro()).iter().position(|name| *name == "Color").unwrap_or(0);
        app.ui.dock_tabs.layers = 0;
        app.ui.panels.dock = true;
        let mut order = app.ui.dock.order();
        order.retain(|group| !matches!(group, Group::Color | Group::Layers));
        order.splice(0..0, [Group::Color, Group::Layers]);
        app.ui.dock.order = order;
        app.ui.dock.heights.insert(Group::Color, COLOR_PANEL_HEIGHT);
        dock::reveal(app, Group::Color);
        dock::reveal(app, Group::Layers);

        // A remembered custom layout is authoritative over the flat dock defaults.
        // Move only these two panels through native docking; retain the other panels.
        if app.ui.docking.is_some() {
            let commands = [
                ("window.panel.activate", serde_json::json!({"panel": "layers"})),
                ("window.panel.activate", serde_json::json!({"panel": "color"})),
                ("window.panel.dock", serde_json::json!({"panel": "layers"})),
            ];
            for (id, params) in commands {
                if let Err(error) = app.run(id, params) {
                    log::warn!("Zenopher colour panel default: {error}");
                    break;
                }
            }
            if let Some(layout) = app.ui.docking.as_ref().map(|workspace| &workspace.layout) {
                let anchor = layout
                    .panels()
                    .into_iter()
                    .find(|id| id.as_str() != "canvas" && id.as_str() != "color" && layout.location(id).is_ok_and(|place| place.floating.is_none()))
                    .cloned();
                if let Some(anchor) = anchor
                    && let Err(error) = app.run(
                        "window.panel.move",
                        serde_json::json!({
                            "panel": "color", "anchor": anchor,
                            "placement": {"Group": {"below": false, "height": COLOR_PANEL_HEIGHT}}
                        }),
                    )
                {
                    log::warn!("Zenopher colour panel placement: {error}");
                }
            }
        }
    }
}

/// Tools visible in Zenopher corporate mode. Corporate now keeps the full PhotoCraft
/// surface so resize handles, Type, Crop and every other tool behave exactly like
/// Creative mode and standalone PhotoCraft.
pub const CORPORATE_ALLOWED_TOOLS: [Tool; 68] = Tool::ALL;

/// Selects the hosted profile from the host's `zenopherMode` query value. Only the exact
/// value `"corporate"` selects the corporate profile; anything else (including a missing
/// value) keeps the creative profile. Both profiles now share the full PhotoCraft
/// tool surface.
pub fn is_corporate_mode(mode: Option<&str>) -> bool {
    mode == Some("corporate")
}

/// Names of every [`Tool::ALL`] entry not in [`CORPORATE_ALLOWED_TOOLS`], for the
/// `edit.toolbar` `hidden` parameter (parsed back with [`Tool::from_name`]).
pub fn corporate_hidden_tools() -> Vec<String> {
    Tool::ALL.iter().copied().filter(|tool| !CORPORATE_ALLOWED_TOOLS.contains(tool)).map(|tool| format!("{tool:?}")).collect()
}

/// Change the hosted tool surface in the current session, without reopening the document.
/// Corporate keeps the full PhotoCraft surface: nothing is hidden, the rail stays
/// visible, and the double-column toolbar preference is left alone so resize
/// handles, Type, Crop and every other tool behave exactly like Creative mode.
pub fn apply_tool_profile(app: &mut PhotocraftApp, _corporate: bool) -> Result<(), String> {
    app.run("edit.toolbar", serde_json::json!({"hidden": Vec::<String>::new()}))?;
    app.ui.panels.rail = true;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn switching_profiles_repeatedly_keeps_the_document_layers_selection_and_history() {
        let mut app = PhotocraftApp::new(photocraft_engine::Session::new(), Default::default());
        app.run("file.new", serde_json::json!({"width": 200, "height": 150, "background": "transparent"})).unwrap();
        app.run("shape.create", serde_json::json!({"kind": "rect", "rect": [10, 20, 60, 40], "fill": "#ff0000"})).unwrap();
        let before = app.session.active().unwrap().clone();
        let dock = serde_json::to_value(&app.ui.dock).unwrap();
        for corporate in [true, false, true, false] {
            apply_tool_profile(&mut app, corporate).unwrap();
            let after = app.session.active().unwrap();
            assert_eq!(after.doc, before.doc, "a mode switch must not add or repaint a layer");
            assert_eq!(after.revision, before.revision);
            assert_eq!(after.active_layer, before.active_layer);
            assert_eq!(after.history.past_len(), before.history.past_len());
            assert_eq!(serde_json::to_value(&app.ui.dock).unwrap(), dock);
            assert!(app.ui.panels.rail, "both modes keep the full PhotoCraft rail");
        }
    }

    #[test]
    fn both_zenopher_modes_enable_resize_handles_without_editing_the_document() {
        for mode in ["creative", "corporate"] {
            let mut app = PhotocraftApp::new(photocraft_engine::Session::new(), Default::default());
            app.session.execute("file.new", serde_json::json!({"width": 200, "height": 200})).unwrap();
            app.session.execute("shape.create", serde_json::json!({"kind": "rect", "rect": [20, 30, 80, 60], "fill": "#ff0000"})).unwrap();
            let before = app.session.active().unwrap().clone();
            let mut expected = serde_json::to_value(&app.ui.tool_options).unwrap();
            expected["move_show_transform"] = true.into();
            expected["move_auto_select"] = true.into();
            expected["vector_mode"] = "shape".into();

            configure_editing_defaults(&mut app, Some(mode));

            assert_eq!(serde_json::to_value(&app.ui.tool_options).unwrap(), expected);
            let after = app.session.active().unwrap();
            assert_eq!(after.doc, before.doc);
            assert_eq!(after.revision, before.revision);
            assert_eq!(after.active_layer, before.active_layer);
            assert_eq!(after.history.past_len(), before.history.past_len());
        }
    }

    #[test]
    fn standalone_and_unknown_profiles_preserve_tool_preferences() {
        for mode in [None, Some(""), Some("other")] {
            for enabled in [false, true] {
                let mut app = PhotocraftApp::new(photocraft_engine::Session::new(), Default::default());
                app.ui.tool_options.move_show_transform = enabled;
                app.ui.tool_options.move_auto_select = enabled;
                app.ui.tool_options.vector_mode = if enabled { "shape".into() } else { "path".into() };
                let before = serde_json::to_value(&app.ui).unwrap();
                configure_editing_defaults(&mut app, mode);
                assert_eq!(serde_json::to_value(&app.ui).unwrap(), before);
            }
        }
    }

    #[test]
    fn hosted_modes_open_a_large_native_wheel_above_layers() {
        for mode in ["creative", "corporate"] {
            let mut app = PhotocraftApp::new(photocraft_engine::Session::new(), Default::default());
            app.ui.panels.color = false;
            app.ui.panels.layers = false;
            app.ui.panels.dock = false;
            app.ui.dock.hide_tab(Group::Color, 1, false);
            app.ui.dock.set_collapsed(Group::Color, true);

            configure_editing_defaults(&mut app, Some(mode));

            assert_eq!(app.ui.color_panel.mode, ColorPanelMode::ColorWheel);
            assert!(app.ui.panels.dock && app.ui.panels.color && app.ui.panels.layers);
            assert_eq!(&app.ui.dock.order()[..2], &[Group::Color, Group::Layers]);
            assert_eq!(Group::Color.tabs(app.ui.theme.is_pro())[app.ui.dock_tabs.color], "Color");
            assert!(!app.ui.dock.is_collapsed(Group::Color));
            assert_eq!(app.ui.dock.height(Group::Color), COLOR_PANEL_HEIGHT);
            assert!(app.ui.dock.visible_tabs(Group::Color, app.ui.theme.is_pro()).iter().any(|(_, name)| *name == "Color"));
        }
    }

    #[test]
    fn remembered_custom_dock_keeps_other_panels_and_gives_color_its_own_group() {
        let mut app = PhotocraftApp::new(photocraft_engine::Session::new(), Default::default());
        app.run("window.panel.move", serde_json::json!({"panel": "navigator", "anchor": "layers"})).unwrap();
        app.run("window.panel.close", serde_json::json!({"panel": "color"})).unwrap();
        let before = app.ui.docking.as_ref().unwrap().layout.panels().into_iter().cloned().collect::<Vec<_>>();

        configure_editing_defaults(&mut app, Some("corporate"));

        let layout = &app.ui.docking.as_ref().unwrap().layout;
        assert!(before.iter().all(|panel| layout.contains(panel)));
        let saved = serde_json::to_value(layout).unwrap();
        let groups = &saved["root"]["Split"]["second"]["Dock"]["columns"][0]["groups"];
        assert_eq!(groups[0]["panels"], serde_json::json!(["color"]), "{saved}");
        assert_eq!(groups[0]["height"], COLOR_PANEL_HEIGHT);
        assert!(groups.as_array().unwrap().iter().skip(1).any(|group| group["panels"].as_array().unwrap().iter().any(|id| id == "layers")), "{saved}");
    }

    #[test]
    fn corporate_toolbar_matches_the_full_surface() {
        let all: HashSet<Tool> = Tool::ALL.into_iter().collect();
        let allowed: HashSet<Tool> = CORPORATE_ALLOWED_TOOLS.into_iter().collect();

        // No duplicates in the allow-list: every entry must be unique.
        assert_eq!(allowed.len(), CORPORATE_ALLOWED_TOOLS.len(), "corporate allow-list has duplicates");
        // Full parity: corporate keeps PhotoCraft's complete toolset.
        assert_eq!(allowed, all, "corporate must keep the full PhotoCraft surface");

        let hidden = corporate_hidden_tools();
        assert!(hidden.is_empty(), "full parity hides no tools, got {hidden:?}");
    }

    #[test]
    fn only_the_exact_corporate_value_narrows_the_surface() {
        assert!(is_corporate_mode(Some("corporate")));
        for mode in [None, Some("creative"), Some("CORPORATE"), Some(" corporate"), Some("")] {
            assert!(!is_corporate_mode(mode), "mode {mode:?} must keep the full creative surface");
        }
    }
}
