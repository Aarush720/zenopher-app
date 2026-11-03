//! The Zenopher hosted profile: corporate mode is the same PhotoCraft engine with a
//! smaller, creation-first toolbar.
//!
//! This module is shared by the browser shell (`web.rs`, wasm32 only) and host tests, so the
//! subset property is verified by every `cargo test` run: the corporate allow-list must always
//! be a strict subset of [`Tool::ALL`], and everything not allow-listed is hidden by
//! construction. The document bridge (`bridge.rs`) intentionally has no mode branching — both
//! Zenopher modes open, edit, and sync documents through identical engine logic.

use photocraft_ui_egui::Tool;

/// Tools visible in Zenopher corporate mode. Everything else in [`Tool::ALL`] is hidden.
/// Tools added upstream stay hidden here until they are deliberately allow-listed, so
/// corporate can only ever be a subset of the full creative surface.
pub const CORPORATE_ALLOWED_TOOLS: [Tool; 14] = [
    Tool::Move,
    Tool::Crop,
    Tool::Eyedropper,
    Tool::Brush,
    Tool::Eraser,
    Tool::Gradient,
    Tool::Type,
    Tool::Hand,
    Tool::Zoom,
    Tool::Rectangle,
    Tool::EllipseShape,
    Tool::Triangle,
    Tool::Line,
    Tool::Frame,
];

/// Selects the hosted profile from the host's `zenopherMode` query value. Only the exact
/// value `"corporate"` narrows the surface; anything else (including a missing value)
/// keeps the full creative toolset.
pub fn is_corporate_mode(mode: Option<&str>) -> bool {
    mode == Some("corporate")
}

/// Names of every [`Tool::ALL`] entry not in [`CORPORATE_ALLOWED_TOOLS`], for the
/// `edit.toolbar` `hidden` parameter (parsed back with [`Tool::from_name`]).
pub fn corporate_hidden_tools() -> Vec<String> {
    Tool::ALL
        .iter()
        .copied()
        .filter(|tool| !CORPORATE_ALLOWED_TOOLS.contains(tool))
        .map(|tool| format!("{tool:?}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn corporate_toolbar_is_a_strict_subset_of_the_full_surface() {
        let all: HashSet<Tool> = Tool::ALL.into_iter().collect();
        let allowed: HashSet<Tool> = CORPORATE_ALLOWED_TOOLS.into_iter().collect();

        // No duplicates in the allow-list: every entry must be unique.
        assert_eq!(allowed.len(), CORPORATE_ALLOWED_TOOLS.len(), "corporate allow-list has duplicates");
        // Strict subset: everything allowed exists upstream, and something is hidden.
        assert!(allowed.is_subset(&all), "corporate allow-list names an unknown tool");
        assert!(!allowed.is_empty(), "corporate allow-list must not be empty");
        assert!(allowed.len() < all.len(), "corporate must hide at least one tool");

        let hidden = corporate_hidden_tools();
        assert_eq!(hidden.len(), all.len() - allowed.len(), "hidden list must cover exactly the rest");
        let hidden_tools: HashSet<Tool> = hidden
            .iter()
            .map(|name| Tool::from_name(name).unwrap_or_else(|| panic!("hidden name {name:?} must parse as a tool")))
            .collect();
        assert!(hidden_tools.is_disjoint(&allowed), "a hidden tool must never be allow-listed");
        assert_eq!(hidden_tools.union(&allowed).count(), all.len(), "hidden + allowed must partition the full surface");
    }

    #[test]
    fn only_the_exact_corporate_value_narrows_the_surface() {
        assert!(is_corporate_mode(Some("corporate")));
        for mode in [None, Some("creative"), Some("CORPORATE"), Some(" corporate"), Some("")] {
            assert!(!is_corporate_mode(mode), "mode {mode:?} must keep the full creative surface");
        }
    }
}
