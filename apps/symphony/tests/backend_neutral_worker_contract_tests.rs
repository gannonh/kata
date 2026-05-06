use std::path::Path;

#[test]
fn starter_prompts_do_not_instruct_backend_specific_tracker_ops_for_workers() {
    let prompts_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("prompts");
    let checked = [
        "system.md",
        "in-progress.md",
        "agent-review.md",
        "merging.md",
        "rework.md",
    ];

    let forbidden = [
        "linear_get_issue",
        "linear_update_issue",
        "linear_add_comment",
        "issuefilter.identifier",
        "gh issue",
        ".agents/skills/sym-",
    ];

    for prompt in checked {
        let path = prompts_dir.join(prompt);
        let content = std::fs::read_to_string(&path).expect("prompt file should exist");
        let content_lower = content.to_lowercase();

        assert!(
            content.contains("$SYMPHONY_BIN")
                || content.contains("direct Symphony helper contract"),
            "{prompt} must route tracker operations through the direct Symphony helper"
        );

        for token in forbidden {
            assert!(
                !content_lower.contains(token),
                "{prompt} must not include backend-specific or injected-skill token {token}"
            );
        }
    }
}
