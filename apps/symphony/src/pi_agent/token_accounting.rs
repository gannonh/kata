//! Token accounting for pi-agent sessions.
//!
//! pi RPC reports cumulative totals via `get_session_stats`; this tracker
//! converts those totals into per-turn deltas.

/// Incremental token usage for one prompt turn.
#[derive(Debug, Clone, Default)]
pub struct TokenDelta {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
}

/// Tracks last-seen cumulative token counts.
#[derive(Debug, Clone, Default)]
pub struct TokenTracker {
    last_input: u64,
    last_output: u64,
    last_total: u64,
}

impl TokenTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Update with cumulative totals and return the incremental delta.
    pub fn update(&mut self, input: u64, output: u64, total: u64) -> TokenDelta {
        let delta = TokenDelta {
            input_tokens: input.saturating_sub(self.last_input),
            output_tokens: output.saturating_sub(self.last_output),
            total_tokens: total.saturating_sub(self.last_total),
        };
        self.last_input = input;
        self.last_output = output;
        self.last_total = total;
        delta
    }
}
