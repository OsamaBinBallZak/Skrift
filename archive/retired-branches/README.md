# Retired branches

Full patches of branches deleted 2026-07-27, kept because they were **unmerged** when
removed. Restore either with `git am < <file>.patch`, or recreate the branch at the sha
in its header.

| Branch | Why retired |
|---|---|
| `claude/xenodochial-mclaren-9361b9` | Superseded. Its `MemoCloudUpdate` content-based echo guard is already on main by another route; the rest is CFBundleVersion 29→30 against main's 133. |
| `cleanup/mobile-audit-fixes` | Dead. All five files live under `Mobile/`, the React Native app archived to `archive/Mobile/` in June 2026 — the paths no longer exist, so the patch can never apply as-is. Last real work 2026-05-01. |

Both blocked untracking the generated `Info.plist`s (they were the only branches still
editing those files); that cleanup landed once they were gone.
