//! The host menu uses the same catalogue, modal gates and dispatch as native menu clicks.
use photocraft_ui_egui::{
    PhotocraftApp,
    control::{self, ControlRequest, Outcome},
};
use serde_json::{Value, json};

pub fn dispatch(app: &mut PhotocraftApp, ctx: &egui::Context, command: Option<&str>) -> Value {
    let (method, params) = match command {
        Some(id) => {
            let available = photocraft_ui_egui::menus::menu_items(app).iter().any(|item| item.id == id && item.enabled);
            if !available {
                return json!({"ok": false, "error": "This menu command is unavailable"});
            }
            ("ui.menu.invoke", json!({"command": id, "wait": false}))
        }
        None => ("ui.menu.list", json!({})),
    };
    let (request, _reply) = ControlRequest::new(method, params);
    let mut response = match control::handle(app, ctx, &request) {
        Outcome::Done(value) => value,
        _ => json!({"ok": false, "error": "Menu command did not return immediately"}),
    };
    response["workspace"] = json!(app.ui.workspace);
    response["light"] = json!(app.ui.theme.is_light());
    ctx.request_repaint();
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app() -> PhotocraftApp {
        PhotocraftApp::new(photocraft_engine::Session::new(), Default::default())
    }

    #[test]
    fn host_uses_live_catalogue_and_rejects_disabled_or_unknown_commands() {
        let mut app = app();
        let ctx = egui::Context::default();
        let listed = dispatch(&mut app, &ctx, None);
        let items = listed["result"].as_array().expect("menu catalogue");
        assert!(items.iter().any(|item| item["id"] == "file.new" && item["enabled"] == true));
        assert!(items.iter().any(|item| item["id"] == "window.theme.toggle" && item["enabled"] == true));
        assert_eq!(dispatch(&mut app, &ctx, Some("edit.undo"))["ok"], false);
        assert_eq!(dispatch(&mut app, &ctx, Some("app.quit"))["ok"], false);
    }

    #[test]
    fn host_dispatches_workspace_and_palette_through_native_ui() {
        let mut app = app();
        let ctx = egui::Context::default();
        assert_eq!(dispatch(&mut app, &ctx, Some("window.workspace.graphicAndWeb"))["workspace"], "Graphic and Web");
        assert_eq!(app.ui.workspace, "Graphic and Web");
        assert_eq!(dispatch(&mut app, &ctx, Some("window.theme.toggle"))["ok"], true);
        assert_eq!(dispatch(&mut app, &ctx, Some("edit.search"))["ok"], true);
        // A modal still gates commands even if they were enabled when the menu opened.
        app.ui.open_dialog(photocraft_ui_egui::state::DialogKind::About, Default::default());
        assert_eq!(dispatch(&mut app, &ctx, Some("window.workspace.painting"))["ok"], false);
    }
}
