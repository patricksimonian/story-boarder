import type { Effect, Scene } from '../domain/types'

/**
 * Beat edits for the editor. On disk a beat has no identity — its number
 * is its identity — while effects cite beats by that number as a
 * narrative anchor. So every edit that shifts positions rewrites the
 * anchors to follow their beats: an inserted beat pushes later anchors
 * down, a removed beat drops its own anchors (the effects stay), a moved
 * beat takes its anchors with it. All of these return a new scene.
 */

export function setBeat(scene: Scene, index: number, text: string): Scene {
  const beats = scene.beats.slice()
  beats[index] = text
  return { ...scene, beats }
}

export function insertBeat(scene: Scene, index: number, text = ''): Scene {
  const beats = scene.beats.slice()
  beats.splice(index, 0, text)
  return reanchor({ ...scene, beats }, (anchor) => (anchor > index ? anchor + 1 : anchor))
}

export function removeBeat(scene: Scene, index: number): Scene {
  const beats = scene.beats.slice()
  beats.splice(index, 1)
  const removed = index + 1
  return reanchor({ ...scene, beats }, (anchor) =>
    anchor === removed ? undefined : anchor > removed ? anchor - 1 : anchor,
  )
}

export function moveBeat(scene: Scene, from: number, to: number): Scene {
  const last = scene.beats.length - 1
  if (from === to || from < 0 || to < 0 || from > last || to > last) return scene
  const beats = scene.beats.slice()
  const [beat] = beats.splice(from, 1)
  beats.splice(to, 0, beat)
  const [f, t] = [from + 1, to + 1]
  return reanchor({ ...scene, beats }, (anchor) => {
    if (anchor === f) return t
    if (f < t && anchor > f && anchor <= t) return anchor - 1
    if (t < f && anchor >= t && anchor < f) return anchor + 1
    return anchor
  })
}

function reanchor(scene: Scene, map: (anchor: number) => number | undefined): Scene {
  const fix = (effect: Effect): Effect => {
    if (effect.anchor === undefined) return effect
    const anchor = map(effect.anchor)
    return anchor === undefined ? { source: effect.source } : { source: effect.source, anchor }
  }
  return {
    ...scene,
    effects: scene.effects.map(fix),
    choices: scene.choices.map((choice) => ({ ...choice, effects: choice.effects.map(fix) })),
  }
}
