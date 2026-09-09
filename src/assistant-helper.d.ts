/** The helper is plain JavaScript; this is the shape the tests lean on. */
declare module '*assistant.mjs' {
  import type { Server } from 'node:http'

  export interface Run {
    workflow: string
    model: string
    system: string
    briefing: string
    schema: Record<string, unknown>
  }
  export interface SpawnLike {
    (run: Run, opts: { signal?: AbortSignal; onLine?: (line: string) => void }): Promise<{ stdout: string; stderr: string; exitCode: number }>
  }

  export function createAssistant(opts?: { spawn?: SpawnLike; version?: () => Promise<string>; auth?: () => Promise<string>; origins?: string[] }): Server
  export function spawnClaude(run: Run, opts?: { signal?: AbortSignal; onLine?: (line: string) => void }): Promise<{ stdout: string; stderr: string; exitCode: number }>
  export function claudeArgs(run: Run): string[]
  export function acceptableRun(run: unknown): run is Run
  export function locateClaude(): { command: string; prefix: string[]; display: string } | null
  export const PORT: number
}
