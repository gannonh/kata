# GitHub Team Workflows & Best Practices

This document serves as an exhaustive guide to our team's development lifecycle, covering Issue tracking, Pull Requests, Code Reviews, CI/CD, and Release strategies.

## 1. Issue Management

Issues are the source of truth for all work. No code should be written without a corresponding issue (or at least a very clear directive).

### Issue Lifecycle
1.  **New**: Issue created. Needs triage.
2.  **Triage**:
    *   **Duplicate**: Close with link to original.
    *   **Invalid**: Close with explanation.
    *   **Accepted**: Add labels, assign priority.
3.  **Backlog**: Accepted but not prioritized for current sprint/milestone.
4.  **Ready**: Detailed enough to be worked on.
5.  **In Progress**: Assigned to a developer. Branch created.
6.  **In Review**: PR open and linked.
7.  **Done**: PR merged, fix verified.

### Labels
Use labels to categorize issues for easy filtering:
*   **Type**: `bug`, `feature`, `enhancement`, `documentation`, `chore`, `refactor`
*   **Priority**: `urgent` (immediate action), `high` (next sprint), `medium` (normal), `low` (when possible)
*   **Status**: `blocked`, `needs-info`, `on-hold`
*   **Size**: `XS`, `S`, `M`, `L`, `XL` (for estimation)

### Issue Templates
We use issue templates to ensure consistency:
*   **Bug Report**: Steps to reproduce, expected vs actual behavior, environment, logs/screenshots.
*   **Feature Request**: Problem statement, proposed solution, alternative considered.

---

## 2. Branching Strategy

We follow a **Feature Branch Workflow** (Gitflow-lite).

### Branch Naming Conventions
*   `feature/description-of-feature`: New features (e.g., `feature/user-auth`)
*   `fix/description-of-bug`: Bug fixes (e.g., `fix/login-crash`)
*   `doc/description`: Documentation only changes
*   `chore/description`: Maintenance, build config, dependency updates
*   `refactor/description`: Code changes that neither fix a bug nor add a feature

### Main Branch Protection
*   The `main` branch is protected.
*   Direct pushes to `main` are disabled.
*   Changes must come via Pull Request.
*   Required status checks must pass before merging.

---

## 3. Development Workflow

1.  **Sync**: Always pull latest `main` before starting.
    ```bash
    git checkout main
    git pull origin main
    ```
2.  **Branch**: Create a fresh branch.
    ```bash
    git checkout -b feature/my-cool-feature
    ```
3.  **Commit**: Make atomic commits.
    *   Use **Conventional Commits** format: `type(scope): description`
    *   Example: `feat(auth): implement jwt token validation`
    *   Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
4.  **Push**: Push to remote.
    ```bash
    git push -u origin feature/my-cool-feature
    ```

---

## 4. Code Quality & Standards

*   **Linting**: Enforced via pre-commit hooks and CI.
*   **Formatting**: Auto-formatted on save or commit (Prettier/SwiftFormat).
*   **Environment**:
    *   **Dev Containers**: We encourage using `.devcontainer` configuration to ensure consistency.
    *   **Codespaces**: Ready-to-use cloud environments.

---

## 5. Pull Requests (PRs)

### Creation
*   **Draft PRs**: Open early to get feedback on direction/architecture.
*   **Ready PRs**: When implementation is complete and self-reviewed.
*   **Title**: Clear and descriptive (often matches the commit message).
*   **Description**:
    *   Link the Issue: `Fixes #123` or `Closes #123`.
    *   Summary of changes.
    *   **Screenshots/Videos**: Mandatory for UI changes.
    *   Testing steps for the reviewer.

### PR Size
*   Keep PRs small (< 400 lines preferred).
*   If a feature is large, break it into stacked PRs or smaller logical chunks.

---

## 6. Code Review Process

Code review is for quality assurance, knowledge sharing, and consistency.

### Reviewer Roles
*   **CodeRabbit (AI)**: Initial pass for syntax, common bugs, and spelling.
*   **Team Members**: Logic, architecture, maintainability, edge cases.

### Review Guidelines
*   **Be Respectful**: Critique the code, not the author.
*   **Be Explicit**:
    *   `[Nit]`: Minor preference, non-blocking (e.g., variable naming).
    *   `[Suggestion]`: A better way might exist, but not strictly required.
    *   `[Required]`: Must be fixed before merge (blocker).
*   **Ask Questions**: "Why did we choose this approach?" instead of "Change this."

### Author Responsibilities
*   Respond to every comment (resolve or reply).
*   Don't just fix—explain *why* if you disagree.
*   Re-request review after pushing significant changes.

---

## 7. CI/CD (Continuous Integration/Deployment)

GitHub Actions drive our automation.

### CI Pipeline (On PR)
Triggers on `pull_request` to `main`:
1.  **Lint**: Code style checks (SwiftLint, ESLint, Prettier).
2.  **Build**: Ensure the project compiles.
3.  **Test**: Run Unit and Integration tests.
4.  **Coverage**: Report code coverage stats (e.g., Codecov, lcov). PR fails if coverage drops below threshold.

### CD Pipeline (On Merge to Main)
Triggers on `push` to `main`:
1.  **Build Release**: Optimized production build.
2.  **Deploy**:
    *   **Staging**: Automatic deploy to staging environment for QA.
    *   **Production**: Automatic (or manual gate) deploy to production.
3.  **Docs**: Auto-generate/publish documentation if needed.

---

## 8. Releases & Versioning

### Semantic Versioning (SemVer)
We follow `MAJOR.MINOR.PATCH`:
*   **MAJOR**: Incompatible API changes.
*   **MINOR**: Backwards-compatible functionality.
*   **PATCH**: Backwards-compatible bug fixes.

### Release Workflow
1.  **Trigger**: Create a new Release in GitHub UI or push a tag `v1.0.0`.
2.  **Workflow**:
    *   Build artifacts (binaries, docker images).
    *   Generate **Changelog** automatically from Pull Requests since last tag.
    *   Publish to package registries (App Store, npm, Docker Hub).

---

## 9. Common Automated Workflows

Beyond standard CI/CD, we utilize these automations:
*   **Dependabot/Renovate**: Automatically opens PRs to update dependencies.
*   **Stale Bot**: Marks and eventually closes issues/PRs with no activity after X days.
*   **Welcome Bot**: Posts a welcome message / contribution guide link for first-time contributors.
*   **Labeler**: Automatically labels PRs based on changed files (e.g., touching `.md` files adds `documentation` label).

---

## 10. Definition of Done (DoD)

A task/PR is considered "Done" when:
*   [ ] Code is written and style-compliant.
*   [ ] Unit tests are written and passing.
*   [ ] Documentation (code comments + docs) is updated.
*   [ ] PR is reviewed and approved by at least 1 peer.
*   [ ] CI pipeline passes (Green).
*   [ ] Merged into `main`.

