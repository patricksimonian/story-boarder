---
id: the-vault-door
storylines: [heist]
act: act-3
tags: [climax, choice]
characters: [rook, mara, the-warden]
choices:
  - label: Trust Mara with the final tumbler
    to: embers
    condition: trust >= 4
    effects: [mara_alive = true]
  - label: Take the Warden's offer and seal the door
    to: embers
    effects: [mara_alive = false, trust = 0]
---

# The Vault Door

## Synopsis

The last tumbler needs two hands and total trust — or one hand and none. The Warden's voice comes through the speaking-tube with an offer for whoever betrays first.

## Beats

1. The door is older than the city's founding lie.
2. The two-hand tumbler: one turns, one holds. Neither can see the other's work.
3. The Warden, through the speaking-tube: amnesty, and the other's share, for whoever walks away first.

## Prose

The door did not look like a door. It looked like the idea the city had copied all its doors from and then apologized to.
