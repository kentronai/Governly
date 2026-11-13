# Versions and releases

## The version number

Governly uses [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`, for example `1.3.0`.

| Part | Bump it when | Example |
| --- | --- | --- |
| **PATCH** | Bug fixes only. Nothing new, nothing breaks. | `1.3.0 → 1.3.1` |
| **MINOR** | New features. Existing setups keep working. | `1.3.1 → 1.4.0` |
| **MAJOR** | A breaking change: self-hosters must do something (rename a setting, run a manual step). | `1.4.0 → 2.0.0` |

Every version is listed, with what changed, in [CHANGELOG.md](../CHANGELOG.md), and each has a git tag
(`v1.3.0`) and a GitHub Release.

## Where the version lives

The root [`VERSION`](../VERSION) file is the source of truth. `scripts/release.sh` copies it into
every place the apps report their version:

- `README.md` (version badge), `package.json`, `apps/web/package.json` (shown in the app sidebar)
- `apps/controlnet/pyproject.toml`, `apps/onnx-service/pyproject.toml`, `apps/model-guard/pyproject.toml`
- `apps/controlnet/gateway/main.py` and `routes/health.py` (shown in the API docs at `/docs` and the health endpoints)
- `apps/onnx-service/main.py`

`packages/cga-sdk` is a separate library with its own version and is not bumped here.

## Day to day: write good commit messages

The release script drafts the changelog from commit messages, so start each one with its type:

| Prefix | Goes under | Example |
| --- | --- | --- |
| `feat:` | Added | `feat(radar): Slack alerts for new regulations` |
| `fix:` | Fixed | `fix: sign-in loop on Safari` |
| `refactor:`, `perf:`, `docs:` | Changed | `perf: faster agent inventory` |
| `chore:`, `ci:`, `test:` | not listed | `chore: bump dependencies` |

## Cutting a release

From an up-to-date `main` with no uncommitted changes:

```bash
scripts/release.sh patch "Sign-in fix"                   # 1.3.0 -> 1.3.1
scripts/release.sh minor "Slack alerts, faster reports"   # 1.3.0 -> 1.4.0
scripts/release.sh major "New config format"             # 1.3.0 -> 2.0.0
```

The quoted text becomes the version's one-line **Highlights** in the changelog table.

The script:

1. Refuses if the tree is dirty, the tag exists, the version isn't higher, or the summary is missing.
2. Writes the new version into `VERSION` and every file listed above.
3. Adds a row to the top of the changelog table and a new section drafted from the commit messages since
   the last tag.
4. Prints the commands to commit, tag and push. It never commits or pushes by itself.

Then:

1. Read `git diff`, and polish the new changelog section so a user understands it (group related lines,
   remove internal noise).
2. Run the printed commands:
   ```bash
   git commit -am "release: v1.4.0"
   git tag -a v1.4.0 -m "Governly v1.4.0"
   git push origin main && git push origin v1.4.0
   ```
3. On GitHub: Releases → Draft a new release → choose the tag, and paste that version's changelog
   section as the notes. Or: `gh release create v1.4.0 --title "Governly v1.4.0" --notes-file <file>`.

Changed your mind before committing? `git checkout -- .` undoes everything.

## Upgrading a self-hosted install

Latest version:

```bash
git pull && ./install.sh
```

A specific version:

```bash
git fetch --tags && git checkout v1.3.0 && ./install.sh
```

`./install.sh --doctor` shows the version that is installed.
