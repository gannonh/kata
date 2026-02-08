<!-- kata-template-schema
required-fields:
  frontmatter: []
  body: [Added, Fixed, Changed]
optional-fields:
  frontmatter: []
  body: [Deprecated, Removed, Security]
version: 1
-->

<format>

## Keep a Changelog Format

Standard format for changelog entries (https://keepachangelog.com/):

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- feat: description (from feat commits)

### Fixed
- fix: description (from fix commits)

### Changed
- docs/refactor/perf: description (from other commits)
```

**Section order:** Added, Changed, Deprecated, Removed, Fixed, Security

**Guiding principles:**
- Changelogs are for humans, not machines
- Write in imperative mood ("Add feature" not "Added feature")
- Group by type of change, not by commit order

</format>

<commit_type_mapping>

## Commit Type Mapping

| Commit Type | Changelog Section | Notes                    |
| ----------- | ----------------- | ------------------------ |
| `feat`      | Added             | New features             |
| `fix`       | Fixed             | Bug fixes                |
| `docs`      | Changed           | Documentation changes    |
| `refactor`  | Changed           | Code restructuring       |
| `perf`      | Changed           | Performance improvements |
| `style`     | (omit)            | Formatting only          |
| `test`      | (omit)            | Test changes only        |
| `chore`     | (omit)            | Maintenance tasks        |
| `ci`        | (omit)            | CI/CD changes            |

**Breaking changes:** Noted with `BREAKING:` prefix regardless of commit type

</commit_type_mapping>
