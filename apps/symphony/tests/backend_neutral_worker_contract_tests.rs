use std::path::Path;

#[test]
fn sym_skills_do_not_instruct_backend_specific_tracker_ops_for_workers() {
    let skills_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("skills");
    let checked = [
        "sym-address-comments",
        "sym-land",
        "sym-debug",
        "sym-linear",
    ];

    let forbidden = [
        "linear_get_issue",
        "linear_update_issue",
        "linear_add_comment",
        "IssueFilter.identifier",
    ];

    for skill in checked {
        let path = skills_dir.join(skill).join("SKILL.md");
        let content = std::fs::read_to_string(&path).expect("skill file should exist");

        if skill == "sym-linear" {
            assert!(
                content.contains("disable-model-invocation: true"),
                "sym-linear must be opt-in only"
            );
            assert!(
                content.contains("Do not use this skill for normal worker tracker operations"),
                "sym-linear must explicitly prohibit normal worker tracker usage"
            );
            continue;
        }

        for token in forbidden {
            assert!(
                !content.contains(token),
                "{skill} must not include backend-specific token {token}"
            );
        }
    }
}
