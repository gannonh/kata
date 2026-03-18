//! Codex app-server client — subprocess lifecycle, turn streaming, and dynamic tool dispatch.
//!
//! Ports the Elixir `SymphonyElixir.Codex` modules to idiomatic Rust.
//!
//! - `app_server` — subprocess launch, JSON-RPC handshake, and turn I/O (implemented in S05/T02+)
//! - `dynamic_tool` — client-side tool dispatch for `linear_graphql` and future extensions

pub mod app_server;
pub mod dynamic_tool;
pub mod token_accounting;
