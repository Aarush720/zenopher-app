//! The document snapshot the engine hands to the teacher.
use crate::color::Color;
use crate::style::CompiledStyle;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

pub type LayerId = u32;

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl Rect {
    pub fn new(x: f32, y: f32, w: f32, h: f32) -> Self {
        Rect { x, y, w, h }
    }
    pub fn right(&self) -> f32 {
        self.x + self.w
    }
    pub fn bottom(&self) -> f32 {
        self.y + self.h
    }
    pub fn cx(&self) -> f32 {
        self.x + self.w / 2.0
    }
    pub fn cy(&self) -> f32 {
        self.y + self.h / 2.0
    }
    pub fn area(&self) -> f32 {
        self.w.max(0.0) * self.h.max(0.0)
    }
    pub fn intersection_area(&self, o: &Rect) -> f32 {
        let w = (self.right().min(o.right()) - self.x.max(o.x)).max(0.0);
        let h = (self.bottom().min(o.bottom()) - self.y.max(o.y)).max(0.0);
        w * h
    }
    /// Shortest distance between two rectangles; 0 when they touch or overlap.
    pub fn gap(&self, o: &Rect) -> f32 {
        let dx = (o.x - self.right()).max(self.x - o.right()).max(0.0);
        let dy = (o.y - self.bottom()).max(self.y - o.bottom()).max(0.0);
        dx.hypot(dy)
    }
    pub fn contains_point(&self, px: f32, py: f32) -> bool {
        px >= self.x && px <= self.right() && py >= self.y && py <= self.bottom()
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Level {
    #[default]
    Creative,
    CorporateBase,
    CorporateFull,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Intent {
    #[default]
    Screen,
    Print,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ColorMode {
    #[default]
    Rgb,
    Cmyk,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LayerKind {
    Text,
    Shape,
    Image,
    Group,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ShapeKind {
    Rect,
    Ellipse,
    Line,
    Polygon,
    Path,
}

impl ShapeKind {
    pub fn is_geometric(self) -> bool {
        !matches!(self, ShapeKind::Path)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Page {
    pub width_px: f32,
    pub height_px: f32,
    pub background: Color,
    /// Document pixels per physical inch. Needed for print checks.
    #[serde(default)]
    pub ppi: Option<f32>,
    #[serde(default)]
    pub bleed_mm: Option<f32>,
    #[serde(default)]
    pub color_mode: ColorMode,
}

impl Page {
    pub fn short_side(&self) -> f32 {
        self.width_px.min(self.height_px)
    }
    pub fn area(&self) -> f32 {
        self.width_px * self.height_px
    }
    pub fn rect(&self) -> Rect {
        Rect::new(0.0, 0.0, self.width_px, self.height_px)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TextInfo {
    pub content: String,
    #[serde(default)]
    pub font_family: String,
    pub size_px: f32,
    /// Line height as a multiple of font size.
    #[serde(default = "default_leading")]
    pub leading: f32,
    #[serde(default)]
    pub tracking: f32,
    #[serde(default)]
    pub bold: bool,
    pub color: Color,
    /// Number of laid-out lines. Leading only matters when this is above 1.
    #[serde(default = "one_u32")]
    pub lines: u32,
}
fn default_leading() -> f32 {
    1.2
}
fn one_u32() -> u32 {
    1
}
fn one() -> f32 {
    1.0
}
fn yes() -> bool {
    true
}

/// Source size 0 means unknown.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ImageInfo {
    #[serde(default)]
    pub source_w: u32,
    #[serde(default)]
    pub source_h: u32,
    pub displayed_w: f32,
    pub displayed_h: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Layer {
    pub id: LayerId,
    pub kind: LayerKind,
    pub bounds: Rect,
    #[serde(default = "yes")]
    pub visible: bool,
    #[serde(default = "one")]
    pub opacity: f32,
    /// Bumped by the document core whenever the layer changes. Drives caching and dismissals.
    #[serde(default)]
    pub version: u64,
    #[serde(default)]
    pub parent: Option<LayerId>,
    #[serde(default)]
    pub text: Option<TextInfo>,
    #[serde(default)]
    pub fill: Option<Color>,
    #[serde(default)]
    pub shape: Option<ShapeKind>,
    #[serde(default)]
    pub image: Option<ImageInfo>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Snapshot {
    pub page: Page,
    /// In stacking order, bottom first.
    pub layers: Vec<Layer>,
    /// The teacher fills these two from its own state before running.
    #[serde(skip)]
    pub style: Option<Arc<CompiledStyle>>,
    #[serde(default)]
    pub mode: Level,
    #[serde(default)]
    pub intent: Intent,
}

impl Snapshot {
    pub fn layer(&self, id: LayerId) -> Option<&Layer> {
        self.layers.iter().find(|l| l.id == id)
    }
    pub fn index_of(&self, id: LayerId) -> Option<usize> {
        self.layers.iter().position(|l| l.id == id)
    }

    /// Visible, non-group layers whose ancestors are all visible. Groups are measured through their children.
    pub fn objects(&self) -> Vec<&Layer> {
        let by_id: HashMap<LayerId, &Layer> = self.layers.iter().map(|l| (l.id, l)).collect();
        self.layers
            .iter()
            .filter(|l| l.kind != LayerKind::Group && l.visible && l.opacity > 0.0)
            .filter(|l| {
                let mut p = l.parent;
                for _ in 0..32 {
                    match p.and_then(|id| by_id.get(&id)) {
                        Some(g) if !g.visible || g.opacity <= 0.0 => return false,
                        Some(g) => p = g.parent,
                        None => return true,
                    }
                }
                false // A cycle or excessive nesting is not a visible, measurable object.
            })
            .collect()
    }

    /// A shape that covers most of the page acts as a background, not as a design object.
    pub fn is_background(&self, l: &Layer) -> bool {
        l.kind == LayerKind::Shape
            && l.bounds.intersection_area(&self.page.rect()) >= 0.9 * self.page.area()
    }

    pub fn layer_versions(&self) -> HashMap<LayerId, u64> {
        self.layers.iter().map(|l| (l.id, l.version)).collect()
    }
}
