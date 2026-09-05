# Story Boarder
<img src="./storyboarder.png" alt="story board icon" width="120">

A local-first app for writing a video game's story — structure, prose, characters, world, and a declarative conditions engine — stored as plain md files.
> This was primarily built by Claude and it smells and tastes like it unfortunately. I've done my best to play through the tool and adjust wording so it sounds less gross. The utility of the tool has been great and accomplished my primary goal which was for someone whos new to organizing storylines to dive into a tool with little experience and have an enjoyable time putting pen to paper. 

## Running it

```
pnpm install
pnpm dev
```

Target browsers are Edge and Chrome on Windows 11 — the app leans on the File System Access API, which is Chromium-only.

`pnpm test` runs the vitest suite, `pnpm build` typechecks and bundles, `pnpm lint` runs oxlint.
