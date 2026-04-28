// ============================================================================
// MOSET CORE — Public Library API
// ============================================================================
// Re-exports all modules for external consumers (Tauri IDE, tests, tooling).
// The binary (main.rs) also imports from here to avoid duplication.
// ============================================================================

pub mod ast;
pub mod valor;
pub mod bytecode;
pub mod compiler;
pub mod vm;
#[cfg(not(target_arch = "wasm32"))]
pub mod agent;
pub mod lexer;
pub mod parser;
pub mod stdlib;
pub mod vigilante;
pub mod ai;
pub mod linter;
#[cfg(all(not(target_arch = "wasm32"), feature = "cloud"))]
pub mod cloud_ai;
#[cfg(target_arch = "wasm32")]
pub mod wasm;

#[cfg(not(target_arch = "wasm32"))]
pub mod mcp;
#[cfg(not(target_arch = "wasm32"))]
pub mod lsp;
