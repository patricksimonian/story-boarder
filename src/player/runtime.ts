import type { Scene, Story, StoryManifest, VariableRegistry } from '../domain/types'
import { exits, roll, startSimulation, suggestedStart, take, type Exit, type Simulation } from '../engine/simulate'

/**
 * The playable export's runtime: the same eval-free engine the app's
 * simulator uses, walking the same Story shape, rendered as a page.
 * Boots from the #story-data island, renders into #player, fetches
 * nothing — it must work from file:// and under a strict CSP. Bundled
 * once by scripts/build-runtime.mjs into runtime.generated.js, which is
 * what exportPlayable inlines.
 */

interface StoryData {
  manifest: StoryManifest
  scenes: Scene[]
  registry: VariableRegistry
}

function boot(): void {
  const island = document.getElementById('story-data')
  const mount = document.getElementById('player')
  if (!island || !mount) return

  const data = JSON.parse(island.textContent ?? '') as StoryData
  const story: Story = {
    manifest: data.manifest,
    scenes: new Map(data.scenes.map((scene) => [scene.id, scene])),
    references: new Map(),
    notes: new Map(), // notes are the writer's, not the player's
    registry: data.registry,
    playthroughs: [],
  }
  const start = suggestedStart(story)
  if (start === undefined) {
    mount.textContent = 'This story has no scenes yet.'
    return
  }

  let sim = startSimulation(story, start)

  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    parent: Element,
    text?: string,
    className?: string,
  ): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag)
    if (text !== undefined) node.textContent = text
    if (className !== undefined) node.className = className
    parent.appendChild(node)
    return node
  }

  const render = (): void => {
    mount.textContent = ''
    el('h1', mount, story.manifest.title)

    for (const step of sim.steps) {
      const scene = story.scenes.get(step.scene)
      if (!scene) continue
      const section = el('div', mount, undefined, 'scene')
      el('h2', section, scene.title)
      for (const paragraph of scene.prose.split(/\n{2,}/)) {
        if (paragraph.trim() !== '') el('p', section, paragraph.trim())
      }
    }

    const list = exits(story, sim)
    const available = list.filter((exit) => exit.available)
    const choices = el('div', mount, undefined, 'choices')

    for (const exit of list) {
      const button = el('button', choices, exit.label)
      button.disabled = !exit.available
      if (!exit.available && exit.reason !== undefined) el('span', button, ` — ${exit.reason}`, 'closed')
      if (exit.available) {
        button.addEventListener('click', () => {
          sim = take(story, sim, exit)
          render()
        })
      }
    }

    if (available.some((exit) => exit.chance !== undefined)) {
      const rollButton = el('button', choices, '🎲 Roll')
      rollButton.addEventListener('click', () => {
        const picked: Exit | undefined = roll(story, sim)
        if (picked) {
          sim = take(story, sim, picked)
          render()
        }
      })
    }

    if (available.length === 0) el('p', mount, 'The story rests here.', 'ended')

    const restart = el('button', mount, 'Start over')
    restart.addEventListener('click', () => {
      sim = startSimulation(story, start) as Simulation
      render()
    })
  }

  render()
}

boot()
