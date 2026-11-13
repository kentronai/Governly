#!/usr/bin/env bash
# Prepare a Governly release: bump every version number and write the changelog entry.
#
#   scripts/release.sh patch "Fix sign-in loop"          # 1.3.0 -> 1.3.1
#   scripts/release.sh minor "Slack alerts, new reports"  # 1.3.0 -> 1.4.0
#   scripts/release.sh major "New config format"          # 1.3.0 -> 2.0.0
#   scripts/release.sh 1.5.0 "..."                        # or name the version
#
# The quoted text is the one-line "Highlights" shown in the changelog table. The entry's details are
# drafted from commit messages since the last tag (feat: -> Added, fix: -> Fixed). The script edits files
# only: review CHANGELOG.md, then run the commit/tag/push commands it prints. See docs/releasing.md.
set -euo pipefail
cd "$(dirname "$0")/.."

die() { printf 'error: %s\n' "$*" >&2; exit 1; }

old="$(tr -d '[:space:]' < VERSION)"
IFS=. read -r MA MI PA <<<"$old"
case "${1:-}" in
  patch) new="$MA.$MI.$((PA + 1))" ;;
  minor) new="$MA.$((MI + 1)).0" ;;
  major) new="$((MA + 1)).0.0" ;;
  "")    die "usage: scripts/release.sh <patch|minor|major|X.Y.Z> \"highlights\"  (current: $old)" ;;
  *)     new="$1" ;;
esac
highlights="${2:-}"
[ -n "$highlights" ] || die "add a one-line summary, e.g. scripts/release.sh $1 \"Slack alerts, faster dashboard\""
[[ "$new" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "'$new' is not X.Y.Z"
[ "$new" != "$old" ] && [ "$(printf '%s\n%s\n' "$old" "$new" | sort -V | tail -1)" = "$new" ] \
  || die "$new must be greater than the current $old"
[ -z "$(git status --porcelain --untracked-files=no)" ] || die "commit or stash your changes first"
git rev-parse -q --verify "refs/tags/v$new" >/dev/null && die "tag v$new already exists"

# Draft the entry from commits since the previous release tag.
since="$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || true)"
range="${since:+$since..}HEAD"
section() { # section TITLE REGEX -> "### TITLE" + one bullet per matching commit, capitalized
  local lines; lines="$(git log --no-merges --format='%s' "$range" | grep -E "$2" \
    | perl -pe 's/^[a-z]+(\([^)]*\))?!?: */- /; s/^- (.)/- \u$1/' || true)"
  if [ -n "$lines" ]; then printf '### %s\n\n%s\n\n' "$1" "$lines"; fi
}
today="$(date +%Y-%m-%d)"
anchor="$(echo "$new" | tr -d .)---$today"
# The trailing "." keeps $(...) from stripping the blank lines between sections.
entry="$(printf '## [%s] - %s\n\n' "$new" "$today"; section Added '^feat'; section Fixed '^fix'; section Changed '^(refactor|perf|docs)'; echo .)"
entry="${entry%.}"

# Every place that carries the app version. Keep in sync with docs/releasing.md.
export OLD="$old" NEW="$new" ROW="| [**$new**](#$anchor) | $today | $highlights |" ENTRY="$entry"
echo "$new" > VERSION
# perl -pi edits in place the same way on macOS and Linux. \Q..\E: dots are literal.
perl -pi -e 's/"version": "\Q$ENV{OLD}\E"/"version": "$ENV{NEW}"/' package.json apps/web/package.json
perl -pi -e 's/Version \Q$ENV{OLD}\E"/Version $ENV{NEW}"/; s/badge\/version-\Q$ENV{OLD}\E-/badge\/version-$ENV{NEW}-/' README.md
perl -pi -e 's/^version = "\Q$ENV{OLD}\E"/version = "$ENV{NEW}"/' \
  apps/controlnet/pyproject.toml apps/onnx-service/pyproject.toml apps/model-guard/pyproject.toml
perl -pi -e 's/version="\Q$ENV{OLD}\E"/version="$ENV{NEW}"/; s/"version": "\Q$ENV{OLD}\E"/"version": "$ENV{NEW}"/' \
  apps/controlnet/gateway/main.py apps/controlnet/gateway/routes/health.py apps/onnx-service/main.py
# Changelog: un-bold the previous newest row, add the new row on top, insert the entry above the old newest one.
perl -0pi -e '
  s/^\| \[\*\*([^*]+)\*\*\]/| [$1]/m;
  s/^(\| --- \| --- \| --- \|\n)/$1$ENV{ROW}\n/m;
  s/^(## \[)/$ENV{ENTRY}$1/m;
' CHANGELOG.md

left="$(git grep -lF -e "\"version\": \"$old\"" -e "version=\"$old\"" -e "version = \"$old\"" -- package.json apps/web/package.json \
  'apps/*/pyproject.toml' apps/controlnet/gateway/main.py apps/controlnet/gateway/routes/health.py apps/onnx-service/main.py || true)"
[ -z "$left" ] || die "still on $old: $left (undo with: git checkout -- .)"

cat <<EOF
Prepared v$new ($old -> $new). The changelog entry was drafted from commit messages ${since:+since $since}.
1. Review and polish CHANGELOG.md (git diff).
2. Then:
   git commit -am "release: v$new"
   git tag -a v$new -m "Governly v$new"
   git push origin main && git push origin v$new
(Changed your mind? git checkout -- .)
EOF
