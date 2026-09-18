/* ==========================================================================
   AURELIA — Unified smooth-scroll store.

   One rAF driver produces a single eased scroll value that BOTH the WebGL
   scene and the DOM overlays read from. That shared clock is what makes the
   typography and the camera feel welded together instead of drifting apart.
   ========================================================================== */

export type ScrollListener = (smooth: number, velocity: number) => void

const listeners = new Set<ScrollListener>()

let raw = 0 // instantaneous 0..1 from the scrollbar
let smooth = 0 // eased 0..1 — the value everything animates against
let velocity = 0 // d(smooth)/frame, used for motion-reactive flourishes
let running = false
let enabled = false

/* Exponential smoothing expressed as a HALF-LIFE in seconds rather than a
   per-frame fraction. The old code lerped by a fixed 0.085 every frame and
   the comment claimed it was frame-rate normalised, but it never was: the
   same 26 frames to converge means 181ms at 144Hz and 867ms at 30Hz. Worse,
   any fps dip mid-scroll silently changed the easing rate, which is what
   read as jerk. Converting to a half-life and deriving the per-frame factor
   from real elapsed time makes the FEEL identical at any frame rate and
   immune to dropped frames. */
const HALF_LIFE = 0.11 // seconds for the remaining distance to halve

/* The narrative is measured against the .home-page track ONLY, not the whole
   document. The frosted footer lives below that track, so scoping this way
   means the AURELIA finale has fully resolved by the time the footer starts
   sliding up over the canvas — the two never fight for the same pixels. */
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

  /* Real elapsed seconds, clamped so a background tab or a long GC pause
     cannot teleport the scroll position when the page regains focus. */
  const t = typeof now === 'number' ? now : performance.now()
  const dt = lastT ? Math.min((t - lastT) / 1000, 0.1) : 1 / 60
  lastT = t

  const prev = smooth
  // k = 1 - 2^(-dt/halfLife): the frame-rate independent form of a lerp.
  const k = 1 - Math.pow(2, -dt / HALF_LIFE)
  smooth += (raw - smooth) * k

  // Snap out the last sliver so we can settle exactly on 0 and 1.
  if (Math.abs(raw - smooth) < 0.00002) smooth = raw

  /* Velocity is normalised to per-60fps-frame so downstream flourishes keep
     the same magnitude they were tuned against, regardless of real fps. */
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
  /** Begin tracking. Called once the user has entered the experience. */
  start() {
    if (enabled) return
    enabled = true
    trackEl = null // the .home-page track only mounts on entry
    measure()
    if (!running) {
      running = true
      requestAnimationFrame(tick)
    }
  },

  /** Freeze at zero (pre-entry, while the hero is locked). */
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

/* ── Timeline ──────────────────────────────────────────────────────────────
   Single source of truth for the whole narrative. Both the camera rig and the
   DOM overlays import these, so a tweak here moves everything in lockstep.
   ────────────────────────────────────────────────────────────────────────── */
export const TL = {
  /** Phase 1 — the world ROTATES. No vertical travel at all. */
  rotate: { start: 0.0, end: 0.3 },
  /** The four rotation words. These are 3D meshes in the scene, parked behind
      the jellyfish at 90° intervals; visibility is driven by camera angle,
      not by a scroll window, so they crossfade as the world turns. */
  turns: [
    { word: 'DESIGN' },
    { word: 'TO DELIGHT' },
    { word: 'TO ACHIEVE' },
    { word: 'TO ACCOMPLISH' },
  ],
  /** Phase 2 — the ascent, 3D word sculptures drifting past. */
  ascend: { start: 0.3, end: 0.58 },
  /** Phase 3 — four rotating glass project rings, jellyfish shrinking. */
  rings: { start: 0.58, end: 0.82 },
  /** Phase 4 — camera detaches and settles on AURELIA. */
  finale: { start: 0.82, end: 1.0 },
} as const

/** World-space Y coordinates the scene is laid out along. */
export const WORLD = {
  heroY: 0,
  ascendTopY: 18,
  /* Rings sit 5.5 apart rather than 9, so they read as one tight cluster the
     jellyfish threads through instead of four isolated events. */
  /* All four rings sit inside ONE short stretch of world: 3.4 units apart, so
     the whole set spans 10.2 units and the jellyfish crosses them as a single
     continuous run rather than four separate scroll events. Paired with the
     smaller RING_R this reads as one "projects" section. */
  ringY: [21, 24.4, 27.8, 31.2],
  ringsExitY: 34.6,
  aureliaY: 39,
} as const

/* Anchor angles for the four rotation words, in radians around the orbit.
   Word 0 sits at 0 rad so DESIGN is already facing you when phase 1 begins,
   then every 90° of rotation swings the next word round to face the camera. */
export const TURN_ANCHORS = [0, 1, 2, 3].map((i) => i * (Math.PI / 2))

export const PROJECTS = [
  { id: '01', title: 'NOOMO BEAT', category: 'GENERATIVE AUDIO / WEBGL' },
  { id: '02', title: '3D CONFIGURATOR', category: 'REALTIME PRODUCT GLASS' },
  { id: '03', title: 'INTEL · AI.IO', category: 'COMPUTER VISION KIOSK' },
  { id: '04', title: 'THE SILLY BUNNY', category: 'WEBAR / MIXED REALITY' },
] as const

/* ── Easing helpers shared by the DOM + WebGL layers ────────────────────── */
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const norm = (v: number, a: number, b: number) => clamp01((v - a) / (b - a))
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
export const easeInCubic = (t: number) => t * t * t
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
