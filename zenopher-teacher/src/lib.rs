//! Zenopher teacher. Everything that decides what is wrong with a design runs here, in the engine.
//! The browser services only move data to and from the backend, or display results.
pub mod background;
pub mod color;
pub mod config;
pub mod critique;
pub mod events;
pub mod finding;
pub mod hints;
pub mod measure;
pub mod messages;
pub mod model;
pub mod planner;
pub mod rules;
pub mod runner;
pub mod scheduler;
pub mod sha256;
pub mod store;
pub mod style;
pub mod teacher;
#[cfg(feature = "wasm")]
pub mod wasm;

pub use teacher::{Teacher, TeacherError};
