//! Small, same-origin document bridge between the Zenopher host and PhotoCraft.
//!
//! The bridge deliberately speaks JSON for control messages and uses a structured-cloned
//! `Uint8Array` for native `.pcraft` exports. JavaScript callbacks only enqueue work; document
//! mutations happen on PhotoCraft's egui frame thread.

use std::cell::RefCell;
use std::f64::consts::PI;
use std::rc::Rc;

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use js_sys::{JSON, Object, Reflect, Uint8Array};
use serde_json::{Value, json};
use wasm_bindgen::{JsCast as _, JsValue, closure::Closure};
use web_sys::MessageEvent;

use photocraft_codecs::{ChannelLayout, EncodeOptions, Format, Image};
use photocraft_doc::text::{TextAlign, TextShape};
use photocraft_doc::vector::LiveShape;
use photocraft_doc::{Document, Fill, Layer, LayerContent};
use photocraft_ui_egui::PhotocraftApp;

const ZENOPHER_SOURCE: &str = "zenopher";
const PHOTOCRAFT_SOURCE: &str = "photocraft";
const PROTOCOL_VERSION: u64 = 1;

#[derive(Debug)]
pub enum Request {
    Open { request_id: String, design: Value },
    Save { request_id: String },
    Sync { request_id: String },
}

#[derive(Clone)]
pub struct Bridge {
    queue: Rc<RefCell<Vec<Request>>>,
    origin: Rc<String>,
    current_design: Rc<RefCell<Option<Value>>>,
    // The listener must stay alive for the lifetime of the web app.
    listener: Rc<Closure<dyn FnMut(MessageEvent)>>,
}

impl Bridge {
    pub fn install() -> Self {
        let queue = Rc::new(RefCell::new(Vec::new()));
        let origin = Rc::new(parent_origin());
        let queue_for_listener = queue.clone();
        let expected_origin = origin.clone();
        let listener = Closure::<dyn FnMut(MessageEvent)>::new(move |event: MessageEvent| {
            if event.origin() != expected_origin.as_str() {
                return;
            }
            let Some(message) = message_value(&event) else { return };
            if message.get("source").and_then(Value::as_str) != Some(ZENOPHER_SOURCE) {
                return;
            }
            let Some(request_id) = message.get("requestId").and_then(Value::as_str).map(str::to_owned) else {
                return;
            };
            let Some(kind) = message.get("type").and_then(Value::as_str) else { return };
            let request = match kind {
                "zenopher:open-design" => message.get("design").cloned().map(|design| Request::Open { request_id, design }),
                "zenopher:save" => Some(Request::Save { request_id }),
                "zenopher:sync" => Some(Request::Sync { request_id }),
                _ => None,
            };
            if let Some(request) = request {
                queue_for_listener.borrow_mut().push(request);
            }
        });

        if let Some(window) = web_sys::window() {
            let _ = window.add_event_listener_with_callback("message", listener.as_ref().unchecked_ref());
        }

        Self { queue, origin, current_design: Rc::default(), listener: Rc::new(listener) }
    }

    pub fn take(&self) -> Vec<Request> {
        std::mem::take(&mut *self.queue.borrow_mut())
    }

    pub fn send_ready(&self) {
        self.post_json(json!({
            "source": PHOTOCRAFT_SOURCE,
            "type": "photocraft:ready",
            "protocol": PROTOCOL_VERSION,
        }));
    }

    pub fn send_opened(&self, request_id: &str, design_id: Option<&str>, imported: usize, warnings: &[String]) {
        self.post_json(json!({
            "source": PHOTOCRAFT_SOURCE,
            "type": "photocraft:opened",
            "protocol": PROTOCOL_VERSION,
            "requestId": request_id,
            "designId": design_id,
            "importedLayers": imported,
            "warnings": warnings,
        }));
    }

    pub fn send_error(&self, request_id: &str, message: &str) {
        self.post_json(json!({
            "source": PHOTOCRAFT_SOURCE,
            "type": "photocraft:error",
            "protocol": PROTOCOL_VERSION,
            "requestId": request_id,
            "message": message,
        }));
    }

    pub fn send_saved(&self, request_id: &str, name: &str, bytes: &[u8], design: Option<&Value>, warnings: &[String]) {
        let object = Object::new();
        let fields = [
            ("source", JsValue::from_str(PHOTOCRAFT_SOURCE)),
            ("type", JsValue::from_str("photocraft:saved")),
            ("protocol", JsValue::from_f64(PROTOCOL_VERSION as f64)),
            ("requestId", JsValue::from_str(request_id)),
            ("name", JsValue::from_str(name)),
        ];
        for (key, value) in fields {
            if Reflect::set(&object, &JsValue::from_str(key), &value).is_err() {
                return;
            }
        }
        let warnings_json = match JSON::parse(&serde_json::to_string(warnings).unwrap_or_else(|_| "[]".into())) {
            Ok(value) => value,
            Err(_) => JsValue::from(js_sys::Array::new()),
        };
        let bytes = Uint8Array::from(bytes);
        let _ = Reflect::set(&object, &JsValue::from_str("bytes"), &bytes);
        if let Some(design) = design
            && let Ok(design_json) = JSON::parse(&design.to_string())
        {
            let _ = Reflect::set(&object, &JsValue::from_str("design"), &design_json);
        }
        let _ = Reflect::set(&object, &JsValue::from_str("warnings"), &warnings_json);
        self.post_js(object.into());
    }

    pub fn send_changed(&self, request_id: &str, design: &Value, warnings: &[String]) {
        self.post_json(json!({
            "source": PHOTOCRAFT_SOURCE,
            "type": "photocraft:changed",
            "protocol": PROTOCOL_VERSION,
            "requestId": request_id,
            "design": design,
            "warnings": warnings,
        }));
    }

    /// Zenopher learning signal: the teacher counts an undo only within 60 s of a fix.
    /// This is not a content change by itself — the changed design arrives via send_changed.
    pub fn send_undo(&self) {
        self.post_json(json!({
            "source": PHOTOCRAFT_SOURCE,
            "type": "photocraft:undo",
            "protocol": PROTOCOL_VERSION,
        }));
    }

    /// Gesture suppression: drags and typing should not pump the teacher mid-gesture.
    pub fn send_gesture(&self, start: bool) {
        self.post_json(json!({
            "source": PHOTOCRAFT_SOURCE,
            "type": if start { "photocraft:gesture-start" } else { "photocraft:gesture-end" },
            "protocol": PROTOCOL_VERSION,
        }));
    }

    fn post_json(&self, value: Value) {
        let Ok(value) = JSON::parse(&value.to_string()) else { return };
        self.post_js(value);
    }

    fn post_js(&self, value: JsValue) {
        let Some(window) = web_sys::window() else { return };
        let target = if self.origin.is_empty() { "*" } else { self.origin.as_str() };
        if let Ok(Some(parent)) = window.parent() {
            let _ = parent.post_message(&value, target);
        }
    }
}

impl Drop for Bridge {
    fn drop(&mut self) {
        // `listener` is intentionally kept in the struct. This explicit read documents why the
        // field exists and prevents future refactors from accidentally removing the lifetime pin.
        let _ = Rc::strong_count(&self.listener);
    }
}

/// Applies one queued request on PhotoCraft's UI thread.
pub fn process(app: &mut PhotocraftApp, bridge: &Bridge, request: Request) {
    match request {
        Request::Open { request_id, design } => match open_design(app, &design) {
            Ok((design_id, imported, warnings)) => {
                *bridge.current_design.borrow_mut() = Some(design.clone());
                bridge.send_opened(&request_id, design_id.as_deref(), imported, &warnings);
            }
            Err(error) => bridge.send_error(&request_id, &error),
        },
        Request::Save { request_id } => {
            let Some(document) = app.session.active().map(|state| state.doc.clone()) else {
                bridge.send_error(&request_id, "PhotoCraft has no active document");
                return;
            };
            match photocraft_io::export(&document, "zenopher.pcraft", &Default::default()) {
                Ok(result) => {
                    let mut warnings = result.warnings;
                    let synced_design = bridge.current_design.borrow().as_ref().map(|base| native_design(&document, base.clone(), &mut warnings));
                    if let Some(design) = &synced_design {
                        *bridge.current_design.borrow_mut() = Some(design.clone());
                    }
                    bridge.send_saved(&request_id, "zenopher.pcraft", &result.bytes, synced_design.as_ref(), &warnings);
                }
                Err(error) => bridge.send_error(&request_id, &error.to_string()),
            }
        }
        Request::Sync { request_id } => {
            let Some(document) = app.session.active().map(|state| state.doc.clone()) else {
                return;
            };
            let Some(base) = bridge.current_design.borrow().clone() else {
                return;
            };
            let mut warnings = Vec::new();
            let synced_design = native_design(&document, base, &mut warnings);
            let changed = bridge.current_design.borrow().as_ref().is_none_or(|current| !same_design_content(current, &synced_design));
            if changed {
                *bridge.current_design.borrow_mut() = Some(synced_design.clone());
                bridge.send_changed(&request_id, &synced_design, &warnings);
            }
        }
    }
}

/// `updatedAt` is intentionally refreshed when a document is read back from PhotoCraft, but it
/// must not make every host sync look like a user edit. Comparing the remaining fields keeps
/// autosave quiet when the document is idle.
fn same_design_content(left: &Value, right: &Value) -> bool {
    let mut left = left.clone();
    let mut right = right.clone();
    if let Some(object) = left.as_object_mut() {
        object.remove("updatedAt");
    }
    if let Some(object) = right.as_object_mut() {
        object.remove("updatedAt");
    }
    left == right
}

fn open_design(app: &mut PhotocraftApp, design: &Value) -> Result<(Option<String>, usize, Vec<String>), String> {
    let width = number(design, "width").unwrap_or(1920.0).round().clamp(1.0, 300_000.0);
    let height = number(design, "height").unwrap_or(1080.0).round().clamp(1.0, 300_000.0);
    let title = design.get("title").and_then(Value::as_str).unwrap_or("Zenopher Design");
    let background = design.get("background").and_then(Value::as_str).unwrap_or("transparent");
    let new_document = json!({
        "width": width,
        "height": height,
        "name": title,
        "background": if is_color(background) { Value::String(background.to_owned()) } else { Value::String("transparent".into()) },
    });
    app.run("file.new", new_document)?;

    let mut warnings = Vec::new();
    let mut imported = 0;
    if let Some(layers) = design.get("layers").and_then(Value::as_array) {
        for layer in layers {
            match import_layer(app, layer) {
                Ok(()) => imported += 1,
                Err(error) => warnings.push(error),
            }
        }
    }
    let design_id = design.get("id").and_then(Value::as_str).map(str::to_owned);
    Ok((design_id, imported, warnings))
}

fn import_layer(app: &mut PhotocraftApp, layer: &Value) -> Result<(), String> {
    let kind = layer.get("type").and_then(Value::as_str).unwrap_or("rect");
    let x = number(layer, "x").unwrap_or(0.0);
    let y = number(layer, "y").unwrap_or(0.0);
    let width = number(layer, "width").unwrap_or(1.0).max(1.0);
    let height = number(layer, "height").unwrap_or(1.0).max(1.0);
    let name = layer.get("name").and_then(Value::as_str).unwrap_or("Zenopher Layer");
    let fill = layer.get("fill").and_then(Value::as_str).filter(|value| is_color(value)).map_or(Value::Null, |value| Value::String(value.to_owned()));
    let result = if kind == "text" {
        let text = layer.get("text").and_then(Value::as_str).unwrap_or("");
        let mut params = json!({
            "name": name,
            "text": text,
            "size": number(layer, "fontSize").unwrap_or(12.0).clamp(0.1, 1296.0),
            "color": fill,
            "align": layer.get("textAlign").and_then(Value::as_str).unwrap_or("left"),
            "x": x,
            "y": y + number(layer, "fontSize").unwrap_or(12.0),
        });
        if width > 0.0 && height > 0.0 {
            params["box"] = json!([x, y, width, height]);
            params.as_object_mut().map(|object| object.remove("x"));
            params.as_object_mut().map(|object| object.remove("y"));
        }
        app.run("type.create", params)
    } else {
        let shape_kind = match kind {
            "circle" => "ellipse",
            "triangle" => "polygon",
            "star" => "star",
            _ => "rect",
        };
        let mut params = json!({
            "name": name,
            "kind": shape_kind,
            "rect": [x, y, width, height],
            "fill": if kind == "frame" { Value::Null } else { fill },
        });
        if kind == "triangle" {
            params["sides"] = json!(3);
        }
        if kind == "star" {
            params["sides"] = json!(5);
            params["starRatio"] = json!(0.5);
        }
        if let Some(stroke) = layer.get("stroke").and_then(Value::as_str).filter(|value| is_color(value)) {
            params["stroke"] = json!({
                "width": number(layer, "strokeWidth").unwrap_or(1.0).max(0.1),
                "color": stroke,
            });
        }
        app.run("shape.create", params)
    }?;

    let id = result.get("layer").and_then(Value::as_u64).ok_or("PhotoCraft did not return a layer id")?;
    let props = json!({
        "layer": id,
        "visible": layer.get("visible").and_then(Value::as_bool).unwrap_or(true),
        "locked": layer.get("locked").and_then(Value::as_bool).unwrap_or(false),
        "opacity": number(layer, "opacity").unwrap_or(1.0).clamp(0.0, 1.0),
    });
    app.run("layer.setProps", props)?;
    let rotation = number(layer, "rotation").unwrap_or(0.0);
    if rotation.abs() > 0.001 {
        let transform = rotation_matrix(rotation, x + width / 2.0, y + height / 2.0);
        let command = if kind == "text" { "type.edit" } else { "shape.edit" };
        app.run(command, json!({ "layer": id, "transform": transform }))?;
    }
    Ok(())
}

fn native_design(document: &Document, mut base: Value, warnings: &mut Vec<String>) -> Value {
    let mut layers = Vec::new();
    append_native_layers(&document.layers, &mut layers, warnings);
    if let Some(object) = base.as_object_mut() {
        object.insert("width".into(), json!(document.size.width));
        object.insert("height".into(), json!(document.size.height));
        object.insert("layers".into(), Value::Array(layers));
        object.insert("updatedAt".into(), json!(js_now()));
    }
    base
}

fn append_native_layers(native_layers: &[Layer], output: &mut Vec<Value>, warnings: &mut Vec<String>) {
    for layer in native_layers {
        if let LayerContent::Group(group) = &layer.content {
            append_native_layers(&group.children, output, warnings);
            continue;
        }
        match native_layer(layer, warnings) {
            Ok(Some(layer)) => output.push(layer),
            Ok(None) => {}
            Err(error) => warnings.push(error),
        }
    }
}

fn native_layer(layer: &Layer, warnings: &mut Vec<String>) -> Result<Option<Value>, String> {
    let id = format!("photocraft-{}", layer.id.0);
    let visible = layer.visible;
    let locked = layer.locks.any();
    let opacity = f64::from(layer.opacity.clamp(0.0, 1.0));

    match &layer.content {
        LayerContent::Text(text) => {
            let bounds = text
                .cache
                .as_ref()
                .map(|surface| surface.content_bounds())
                .filter(|bounds| !bounds.is_empty())
                .or_else(|| match &text.shape {
                    TextShape::Box { x, y, width, height } => {
                        Some(photocraft_geom::Rect::new(*x as i32, *y as i32, (*x + *width) as i32, (*y + *height) as i32))
                    }
                    _ => None,
                })
                .unwrap_or(photocraft_geom::Rect::new(
                    text.transform.m[4] as i32,
                    text.transform.m[5] as i32,
                    text.transform.m[4] as i32 + 1,
                    text.transform.m[5] as i32 + 1,
                ));
            let align = text.paragraphs.first().map(|run| text_align(run.style.align)).unwrap_or("left");
            Ok(Some(json!({
                "id": id,
                "name": layer.name,
                "type": "text",
                "x": bounds.x0,
                "y": bounds.y0,
                "width": bounds.width(),
                "height": bounds.height(),
                "rotation": rotation_degrees(text.transform.m),
                "visible": visible,
                "locked": locked,
                "opacity": opacity,
                "fill": color_hex(&text.color),
                "text": text.text,
                "fontSize": text.size_pt,
                "fontFamily": text.font_family,
                "textAlign": align,
            })))
        }
        LayerContent::Shape(shape) => {
            let bounds =
                shape.cache.as_ref().map(|surface| surface.content_bounds()).filter(|bounds| !bounds.is_empty()).unwrap_or(photocraft_geom::Rect::EMPTY);
            if bounds.is_empty() {
                warnings.push(format!("Layer \"{}\" has no rendered shape bounds and was skipped", layer.name));
                return Ok(None);
            }
            let (kind, shape_rect) = shape_kind_and_rect(shape.live.as_ref(), bounds);
            let mut value = json!({
                "id": id,
                "name": layer.name,
                "type": kind,
                "x": shape_rect[0],
                "y": shape_rect[1],
                "width": shape_rect[2],
                "height": shape_rect[3],
                "rotation": 0,
                "visible": visible,
                "locked": locked,
                "opacity": opacity,
                "fill": shape.fill.as_ref().and_then(fill_color),
            });
            if let Some(stroke) = &shape.stroke {
                if let Some(object) = value.as_object_mut() {
                    object.insert("stroke".into(), Value::String(fill_color(&stroke.paint).unwrap_or_else(|| "#000000".into())));
                    object.insert("strokeWidth".into(), json!(stroke.width));
                }
            }
            Ok(Some(value))
        }
        _ => {
            let Some(surface) = layer_surface(layer) else {
                if matches!(layer.content, LayerContent::Adjustment(_)) {
                    warnings.push(format!("Adjustment layer \"{}\" cannot be represented in Zenopher and was skipped", layer.name));
                }
                return Ok(None);
            };
            let Some((image_url, bounds)) = surface_data_url(surface)? else { return Ok(None) };
            Ok(Some(json!({
                "id": id,
                "name": layer.name,
                "type": "image",
                "x": bounds.0,
                "y": bounds.1,
                "width": bounds.2,
                "height": bounds.3,
                "rotation": 0,
                "visible": visible,
                "locked": locked,
                "opacity": opacity,
                "fill": "#ffffff",
                "imageUrl": image_url,
                "assetId": id,
            })))
        }
    }
}

fn layer_surface(layer: &Layer) -> Option<&photocraft_raster::Surface> {
    match &layer.content {
        LayerContent::Raster(surface) => Some(surface),
        LayerContent::Smart(smart) => smart.cache.as_ref(),
        LayerContent::Fill(_) => layer.fill_cache.as_ref().map(|cache| &cache.surface),
        _ => layer.surface(),
    }
}

fn surface_data_url(surface: &photocraft_raster::Surface) -> Result<Option<(String, (i32, i32, u32, u32))>, String> {
    let bounds = surface.content_bounds();
    if bounds.is_empty() {
        return Ok(None);
    }
    let width = bounds.width();
    let height = bounds.height();
    let area = u64::from(width).saturating_mul(u64::from(height));
    if area > 4_000_000 {
        return Err(format!("A PhotoCraft raster layer is too large to sync to Zenopher ({width}×{height})"));
    }
    let channels = surface.channels();
    let samples = surface.read_region(bounds);
    let mut rgba = Vec::with_capacity((area as usize).saturating_mul(4));
    for pixel in samples.chunks(channels) {
        let (r, g, b, a) = match channels {
            1 => (pixel[0], pixel[0], pixel[0], 1.0),
            2 => (pixel[0], pixel[0], pixel[0], pixel[1]),
            _ => (pixel[0], pixel[1], pixel[2], if channels > 3 { pixel[3] } else { 1.0 }),
        };
        rgba.extend_from_slice(&[to_byte(r), to_byte(g), to_byte(b), to_byte(a)]);
    }
    let image = Image::from_u8(width, height, ChannelLayout::Rgba, rgba).map_err(|error| error.to_string())?;
    let bytes = photocraft_codecs::encode(&image, Format::Png, &EncodeOptions::default()).map_err(|error| error.to_string())?;
    Ok(Some((format!("data:image/png;base64,{}", BASE64.encode(bytes)), (bounds.x0, bounds.y0, width, height))))
}

fn shape_kind_and_rect(live: Option<&LiveShape>, bounds: photocraft_geom::Rect) -> (&'static str, [i32; 4]) {
    let rect = [bounds.x0, bounds.y0, bounds.width() as i32, bounds.height() as i32];
    match live {
        Some(LiveShape::Ellipse { .. }) => ("circle", rect),
        Some(LiveShape::Polygon { sides, .. }) if *sides == 3 => ("triangle", rect),
        Some(LiveShape::Polygon { star_ratio, .. }) if *star_ratio < 0.99 => ("star", rect),
        _ => ("rect", rect),
    }
}

fn fill_color(fill: &Fill) -> Option<String> {
    match fill {
        Fill::Solid(color) => Some(color_hex(color)),
        _ => None,
    }
}

fn color_hex(color: &photocraft_color::Color) -> String {
    let [r, g, b, a] = color.to_rgba8();
    if a == 255 { format!("#{r:02x}{g:02x}{b:02x}") } else { format!("#{r:02x}{g:02x}{b:02x}{a:02x}") }
}

fn text_align(align: TextAlign) -> &'static str {
    match align {
        TextAlign::Center => "center",
        TextAlign::Right | TextAlign::JustifyRight => "right",
        _ => "left",
    }
}

fn rotation_degrees(matrix: [f64; 6]) -> f64 {
    matrix[1].atan2(matrix[0]).to_degrees()
}

fn to_byte(value: f32) -> u8 {
    (value.clamp(0.0, 1.0) * 255.0 + 0.5) as u8
}

fn js_now() -> u64 {
    js_sys::Date::now().max(0.0) as u64
}

fn number(value: &Value, key: &str) -> Option<f64> {
    value.get(key).and_then(Value::as_f64).filter(|value| value.is_finite())
}

fn is_color(value: &str) -> bool {
    let hex = value.strip_prefix('#').unwrap_or("");
    matches!(hex.len(), 6 | 8) && hex.chars().all(|c| c.is_ascii_hexdigit())
}

fn rotation_matrix(degrees: f64, center_x: f64, center_y: f64) -> [f64; 6] {
    let radians = degrees * PI / 180.0;
    let (sin, cos) = radians.sin_cos();
    [cos, sin, -sin, cos, center_x - cos * center_x + sin * center_y, center_y - sin * center_x - cos * center_y]
}

fn message_value(event: &MessageEvent) -> Option<Value> {
    let text = JSON::stringify(&event.data()).ok()?.as_string()?;
    serde_json::from_str(&text).ok()
}

fn parent_origin() -> String {
    let window = match web_sys::window() {
        Some(window) => window,
        None => return String::new(),
    };
    let search = window.location().search().unwrap_or_default();
    search
        .trim_start_matches('?')
        .split('&')
        .find_map(|part| part.strip_prefix("zenopherOrigin=").map(|value| value.to_owned()))
        .and_then(|value| js_sys::decode_uri_component(&value).ok().and_then(|value| value.as_string()))
        .or_else(|| window.location().origin().ok())
        .unwrap_or_default()
}
