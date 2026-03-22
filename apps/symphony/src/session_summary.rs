pub(crate) fn compact_session_id(session_id: &str) -> String {
    session_id.chars().take(8).collect()
}

pub(crate) fn normalize_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub(crate) fn truncate_for_display(value: &str, max_chars: usize) -> String {
    let normalized = normalize_whitespace(value);
    if normalized.chars().count() <= max_chars {
        return normalized;
    }

    let mut out = String::new();
    for ch in normalized.chars().take(max_chars.saturating_sub(1)) {
        out.push(ch);
    }
    out.push('…');
    out
}

#[cfg(test)]
mod tests {
    use super::{compact_session_id, normalize_whitespace, truncate_for_display};

    #[test]
    fn compact_session_id_limits_to_first_eight_chars() {
        assert_eq!(compact_session_id("1234567890abcdef"), "12345678");
    }

    #[test]
    fn normalize_whitespace_collapses_runs_and_trims() {
        assert_eq!(
            normalize_whitespace("  running \n   cargo\t test  "),
            "running cargo test"
        );
    }

    #[test]
    fn truncate_for_display_applies_whitespace_normalization_before_length_check() {
        assert_eq!(
            truncate_for_display("running   cargo\n test", 18),
            "running cargo test"
        );
        assert_eq!(
            truncate_for_display("running   cargo\n test", 12),
            "running car…"
        );
    }
}
