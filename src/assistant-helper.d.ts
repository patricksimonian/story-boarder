/** The helper is plain JavaScript; this is the shape the tests lean on. */
declare module '*assistant.mjs' {
  import type { Server } from 'node:http'

  export interface SpawnLike {
    (argv: string[], stdin: string, opts: { signal?: AbortSignal; onLine?: (line: string) => void }): Promise<{ stdout: string; stderr: string; exitCode: number }>
  }

  export function createAssistant(opts?: { spawn?: SpawnLike; version?: () => Promise<string>; auth?: () => Promise<string>; origins?: string[] }): Server
  export function spawnClaude(argv: string[], stdin: string, opts?: { signal?: AbortSignal; onLine?: (line: string) => void }): Promise<{ stdout: string; stderr: string; exitCode: number }>
  export function locateClaude(): { command: string; prefix: string[]; display: string } | null
  export const PORT: number
}
