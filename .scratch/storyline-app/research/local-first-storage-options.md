# Local-First Storage Options for a Personal Writing App (Windows 11, 2026)

**Ticket question:** What are the viable ways for a personal web application on Windows 11 to store its content as plain files in a *folder the user chooses*, and what file format best serves long-term content ownership?

**Reader assumption:** one solo, non-technical-ish user who wants to "just open the app and write." Not a product being shipped to strangers.

---

## 1. App architectures

### 1a. Browser page / PWA using the File System Access API

The File System Access API lets a web page call `window.showDirectoryPicker()`, get a `FileSystemDirectoryHandle` to a real folder the user chooses, and then read/write actual files inside it — no server, no upload, the bytes live on disk in a folder the user owns.

**Browser support (as of 2026 — still effectively Chromium-only):**

- **Chrome / Edge / Opera (desktop):** fully supported since Chrome/Edge 86. On Windows 11, Edge is preinstalled, so the user needs to install nothing.
- **Firefox:** does **not** implement `showDirectoryPicker` / `showOpenFilePicker` / `showSaveFilePicker` in any version (Mozilla's standards position on the local-disk portion of the API has been negative on security grounds). Only the sandboxed Origin Private File System (OPFS) is supported — which stores files in an opaque browser-internal location, *not* a user-visible folder.
- **Safari:** same story — Safari 15.2+ supports only OPFS; the on-disk pickers are unavailable on macOS/iOS.
- **Mobile (Android/iOS):** no picker support anywhere.

Verdict on support: for a personal app used on your own Windows 11 machine in Edge or Chrome, this is a non-issue. For "works in any browser," it fails.

**Does the folder permission persist across sessions?** Yes, since **Chrome 122** (early 2024) — this is the big change that made this architecture genuinely viable:

- You store the `FileSystemDirectoryHandle` in IndexedDB (handles are structured-cloneable).
- On the next visit, you load the handle and call `queryPermission()` / `requestPermission()`. Chrome shows a **three-way prompt**: "Allow this time" / "Allow on every visit" / "Don't allow." Once the user picks **"Allow on every visit,"** the app silently reopens the folder on every launch.
- If the user **installs the app as a PWA** (Edge/Chrome "Install app" button), persistent permission is granted **by default with no prompt at all** — the installed app just opens and has its folder. This is the "just open the app and write" experience.

**Offline behavior:** file reads/writes are purely local and work offline by definition. The app *shell* (HTML/JS) needs to be available offline too: either install it as a PWA with a service worker caching the assets, or simply serve/open it from disk. A PWA installed from a local or hosted origin gets its own Start-menu entry and taskbar icon on Windows 11 and behaves like a lightweight desktop app.

**Judged for this user:** excellent fit. Zero install (or one-click PWA install), zero maintenance runtime (the browser auto-updates), real files in a real folder. Caveats: one small caveat — Chromium blocks writes to certain sensitive locations (e.g. the root of a system folder), and a hosted PWA needs HTTPS or `localhost`.

### 1b. Electron desktop app

Electron bundles Chromium + Node.js into a desktop app, so it has unrestricted `fs` access — folder pickers via the native dialog, no permission prompts ever, files anywhere.

- **Bundle size / footprint:** installers typically **80–150 MB+**, idle RAM 150–300 MB, because every app ships its own full Chromium.
- **Maintenance cost:** the real tax for a hobby project. Electron majors release on Chromium's cadence; you own shipping security updates for your bundled Chromium, keeping build tooling (electron-builder/forge) working, and (ideally) code-signing the Windows installer — unsigned installers trigger SmartScreen warnings that a non-technical user finds scary.
- **UX:** genuinely first-class once installed — real app, real icon, no browser chrome.

**Judged for this user:** it works, but it is the heaviest hammer. You inherit an app-distribution problem (installers, signing, updates) to solve a problem the browser can now solve natively. Only worth it if you need things the browser forbids (arbitrary paths without any prompt, background processes, system tray, watching files while closed).

### 1c. Tauri (v2) desktop app

Tauri wraps your web UI in a Rust shell and renders through the OS webview — on Windows that's **WebView2** (Chromium-based, preinstalled on Windows 11 and serviced by Microsoft). Full fs access via its Rust core and the `fs`/`dialog` plugins, with a capability/permission config gating what the frontend may touch.

- **Size:** installers roughly **3–10 MB**, idle RAM 30–100 MB — 20–50x smaller than Electron, because Chromium isn't bundled.
- **Windows install experience:** Tauri generates MSI/NSIS installers; WebView2 is already present on Windows 11 (the installer can bootstrap it if missing). Same SmartScreen caveat for unsigned hobby installers.
- **Maintenance cost for a hobby project:** you need a Rust toolchain installed to build, and you'll write a little Rust (or at least `tauri.conf.json` capability config) to expose fs commands. The webview itself is auto-updated by Windows, which removes Electron's "ship Chromium patches forever" burden. Cross-platform later means testing against WebKit on macOS/Linux (engines differ), but for a Windows-only personal app that's moot.

**Judged for this user:** the best *desktop-app* option if a desktop app is wanted at all — tiny, fast, and the security-update burden mostly falls on Microsoft. Cost is a heavier dev setup (Rust) than "it's just a web page."

### 1d. Plain local server (Node/Bun/Deno) serving a web UI

A ~100-line script runs `Bun.serve`/`node:http` on `localhost:3000`, serves the app's HTML/JS, and exposes a couple of endpoints (`GET/PUT /files/...`) that read and write the chosen folder directly with full fs rights. The "folder the user chooses" is just a config value or a picker rendered in the UI.

- **Pros:** dead simple to build and debug; no browser permission model at all; works in *any* browser including Firefox; trivially scriptable (git auto-commit on save, backups, export); no installer, no signing, no framework churn — a plain script can run unchanged for a decade.
- **Cons — launch ergonomics, the killer for a non-technical user:** something has to *start the server*. Options, roughly in order of friendliness:
  - a `.cmd`/`.vbs`/PowerShell shortcut on the desktop that starts the server hidden and opens the browser;
  - a Windows "Startup" folder entry or Task Scheduler job so it's always running and the app is just a bookmark (or an installed PWA pointing at `localhost` — PWAs install fine from `localhost`);
  - a service wrapper (NSSM) — more setup, more magic to forget.
  Every one of these is a small pile of glue that only the person who wrote it understands. If the script dies or the runtime (Node/Bun) gets uninstalled or major-versions, "the app is broken" with no visible reason.
- Also: anything on `localhost` is reachable by any local process/browser tab, so keep it bound to `127.0.0.1`.

**Judged for this user:** great as a developer's own tool; fragile as a "just open it" app unless you invest in the auto-start glue. Notably, it *pairs well* with option 1a: the same static app that uses `showDirectoryPicker` in the browser needs no server at all.

### Architecture comparison at a glance

| | Install burden | "Just open and write" | Folder access | Long-term maintenance |
|---|---|---|---|---|
| **PWA + File System Access API** | none / one-click PWA install | Yes (persistent permission, silent for installed PWA) | Any user-picked folder (few blocked system paths) | Near zero — browser auto-updates |
| **Tauri v2** | small MSI (~5 MB), SmartScreen nag if unsigned | Yes | Unrestricted | Low-moderate: Rust toolchain, occasional Tauri upgrades |
| **Electron** | 80–150 MB installer, SmartScreen nag | Yes | Unrestricted | High: Chromium update treadmill, build tooling |
| **Local server + browser** | needs Node/Bun + startup glue | Only after scripting auto-start | Unrestricted | Low code churn, but glue is brittle |

---

## 2. File format for the story content

Judged on: human readability, longevity ("openable in Notepad in 10 years"), git-friendliness, ease of parsing, resilience if the app is abandoned.

### Markdown + YAML frontmatter (one `.md` file per story/scene/note)

- **Readability:** the best of any option — prose is prose; metadata is a small labeled block at the top.
- **Longevity:** plain UTF-8 text. Opens in Notepad today and in 2036. Markdown is arguably the most durable prose convention of the last 20 years, and even un-rendered it reads fine.
- **Git:** ideal — line-oriented, diffs are meaningful, merges usually work.
- **Parsing:** trivially easy to *read*; frontmatter parsing needs a small YAML (or the stricter TOML/JSON-frontmatter variant) library. Edge cases exist (YAML's type coercion), but for a handful of fields per file they're manageable — keep frontmatter shallow and quote strings.
- **Abandonment resilience:** maximal. The content is directly usable in Obsidian, VS Code, iA Writer, static-site generators, or nothing at all. This is the ecosystem's lingua franca (Obsidian, Jekyll/Hugo, Zettlr all use exactly this format).

### JSON (one big file, or per-item files)

- **Readability:** structured but hostile to prose — paragraphs become one enormous escaped string with `\n` in it. Notepad shows it, but you wouldn't want to *read* a novel chapter in it.
- **Longevity:** fine as a format (Library of Congress recommended, universal parsers) — but the *content* is only as accessible as someone's willingness to un-escape it.
- **Git:** poor-to-okay. A single big JSON file diffs terribly and merge-conflicts constantly; per-item pretty-printed JSON files are acceptable but still noisy.
- **Parsing:** the easiest of all — `JSON.parse` everywhere, zero dependencies.
- **Abandonment resilience:** data survives, experience doesn't — the user would need a script to get their prose back out.
- **Right role:** app *metadata* (board layout, ordering, settings), not prose.

### SQLite (single `.db` file)

- **Readability:** none in Notepad — it's a binary file. You need a tool (`sqlite3`, DB Browser for SQLite) to look inside.
- **Longevity:** technically outstanding — SQLite is a US **Library of Congress Recommended Storage Format**, its file format is documented and pledged stable through 2050, and readers will exist forever. But "longevity" here means *a programmer* can always recover the data, not that *this user* can double-click it.
- **Git:** bad. Binary blob; no diffs, no merges; every save rewrites the file.
- **Parsing:** easy for the app (great query power, transactions, real integrity), and by far the best if the content becomes large, heavily linked, or search-heavy.
- **Abandonment resilience:** good for a technical user, poor for this one.

### Folder-of-files hybrid (the recommended shape)

A user-picked folder containing Markdown files for prose plus one or two small JSON files for app-structural data:

```
My Stories/
  storyboard.json          <- ordering, board/canvas layout, app settings
  stories/
    the-lighthouse/
      story.md             <- frontmatter: title, status, tags, dates
      scenes/
        01-arrival.md
        02-the-storm.md
  assets/
    cover-sketch.png
```

- Each file stays small → clean git history, no merge pain, fast atomic writes.
- The prose is 100% Notepad/Obsidian-readable even if `storyboard.json` and the app itself vanish — worst case the user loses layout, never words.
- Filenames with numeric prefixes (`01-…`) mean even the *ordering* survives without the JSON.
- Parsing is per-file and simple; corruption of one file can't take out the corpus (unlike one big JSON or an un-backed-up `.db`).

**Format verdict:** Markdown + shallow YAML frontmatter for everything the user *writes*; a small JSON sidecar for everything the *app* needs; SQLite only if/when full-text search across a huge corpus becomes a real need (and even then, consider it a rebuildable index next to the Markdown, not the source of truth).

---

## 3. Recommendations (ranked)

### 1. PWA + File System Access API + Markdown/frontmatter folder-of-files  ← recommended

Build a static web app, install it as a PWA from Edge/Chrome on Windows 11, use `showDirectoryPicker()` once and persist the handle — installed PWAs get silent persistent folder access, so subsequent launches are genuinely "click icon, start writing." Zero installers, zero runtime to maintain, and the content is a plain Markdown folder that outlives the app entirely.
**Main risk:** hard Chromium lock-in (Firefox/Safari will likely never ship the API), and a browser-permission-model change or profile reset could one day re-prompt for the folder — annoying, never data-destroying.

### 2. Tauri v2 + Markdown/frontmatter folder-of-files

If a real desktop app feels better (own window/icon, no browser involvement, unrestricted paths), Tauri gives that in a ~5 MB installer that leans on Windows 11's built-in, Microsoft-updated WebView2 — the same web UI, dramatically cheaper to keep alive than Electron. Content format stays identical, so you can even start as the PWA and migrate the shell later without touching a single story file.
**Main risk:** heavier dev-side commitment for a hobby (Rust toolchain, Tauri config/upgrade churn), and unsigned installers trip SmartScreen; if the maintainer loses interest, rebuilding the app later is harder than re-hosting a static page.

### 3. Local Bun/Node server + browser UI + Markdown folder (with a startup script)

Simplest possible code with total fs freedom and any-browser support; a hidden-start `.cmd` shortcut (or Startup-folder entry) plus a `localhost` PWA install can approximate one-click launch, and it's the easiest base for git-auto-commit/backup automation. Best when the builder and the user are the same person and comfortable with one piece of glue.
**Main risk:** launch ergonomics — the server has to be running, and when the runtime updates or the script breaks, the app "mysteriously" stops working for a non-technical user with no error they can act on.

**Not recommended for this case:** Electron (its 100+ MB bundle and Chromium-update maintenance treadmill buy nothing over Tauri or the PWA here) and SQLite-as-source-of-truth (binary, un-diffable, and unreadable in Notepad — fine later as a rebuildable search index beside the Markdown).

---

## Sources

- Can I use — File System Access API: https://caniuse.com/native-filesystem-api
- MDN — `Window.showDirectoryPicker()`: https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker
- MDN — File System API (incl. OPFS vs. on-disk access): https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
- Chrome for Developers — The File System Access API: https://developer.chrome.com/docs/capabilities/web-apis/file-system-access
- Chrome for Developers — Persistent permissions for the File System Access API (Chrome 122 behavior, three-way prompt, installed-PWA default grant): https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api
- Chromium tracker — Persistent Permission for File System Access API: https://issues.chromium.org/issues/40101962
- Electron issue — persistent FSA permissions gap in Electron: https://github.com/electron/electron/issues/41957
- Tauri v2 documentation (WebView2 on Windows, fs/dialog plugins, bundling): https://tauri.app/
- PkgPulse — Electron vs Tauri 2026 (bundle size / RAM / maintenance comparison): https://www.pkgpulse.com/guides/electron-vs-tauri-2026
- Digital Applied — Desktop apps from web stack, Tauri vs Electron vs Deno 2026: https://www.digitalapplied.com/blog/desktop-apps-web-stack-tauri-electron-deno-wails-2026
- SQLite — Recommended Storage Format (Library of Congress): https://www.sqlite.org/locrsf.html
- WICG File System Access spec: https://wicg.github.io/file-system-access/
