# 13 — Build: the desktop shell

Type: build
Status: done 2026-09-04 (Patrick's ask, same session as the fresh-history reset)

## The ask

Patrick asked whether the app could become a native desktop program, first thinking of Electron, then choosing Tauri once the trade was laid out: a much smaller install and a lighter process, in exchange for the shell being Rust rather than Node. He also wanted the installer signed, and the signing question turned into a licensing one — the repo is public under Apache 2.0, which qualifies it for the SignPath Foundation's free open-source signing.

## What was built

The architecture hedge from [06](06-grilling-platform-and-stack.md) paid out exactly as written: the page is untouched, and the whole desktop build is a second implementation of the `Platform` interface plus the Rust that backs it.

- **`src-tauri/`** is the shell. `folder.rs` does the disk work — paths resolved under the picked root and refused if they could escape it, writes landing in a swap file that is flushed and renamed over the target, listing, existence, deletion. `watch.rs` runs one `notify` watcher per opened folder, coalesces its raw events for a quarter second, and emits root-relative forward-slashed paths as a `folder-changed` event. `recents.rs` keeps opened folders as `recents.json` in the app's data directory, so a remembered folder reopens with no permission prompt. `lib.rs` exposes fourteen commands and refuses any root the page didn't open through the picker or the recents list.
- **`src/adapters/tauri.ts`** is the bridge: `TauriFileAccess`, `TauriFolderWatcher`, and `tauriPlatform()`, each call carried to its command. Binary writes travel as the raw request body with root and path percent-encoded into headers, so a folder under a non-ASCII user name survives the trip. The keystroke journal stays in IndexedDB — WebView2 has one — keyed by the folder's absolute path.
- **`src/main.tsx`** picks the platform at startup with `isTauri()`. One build, two homes.
- The swap files carry Chromium's `.crswap` suffix on purpose: the app already excludes that suffix from the watcher, from commits, and from exports, so the desktop build inherits every exclusion without a line changing above the adapter.
- **`.github/workflows/release.yml`** runs when a release is published on GitHub (or by hand with a tag, to attach a build to an existing release after the fact), runs both test suites first, builds the NSIS installer, uploads it as an artifact, signs it through SignPath when four repository settings exist (three variables and one secret, named in the README), and uploads whichever installer resulted onto that release. Patrick's call: publish the release first, let the workflow fill it in.

Tests: 8 in `src/adapters/tauri.test.ts` (the IPC contract, faked at `invoke`/`listen`), 8 in Rust (`pnpm test:rust`: path refusal, atomic write, listing, binary round trip, forgiving delete, recents ordering, relative paths, percent decoding). 387 vitest green. `pnpm tauri build --bundles nsis` produces the installer.

## Decisions

- **Tauri over Electron.** Patrick's call after the trade was explained. Install size and process weight won; the Rust is a few hundred lines and none of it is clever.
- **Custom commands over the fs plugin.** Tauri's fs plugin scopes paths through a permission system that doesn't persist across restarts without a further plugin and has no atomic write. Commands over a registry of opened roots are simpler, testable with plain `cargo test`, and match the browser adapter's semantics line for line.
- **The picker runs in Rust.** The dialog plugin is called from the shell, not from the page, so the set of folders the page may touch is decided on the Rust side. The npm half of the dialog plugin was removed for the same reason.
- **Secrets unchanged for now.** The GitHub token stays in localStorage, which in the desktop build is WebView2's own store under the app's data directory. Moving it and the coach's future model key into the Windows credential store (the `keyring` crate) is the natural next ticket, not this one.
- **Signing is opt-in.** The workflow publishes unsigned until SignPath is configured; for a build Patrick runs himself, SmartScreen's one "Run anyway" click is the whole cost. Buying a certificate was ruled out for now: a self-issued one is trusted only where it's installed, and a domain has nothing to do with it.

## Deliberately left

No native menu bar yet. (Icons landed the same evening: Patrick drew `storyboarder.png`, padded to a 1024px square as `src-tauri/icons/source.png`, and `pnpm tauri icon` rendered every size from it — rerun that command after changing the source.) No auto-update (Tauri's updater has its own free minisign keypair, separate from Authenticode). The sample story `EmbersOfTheVault` is committed as a nested-repository pointer rather than files, so it's empty on GitHub — Patrick's to decide whether to flatten it.
