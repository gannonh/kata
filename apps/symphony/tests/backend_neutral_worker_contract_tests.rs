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

#[test]
fn worker_prompts_keep_tracker_helpers_backend_neutral() {
    for prompt in [
        "system.md",
        "in-progress.md",
        "rework.md",
        "agent-review.md",
        "merging.md",
    ] {
        let content = std::fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("prompts")
                .join(prompt),
        )
        .expect("prompt exists");

        assert!(content.contains("$SYMPHONY_BIN") || !content.contains("helper"));
        assert!(!content.contains("Linear milestone"));
        assert!(!content.contains("Linear project"));
        assert!(!content.contains("Linear only"));
        assert!(!content.contains("Linear-only"));
        assert!(!content.contains("GitHub Projects v2"));
        assert!(!content.contains("tracker.kind == \"linear\""));
    }
}

#[test]
fn worker_prompts_keep_pr_helpers_github_scoped() {
    let system = std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("prompts")
            .join("system.md"),
    )
    .expect("system prompt exists");
    let helper = std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("src")
            .join("helper.rs"),
    )
    .expect("helper source exists");

    assert!(system.contains("issue.get"));
    assert!(system.contains("issue.list-children"));
    assert!(system.contains("document.write"));
    assert!(system.contains("PR-inspection operations"));
    assert!(system.contains("pr.land-status"));
    assert!(helper.contains("github_pr_land_status_payload"));
    assert!(helper.contains("only available when tracker.kind is github"));
    assert!(!system.contains("Linear PR"));
}

#[test]
fn worker_prompts_do_not_reference_removed_symphony_skills() {
    for prompt in [
        "system.md",
        "in-progress.md",
        "rework.md",
        "agent-review.md",
        "merging.md",
    ] {
        let content = std::fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("prompts")
                .join(prompt),
        )
        .expect("prompt exists");

        assert!(!content.contains(".agents/skills/sym-"));
        assert!(!content.contains("apps/symphony/skills"));
        assert!(!content.contains("sym-state"));
        assert!(!content.contains("sym-linear"));
    }
}
