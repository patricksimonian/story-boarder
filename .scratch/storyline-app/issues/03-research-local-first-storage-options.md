# 03 — Research: local-first storage options for a personal web app

Type: research
Status: resolved

## Question

What are the viable ways (as of 2026) for a personal web application on Windows 11 to store its content as files in a **folder the user chooses**, and what file format best serves content ownership?

Cover:

- **App architectures**: browser + File System Access API (current support, persistence of folder permission), PWA, Electron, Tauri, and a plain local dev server (Node/Bun/Deno) reading/writing files — pros/cons for a solo, non-expert user who just wants to double-click and write.
- **File formats**: Markdown (+ YAML frontmatter) vs. JSON vs. SQLite vs. a folder-of-files hybrid — judged on human readability, longevity, git-friendliness, and "I own this even if the app dies".
- Recommend 2–3 concrete architecture + format pairings with tradeoffs, ranked for this user.

This feeds the platform/stack decision ([06](06-grilling-platform-and-stack.md)) and the file-format half of [05](05-grilling-domain-model-and-file-format.md).

Findings file: [research/local-first-storage-options.md](../research/local-first-storage-options.md)

## Answer

Full findings in the linked file. Ranked architecture + format pairings for this user (Windows 11, wants "open the app and write", full content ownership):

1. **PWA + File System Access API, writing a Markdown folder.** `showDirectoryPicker()` remains Chromium-only in 2026 (Firefox/Safari have only sandboxed OPFS), but since Chrome 122 folder permissions persist across sessions, and an *installed* PWA gets silent persistent access — true "click icon and write" with zero install/maintenance. Risk: Chromium lock-in; a browser-profile reset re-prompts for the folder (annoying, never data-destroying).
2. **Tauri v2 desktop app + the same Markdown folder.** ~3–10 MB installer on Windows 11's built-in Microsoft-updated WebView2; unrestricted filesystem access; far cheaper to maintain than Electron. Risk: Rust toolchain/config churn for a hobby project; unsigned installers trip SmartScreen.
3. **Local Bun/Node server + browser UI + Markdown folder.** Simplest code, works in any browser, easy git auto-commit — but needs startup-script glue, and a broken script means the app "mysteriously" stops for a non-technical user.

**Electron: not recommended** (100+ MB, Chromium-update treadmill, no benefit here).

**Format verdict:** Markdown + shallow YAML frontmatter for the prose content; a small JSON sidecar for app-only concerns (layout, ordering); SQLite only ever as a rebuildable search index — archival-grade but unreadable in Notepad and git-hostile as a source of truth.
