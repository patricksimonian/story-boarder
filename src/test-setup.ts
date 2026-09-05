import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/dom'

// waitFor and find* ride this; the default second loses races against a
// loaded machine, and a genuinely wrong assertion still fails — later.
configure({ asyncUtilTimeout: 5000 })

// ProseMirror (under TipTap) asks the DOM for geometry jsdom never
// computes. Empty answers keep it running; nothing here measures layout.
if (typeof document.elementFromPoint !== 'function') {
  document.elementFromPoint = () => null
}
// jsdom has no DragEvent, so drag events would fall back to a plain Event
// with no pointer position or modifier keys. A MouseEvent carries both;
// testing-library attaches the dataTransfer itself.
if (typeof (globalThis as { DragEvent?: unknown }).DragEvent !== 'function') {
  ;(globalThis as { DragEvent: unknown }).DragEvent = class DragEvent extends MouseEvent {}
}
// React Flow measures nodes through ResizeObserver and reads the pan/zoom
// transform through DOMMatrixReadOnly, neither of which jsdom has. These
// stand-ins report every node as 1×1 at scale 1 — enough for nodes to
// count as measured, so edges render and clicks land.
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver !== 'function') {
  type Entry = { target: Element; contentRect: DOMRect }
  ;(globalThis as { ResizeObserver: unknown }).ResizeObserver = class ResizeObserver {
    callback: (entries: Entry[], observer: unknown) => void
    constructor(callback: (entries: Entry[], observer: unknown) => void) {
      this.callback = callback
    }
    // A real observer reports after layout, once the observer's owner has
    // finished mounting; reporting synchronously would land before React
    // Flow knows its own container and be discarded.
    observe(target: Element) {
      setTimeout(() => this.callback([{ target, contentRect: new DOMRect(0, 0, 1, 1) }], this), 0)
    }
    unobserve() {}
    disconnect() {}
  }
}
if (typeof (globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly !== 'function') {
  ;(globalThis as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = class DOMMatrixReadOnly {
    m22: number
    constructor(transform?: string) {
      const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1]
      this.m22 = scale === undefined ? 1 : Number(scale)
    }
  }
}
// jsdom has no object URLs; the mood board only needs a src string.
if (typeof URL.createObjectURL !== 'function') {
  let n = 0
  URL.createObjectURL = () => `blob:jsdom-${n++}`
  URL.revokeObjectURL = () => {}
}
Object.defineProperties(HTMLElement.prototype, {
  offsetHeight: { configurable: true, get: () => 1 },
  offsetWidth: { configurable: true, get: () => 1 },
})
;(SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () => new DOMRect()
if (typeof Range.prototype.getClientRects !== 'function') {
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
}
