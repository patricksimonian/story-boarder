# 08 — Prototype: the board home view and scene drill-in

Type: prototype
Status: resolved

## Question

Does the board-as-home design ([04](04-grilling-mvp-feature-set.md)) feel right in the hand — acts as columns, storylines as colored lanes, scenes as cards, idea pool docked, one-click drill-in to a distraction-free scene editor (synopsis / beats / prose per the schema in [05](05-grilling-domain-model-and-file-format.md))?

Build a throwaway interactive prototype via `/prototype` (static HTML with sample story data is fine — no persistence, no engine) and have Patrick react to it: information density, lane/column readability with a scene in two storylines, how the pool sits beside the spine, and what the drill-in transition feels like. Capture reactions as the resolution; link the prototype as an asset.

## Asset

Prototype: `board-and-editor.prototype.html`, preserved on the throwaway branch `prototype/08-board-and-editor` (it no longer sits in main's working tree). To open it: `git show prototype/08-board-and-editor:.scratch/storyline-app/prototypes/board-and-editor.prototype.html > proto.html && start proto.html` — standalone HTML, Edge/Chrome. Sample story ("Embers of the Vault") exercises every probe in the question: two dual-storyline scenes (*The Job Offer* — Heist+Mara; *Crossfire at the Tide-Gate* — Mara+Rebellion), conditions/effects/chance/choices on cards, four pool scenes including a storylet.

## Reactions — v1 (2026-08-26)

v1 offered three flat variants (A lane grid / B tracks / C act bands). Patrick: "the structure is there but the user experience is terrible."

- **B (Tracks) is the view he wants first** — the home view, not one option of three.
- The board should be **zoomable**: a zoomed-out view in the spirit of A/C, plus views that zoom into a single act.
- B needs a **zoomed navigation scroller along the bottom** showing current scroll position relative to the whole story — with an easy way to index things, since the tracks scroll far horizontally.

## v2 (2026-08-26) — rebuilt around zoom levels

- **Tracks is home.** Bottom **minimap navigator**: the whole story in miniature (lane-colored dots, spanning shared scenes, act separator lines), a viewport rectangle live-tracking scroll, drag/click to move, clickable act labels as the index, hover a dot for the scene title. Vertical mouse wheel scrolls the tracks horizontally; ←/→ jump act-by-act.
- **Zoom out → Overview**: compact acts × storylines grid (v1's A, densified, title-only cards).
- **Zoom in → Act view**: one act, prose-forward cards (v1's C cards) grouped by storyline lane, ‹/› or ←/→ to step between acts. ⤢ on any act header (Tracks or Overview) zooms in.
- **Esc walks up a level**: editor → act → tracks. View state lives in the URL.
- **Idea pool** became a toggleable right-hand drawer, identical in every view (v1's three different docks were part of the UX noise).
- Drill-in kept as the **slide-over editor** from B.

## Reactions — v2 (2026-08-26)

"The idea is a bit better. Again the navigation is terrible."

- **Navigation belongs in a sidebar**, not a floating bottom pill.
- **The Overview is fine** as-is.
- **"Tracks" should be called "Storylines"** — the glossary term (my invented term violated the ubiquitous language in [/CONTEXT.md](../../../CONTEXT.md)).
- **The bottom minimap on the home view is great**, but the bars were far too big — should be slim, ~15px wide.
- **Color coding alone is illegible**: nothing tells you which color is The Heist vs Mara's Trust vs The Rebellion. Needs a small graphic keying each storyline.

## v3 (2026-08-26)

- **Left sidebar** is now the navigation: Storylines (home) / Overview, an Acts list (each opens that act's zoom view, active state tracked), a storyline legend, and the Idea pool toggle. Floating pill removed.
- **"Tracks" → "Storylines"** everywhere user-visible; `#view=tracks` still accepted as a legacy URL.
- **Minimap bars** are now slim fixed ~14px marks at each scene's position; the minimap also gained its own left legend column with each storyline's glyph + name aligned to its row of marks.
- **Storyline identity no longer rides on color alone**: each storyline has a glyph (◆ The Heist, ● Mara's Trust, ▲ The Rebellion) shown in the sidebar legend, lane labels, minimap legend, act-view card chips, spanning-card headers, shared-scene notes, and the editor.

## Reactions — v3 (2026-08-26)

- **Shared-scene edge case**: joining the cards themselves is wrong — it only works for visually adjacent lanes, and a scene can belong to storylines whose lanes are separated on screen. "A line should connect them, not the cards" — even adjacent lanes should be bridged by a connection.
- **Minimap spacing**: gaps between marks were far too wide — it's supposed to be very condensed, ~10px spacing.

## v4 (2026-08-26)

- **Shared scenes = card + bridge**: on Storylines, a shared scene renders once, on its first-listed storyline's lane, with a vertical connector line dropping/rising to each other lane it belongs to, ending in a ring-shaped anchor in that lane's color (clickable — opens the same scene; tooltip names the shared lane). Works identically for adjacent and non-adjacent lanes; the spanning-card hack is gone. *Ashes or Embers* is now Heist+Rebellion — lanes separated by Mara's — so a bridge visibly crosses an intermediate lane.
- **Minimap condensed**: marks sit at a fixed ~24px pitch (14px mark, ~10px gap) instead of stretching across the strip; the strip is only as wide as the story needs, and the viewport rectangle, drag, and act-label jumps all use the same scale. Shared scenes mirror the board: full-size mark on the primary row, thin line, small mark on the other row.

## Reactions — v4 (2026-08-26)

- The card + anchor-dot reading of "bridge" was **incorrect**: Patrick wants a **full card in each storyline lane** the scene belongs to, with a line connecting the cards — the connection is the line, but every membership still gets a card.
- Bug: the connector line overshot the cards by ~50% of a card height (it spanned the full lane rows instead of stopping at the cards).

## v4.1 (2026-08-26)

- Shared scenes now render a **full, equal card in every member lane** at the same column (each copy border-colored to its lane, glyph row showing all memberships; clicking any copy opens the same scene). The connector line runs **card-center to card-center** — the cards sit above it in z-order, so it visually terminates at the cards' edges with no overshoot. Non-adjacent case unchanged: *Ashes or Embers* bridges across Mara's lane.
- Minimap mirrors: a full-size mark on every member row with a thin line between.
- This drops the "primary lane" concept from the board's visual grammar (all copies equal) — `storylines[0]` now only decides which copy feeds the minimap, not prominence. Worth noting for issue 05: the schema's storyline order no longer needs to imply a home lane.

## Resolution (2026-08-26) — approved at v4.1 ("i like it")

The board-as-home question is answered, in a design that evolved substantially from the ticket's original sketch. Validated for the spec ([10](10-task-assemble-spec-and-build-plan.md)):

1. **Storylines view is home**: subway-style horizontal lanes (one per storyline, glyph + color + name label), compact scene nodes on the lines, act boundaries as labeled dashed rules, horizontal scroll (mouse wheel maps to it; ←/→ jump act to act).
2. **Zoom levels, not view variants**: Overview (compact acts × storylines grid) above, single-act view (prose-forward cards grouped by storyline) below, slide-over distraction-free editor at the bottom. Esc walks up one level. ⤢ on act headers zooms in. View state in the URL.
3. **Left sidebar is the navigation**: views, acts list, storyline legend, idea-pool toggle. The pool is a right-hand drawer, identical in every view.
4. **Condensed minimap navigator** on the home view: fixed ~24px pitch marks (~10px gaps), strip only as wide as the story, live viewport rectangle, drag/click to move, clickable act labels as index, per-row storyline legend, hover for scene titles.
5. **Shared scenes**: a full, equal card in *every* member lane at the same column, joined by a connector line running card-to-card (never merged cards, never overshooting) — works for adjacent and non-adjacent lanes. All memberships equal: no "home lane" semantics; `storylines[0]` carries no meaning beyond file order (note carried to the spec re [05](05-grilling-domain-model-and-file-format.md)).
6. **Storyline identity is glyph + color, never color alone** (◆ ● ▲ as placeholders; real app should let the author pick the glyph per storyline).
7. **Terminology**: the home view is called *Storylines* — glossary terms from [/CONTEXT.md](../../../CONTEXT.md) are binding on UI naming.

Prototype capture: the asset above is the primary source. Done at Stage 0 bootstrap (2026-08-26): the repo exists, the prototype is committed on `prototype/08-board-and-editor`, and the asset link above points there.
