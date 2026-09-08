# Story Boarder
<img src="./storyboarder.png" alt="story board icon" width="120">

A local-first app for writing a video game's story — structure, prose, characters, world, and a declarative conditions engine — stored as plain md files.
> This was primarily built by Claude and it smells and tastes like it unfortunately. I've done my best to play through the tool and adjust wording so it sounds less gross. The utility of the tool has been great and accomplished my primary goal which was for someone whos new to organizing storylines to dive into a tool with little experience and have an enjoyable time putting pen to paper. 

<img src="./storyboard-demo.png" alt="Story board profile" width="800">

## Motivation

DevOps, Software Development, to me, is a creative process. There are always problems to solve and folks in these domains need to come up with creative solutions. I wanted to test creativity in another form - story telling. After doing research I came upon this concept of storyboard based authoring which seemed like an excellent way to organize thoughts and connect logic in ways that made sense from an author's perspective and not an engineer. This solution is rough around the edges but it works for me and I like it. It combines features from various storyboarding platforms that I liked. Please enjoy - royalty free yay!

## Running it

```
pnpm install
pnpm dev
```

Target browsers are Edge and Chrome on Windows 11 — the app leans on the File System Access API, which is Chromium-only.

`pnpm test` runs the vitest suite, `pnpm build` typechecks and bundles, `pnpm lint` runs oxlint.

## Building

Web build to `dist/`:

```
pnpm build
```

Desktop build (Windows): needs Rust (`winget install Rustlang.Rustup`), the Visual Studio C++ build tools, and the WebView2 runtime.

```
pnpm desktop          # dev window with hot reload
pnpm desktop:build    # installer → src-tauri/target/release/bundle/nsis/
pnpm test:rust        # shell tests
```

Icon: edit `src-tauri/icons/source.png` (square), run `pnpm tauri icon src-tauri/icons/source.png`, then touch `src-tauri/build.rs` before building so the exe picks it up.

### When the desktop app misbehaves

The page inside the window is the same app as the browser build, and it fails the same ways — but a release build has no console to read. Three places to look:

- **Ctrl+Shift+I** opens the webview inspector in any build, release included. Uncaught errors and unhandled rejections show up on its console.
- **The log file** at `%LOCALAPPDATA%\io.github.patricksimonian.storyline\logs\storyline.log` gets the same errors from the page, plus the shell's own, whether or not the inspector was open at the time.
- **The sidebar** says when a commit couldn't be written (beside History) and why an export failed (under the export button). The checkpoint dialog keeps its reason too.

`pnpm desktop:smoke <story folder>` drives a real build end to end — opens a copy of the folder, waits for the opening commit, exports the playable HTML, commits a checkpoint — and fails on any console error the page raised along the way. It works on a copy under the temp directory and never touches the folder you name. `--debug` runs the debug build against `pnpm dev` instead. The Rust side has its own tests (`pnpm test:rust`), which drive every command through the real IPC path with no window.

Version: `package.json` is the only place it lives (Tauri reads it from there; the page shows it). Bump with `pnpm version x.y.z`, then tag `vx.y.z` (or `x.y.z`; the workflow accepts either) — the workflow refuses a tag that names another version.

Release: publish a GitHub release and `.github/workflows/release.yml` builds and attaches the installer, signed through SignPath once the `SIGNPATH_*` repository variables and `SIGNPATH_API_TOKEN` secret exist. Run the workflow by hand with a tag to attach a build to an existing release.


## To Dos

- syntax highlighting in prose for cross referencing prose to notes/library/variables etc 
    - A workflow processes prose and matches with known themes/titles in library/notes/scenes
    - an ai workflow (like haiku) if predicts whether a token best matches a character, a lore item, a place for example
    - a user can hover and click, a tool tip opens up with context on the connection and allows the user to navigate to the context. 
- on the dynamic coaching, is not only variable prediction/settings/guidance within a scene, also continouty checking, and a logging of developments such as events, character changes, etc. This allows the user to make sure their story is consistent without loopholes, errors in contionuty, or contradictions.
