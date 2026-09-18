export type ScrollListener = (smooth: number, velocity: number) => void

const listeners = new Set<ScrollListener>()

let raw = 0
let smooth = 0
let velocity = 0
let running = false
let enabled = false

const HALF_LIFE = 0.11

let trackEl: HTMLElement | null = null

function measure() {
  if (!trackEl || !trackEl.isConnected) {
    trackEl = document.querySelector<HTMLElement>('.home-page')
  }

  const max = trackEl
    ? trackEl.offsetHeight - window.innerHeight
    : document.documentElement.scrollHeight - window.innerHeight

  raw = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0
}

let lastT = 0

function tick(now?: number) {
  if (!running) return
  requestAnimationFrame(tick)

  const t = typeof now === 'number' ? now : performance.now()
  const dt = lastT ? Math.min((t - lastT) / 1000, 0.1) : 1 / 60
  lastT = t

  const prev = smooth

  const k = 1 - Math.pow(2, -dt / HALF_LIFE)
  smooth += (raw - smooth) * k

  if (Math.abs(raw - smooth) < 0.00002) smooth = raw

  velocity = dt > 0 ? (smooth - prev) * (1 / 60 / dt) : 0
  if (smooth !== prev || velocity !== 0) {
    listeners.forEach((fn) => fn(smooth, velocity))
  }
}

function onScroll() {
  if (!enabled) return
  measure()
}

export const scrollStore = {

  start() {
    if (enabled) return
    enabled = true
    trackEl = null
    measure()
    if (!running) {
      running = true
      requestAnimationFrame(tick)
    }
  },

  reset() {
    raw = 0
    smooth = 0
    velocity = 0
    listeners.forEach((fn) => fn(0, 0))
  },

  subscribe(fn: ScrollListener) {
    listeners.add(fn)
    fn(smooth, velocity)
    return () => {
      listeners.delete(fn)
    }
  },

  get smooth() {
    return smooth
  },
  get raw() {
    return raw
  },
  get velocity() {
    return velocity
  },
}

if (typeof window !== 'undefined') {
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
  running = true
  requestAnimationFrame(tick)
}

export const TL = {

  rotate: { start: 0.0, end: 0.3 },

  turns: [
    { word: 'DESIGN' },
    { word: 'TO DELIGHT' },
    { word: 'TO ACHIEVE' },
    { word: 'TO ACCOMPLISH' },
  ],

  ascend: { start: 0.3, end: 0.58 },

  rings: { start: 0.58, end: 0.82 },

  finale: { start: 0.82, end: 1.0 },
} as const

export const WORLD = {
  heroY: 0,
  ascendTopY: 18,

  ringY: [21, 24.4, 27.8, 31.2],
  ringsExitY: 34.6,
  aureliaY: 39,
} as const

export const TURN_ANCHORS = [0, 1, 2, 3].map((i) => i * (Math.PI / 2))

export const PROJECTS = [
  { id: '01', title: 'AURELIA BEAT', category: 'GENERATIVE AUDIO / WEBGL' },
  { id: '02', title: '3D CONFIGURATOR', category: 'REALTIME PRODUCT GLASS' },
  { id: '03', title: 'INTEL · AI.IO', category: 'COMPUTER VISION KIOSK' },
  { id: '04', title: 'THE SILLY BUNNY', category: 'WEBAR / MIXED REALITY' },
] as const

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const norm = (v: number, a: number, b: number) => clamp01((v - a) / (b - a))
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
export const easeInCubic = (t: number) => t * t * t
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
