/**
 * The domain model, named per the binding glossary in /CONTEXT.md.
 * Shapes mirror what's on disk (spec: "What's on disk"); disk is always
 * the source of truth.
 */

/** Ids are slugs, stable after creation — renaming changes display titles only. */
export type Slug = string

/**
 * Conditions and effects live in files as readable strings
 * (`trust >= 3 and not mara_dead`). They parse into a typed AST at load;
 * the AST types arrive with the engine stage.
 */
export type ConditionSource = string
export type EffectSource = string

/** A declarative selection weight, in the quality-based-narrative tradition. */
export type Chance = number

// ---------------------------------------------------------------------------
// story.json — the manifest
// ---------------------------------------------------------------------------

export interface StoryManifest {
  title: string
  /** Ordered — acts are time-groupings shared across storylines. */
  acts: Act[]
  /** Ordered as the lanes appear on the board. */
  storylines: Storyline[]
  settings: StorySettings
}

/** Shape deliberately open until a build stage needs a concrete setting. */
export type StorySettings = Record<string, unknown>

export interface Act {
  id: Slug
  title: string
}

export interface Storyline {
  id: Slug
  name: string
  /** Identity never rides on color alone — glyph and color travel together. */
  color: string
  glyph: string
  /** Scene order lives here, never in filenames. */
  scenes: Slug[]
}

// ---------------------------------------------------------------------------
// scenes/<slug>.md — frontmatter + Synopsis / Beats / Prose body
// ---------------------------------------------------------------------------

export interface Scene {
  id: Slug
  title: string
  /**
   * Memberships, all equal — no home lane; file order carries no meaning.
   * Empty means the scene floats in the idea pool. A loose scene with a
   * condition is a storylet: a usage pattern, never a type.
   */
  storylines: Slug[]
  act?: Slug
  tags: string[]
  /** Characters appearing in the scene, by slug. */
  characters: Slug[]
  /** The engine attaches at scene altitude only — never to beats. */
  condition?: ConditionSource
  effects: Effect[]
  choices: Choice[]
  /** Weight when this is a loose scene selected by chance. */
  chance?: Chance
  synopsis: string
  beats: Beat[]
  prose: string
  /** Attached images — the mood board. Story-folder-relative paths under assets/. */
  images: string[]
  /**
   * Frontmatter fields the app has no name for — a writer's own additions.
   * Carried through every save untouched; present only when there are any.
   */
  extra?: Record<string, unknown>
}

/**
 * The smallest unit of story change, ordered inside its scene. On disk a
 * beat is one list item under `## Beats` — no id; position is identity.
 */
export type Beat = string

export interface Effect {
  source: EffectSource
  /** 1-based beat number cited as narrative anchor — bookkeeping only; evaluation stays scene-level. */
  anchor?: number
}

/** A directed scene-to-scene link the player or the simulation takes. */
export interface Choice {
  label: string
  to: Slug
  condition?: ConditionSource
  effects: Effect[]
  chance?: Chance
}

// ---------------------------------------------------------------------------
// variables.json — the registry. Only declared variables exist.
// ---------------------------------------------------------------------------

export type Variable = (
  | { id: Slug; type: 'boolean'; initial: boolean }
  | { id: Slug; type: 'number'; initial: number }
  | { id: Slug; type: 'enum'; values: string[]; initial: string }
) & {
  /** What this variable means in the story, in the writer's words. */
  description?: string
}

export interface VariableRegistry {
  variables: Variable[]
}

export type VariableValue = boolean | number | string
export type VariableState = Record<Slug, VariableValue>

// ---------------------------------------------------------------------------
// characters/ places/ lore/ — reference entities, one file per slug
// ---------------------------------------------------------------------------

export type ReferenceKind = 'character' | 'place' | 'lore'

export interface ReferenceEntity {
  kind: ReferenceKind
  id: Slug
  title: string
  tags: string[]
  /** Attached images — the mood board. Story-folder-relative paths under assets/. */
  images: string[]
  /** Other strings that name this thing in prose — "the smith", "Rook of Tanner's Row". */
  aliases: string[]
  body: string
}

// ---------------------------------------------------------------------------
// mentions.json — the writer's own verdicts on what a phrase means
// ---------------------------------------------------------------------------

/** `kind:id` — a character, place, lore page, note, scene, or variable. */
export type TargetKey = string

export interface Verdict {
  quote: string
  /** What the phrase means here, or null: not a mention at all. */
  entity: TargetKey | null
  by: 'writer' | 'model'
}

/** Verdicts per item, the item keyed like a target (`scene:cold-city`, `note:timeline`). */
export type VerdictStore = Record<TargetKey, Verdict[]>

// ---------------------------------------------------------------------------
// notes/<slug>.md — the story's notebook: freeform pages, grouped by section
// ---------------------------------------------------------------------------

/** A freeform page of unstructured writing. Belongs to the story, never to a scene. */
export interface Note {
  id: Slug
  title: string
  /** The named group this note sits under; absent means unsorted. */
  section?: string
  tags: string[]
  body: string
}

// ---------------------------------------------------------------------------
// playthroughs/<name>.json — saved walks kept as test cases
// ---------------------------------------------------------------------------

export interface Playthrough {
  name: string
  steps: PlaythroughStep[]
}

export interface PlaythroughStep {
  /** The scene entered at this step. */
  scene: Slug
  /** The label of the choice taken to get here, when a choice was taken (choices have no ids). */
  choice?: string
  /** Variable state after entering — the scene's effects applied. */
  state: VariableState
}

// ---------------------------------------------------------------------------
// The loaded story — everything the app holds in memory for one story folder
// ---------------------------------------------------------------------------

export interface Story {
  manifest: StoryManifest
  scenes: Map<Slug, Scene>
  references: Map<Slug, ReferenceEntity>
  notes: Map<Slug, Note>
  registry: VariableRegistry
  playthroughs: Playthrough[]
  /** The writer's verdicts from mentions.json; the model's never land here. */
  verdicts: VerdictStore
}
