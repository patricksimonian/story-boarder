/**
 * A storyline's suggested color comes from its name: the name hashes to
 * a hue, held at a saturation and lightness that sit well on the paper
 * palette. If that hue lands within 30° of a color already in use, it
 * steps around the wheel by the golden angle until it finds clear air —
 * identity never rides on color alone, but colors still shouldn't twin.
 */

const SATURATION = 58
const LIGHTNESS = 55
const MIN_HUE_GAP = 30
const GOLDEN_ANGLE = 137.5

export function colorForName(name: string, usedColors: string[]): string {
  const usedHues = usedColors.map(hueOf)
  let hue = hashHue(name)
  for (let attempt = 0; attempt < 24 && tooClose(hue, usedHues); attempt++) {
    hue = (hue + GOLDEN_ANGLE) % 360
  }
  return hslToHex(hue, SATURATION, LIGHTNESS)
}

function tooClose(hue: number, usedHues: number[]): boolean {
  return usedHues.some((used) => {
    const apart = Math.abs(hue - used)
    return Math.min(apart, 360 - apart) < MIN_HUE_GAP
  })
}

function hashHue(name: string): number {
  let hash = 2166136261
  for (const char of name.trim().toLowerCase()) {
    hash ^= char.codePointAt(0) as number
    hash = Math.imul(hash, 16777619)
  }
  return ((hash % 360) + 360) % 360
}

export function hueOf(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  let hue: number
  if (max === r) hue = ((g - b) / d) % 6
  else if (max === g) hue = (b - r) / d + 2
  else hue = (r - g) / d + 4
  return ((hue * 60) % 360 + 360) % 360
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100
  const light = l / 100
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = light - sat * Math.min(light, 1 - light) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}
