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
