import { useEffect, useRef } from 'react'
import { scrollStore, TL, PROJECTS, clamp01, norm, easeOutExpo, easeOutCubic } from '../scroll'

/* ==========================================================================
   ScrollNarrative — every overlay that rides the scroll timeline.

   This writes directly to style properties inside a rAF subscription rather
   than through React state. Re-rendering a tree on every frame is what makes
   scroll-driven typography feel gummy; mutating transforms keeps it glued to
   the WebGL camera, which is reading from the very same eased value.
   ========================================================================== */

interface Props {
  isEntered: boolean
}

export function ScrollNarrative({ isEntered }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isEntered) return
    const root = rootRef.current
    if (!root) return

    const q = <T extends HTMLElement>(sel: string) => Array.from(root.querySelectorAll<T>(sel))

    const ringEls = q<HTMLDivElement>('[data-ring]')
    const ringCounter = root.querySelector<HTMLElement>('[data-ring-counter]')
    const ringTitle = root.querySelector<HTMLElement>('[data-ring-title]')
    const ringCat = root.querySelector<HTMLElement>('[data-ring-cat]')
    const ringHud = root.querySelector<HTMLElement>('[data-ring-hud]')
    const ascentEls = q<HTMLDivElement>('[data-ascent]')
    const finale = root.querySelector<HTMLElement>('[data-finale]')
    const progressFill = root.querySelector<HTMLElement>('[data-progress-fill]')
    const progressLabel = root.querySelector<HTMLElement>('[data-progress-label]')
    const chapterEls = q<HTMLElement>('[data-chapter]')

    let lastRing = -1

    /* The narrative is pinned to the viewport while the footer scrolls up over
       it. Fade the whole layer out across the last stretch of the track so the
       HUD never sits on top of the footer. */
    let footerFade = 1
    const updateFooterFade = () => {
      const footer = document.querySelector<HTMLElement>('.home-footer')
      if (!footer) return
      const top = footer.getBoundingClientRect().top
      const vh = window.innerHeight
      // 1 while the footer is below the fold, 0 once it covers the top third.
      footerFade = clamp01((top - vh * 0.35) / (vh * 0.4))
      root.style.opacity = String(footerFade)
      root.style.visibility = footerFade < 0.01 ? 'hidden' : 'visible'
    }
    window.addEventListener('scroll', updateFooterFade, { passive: true })
    window.addEventListener('resize', updateFooterFade)
    updateFooterFade()

    const unsub = scrollStore.subscribe((s, vel) => {
      /* ── Phase 2: ascent captions ──────────────────────────────────────── */
      ascentEls.forEach((el) => {
        const a = parseFloat(el.dataset.start || '0')
        const b = parseFloat(el.dataset.end || '1')
        const p = (s - a) / (b - a)
        if (p < -0.1 || p > 1.1) {
          el.style.visibility = 'hidden'
          return
        }
        el.style.visibility = 'visible'
        const inP = easeOutExpo(clamp01(p / 0.28))
        const outP = easeOutCubic(clamp01((p - 0.7) / 0.3))
        const dir = el.dataset.side === 'right' ? 1 : -1
        el.style.opacity = String(inP * (1 - outP))
        el.style.transform = `translate3d(${(dir * (1 - inP) * 46 + dir * outP * 26).toFixed(2)}px, ${(-outP * 30).toFixed(2)}px, 0)`
        el.style.filter = `blur(${((1 - inP) * 8 + outP * 6).toFixed(2)}px)`
      })

      /* ── Phase 3: the glass rings HUD ──────────────────────────────────── */
      const inRings = s >= TL.rings.start - 0.03 && s <= TL.rings.end + 0.02
      if (ringHud) {
        const fade =
          easeOutCubic(clamp01((s - (TL.rings.start - 0.03)) / 0.05)) *
          (1 - easeOutCubic(clamp01((s - (TL.rings.end - 0.04)) / 0.06)))
        ringHud.style.opacity = String(inRings ? fade : 0)
        ringHud.style.visibility = inRings && fade > 0.01 ? 'visible' : 'hidden'
      }

      if (inRings) {
        const p = norm(s, TL.rings.start, TL.rings.end)
        const idx = Math.min(Math.floor(p * PROJECTS.length), PROJECTS.length - 1)
        if (idx !== lastRing) {
          lastRing = idx
          const proj = PROJECTS[idx]
          if (ringCounter) ringCounter.textContent = `0${idx + 1}`
          if (ringTitle) {
            ringTitle.textContent = proj.title
            ringTitle.classList.remove('is-swap')
            void ringTitle.offsetWidth
            ringTitle.classList.add('is-swap')
          }
          if (ringCat) ringCat.textContent = proj.category
        }
        ringEls.forEach((el, i) => {
          el.classList.toggle('is-active', i === idx)
        })
      }

      /* ── Phase 4: finale caption under AURELIA ─────────────────────────── */
      if (finale) {
        const p = norm(s, TL.finale.start + 0.06, TL.finale.start + 0.2)
        const e = easeOutExpo(p)
        finale.style.visibility = p > 0.001 ? 'visible' : 'hidden'
        finale.style.opacity = String(e)
        finale.style.transform = `translate3d(-50%, ${((1 - e) * 40).toFixed(2)}px, 0)`
        finale.style.filter = `blur(${((1 - e) * 10).toFixed(2)}px)`
      }

      /* ── Persistent HUD ────────────────────────────────────────────────── */
      if (progressFill) progressFill.style.transform = `scaleY(${Math.max(s, 0.004).toFixed(4)})`
      if (progressLabel) progressLabel.textContent = `${String(Math.round(s * 100)).padStart(2, '0')}`

      const chapter =
        s < TL.rotate.end ? 0 : s < TL.ascend.end ? 1 : s < TL.rings.end ? 2 : 3
      chapterEls.forEach((el, i) => el.classList.toggle('is-active', i === chapter))

      // Motion-reactive stretch on the HUD rule.
      if (progressFill) {
        progressFill.style.filter = `brightness(${(1 + Math.abs(vel) * 14).toFixed(3)})`
      }
    })

    return () => {
      unsub()
      window.removeEventListener('scroll', updateFooterFade)
      window.removeEventListener('resize', updateFooterFade)
    }
  }, [isEntered])

  if (!isEntered) return null

  return (
    <div className="scroll-narrative" ref={rootRef}>
      {/* PHASE 1 rotation words are 3D meshes inside the WebGL scene — they
          orbit behind the jellyfish and crossfade with camera angle, so there
          is no DOM layer for them here. */}

      {/* ── PHASE 2 · ASCENT CAPTIONS ───────────────────────────────────── */}
      <div
        className="ks-ascent ks-ascent-left"
        data-ascent
        data-side="left"
        data-start="0.325"
        data-end="0.44"
        style={{ visibility: 'hidden' }}
      >
        <span className="ks-ascent-tag">DISCIPLINE 01</span>
        <h3>Sculpted for wonder,<br />engineered for performance.</h3>
        <p>
          Realtime glass, volumetric light and physics that breathe — rendered
          at sixty frames a second in a browser tab.
        </p>
      </div>

      <div
        className="ks-ascent ks-ascent-right"
        data-ascent
        data-side="right"
        data-start="0.45"
        data-end="0.575"
        style={{ visibility: 'hidden' }}
      >
        <span className="ks-ascent-tag">DISCIPLINE 02</span>
        <h3>Where design and<br />engineering stop arguing.</h3>
        <p>
          Bespoke shaders, spatial audio and interaction models built for
          brands that would rather be remembered than merely seen.
        </p>
      </div>

      {/* ── PHASE 3 · GLASS RING HUD ────────────────────────────────────── */}
      <div className="ks-rings-hud" data-ring-hud style={{ visibility: 'hidden' }}>
        <div className="ks-rings-inner">
          <div className="ks-rings-counter">
            <span data-ring-counter>01</span>
            <i />
            <em>04</em>
          </div>
          <div className="ks-rings-meta">
            <h3 data-ring-title>{PROJECTS[0].title}</h3>
            <p data-ring-cat>{PROJECTS[0].category}</p>
          </div>
          <div className="ks-rings-dots">
            {PROJECTS.map((p, i) => (
              <span className="ks-ring-dot" data-ring={i} key={p.id} />
            ))}
          </div>
        </div>
      </div>

      {/* ── PHASE 4 · FINALE ────────────────────────────────────────────── */}
      <div className="ks-finale" data-finale style={{ visibility: 'hidden' }}>
        <span className="ks-finale-rule" />
        <p>Immersive experiences, engineered end to end.</p>
      </div>

      {/* ── PERSISTENT HUD ──────────────────────────────────────────────── */}
      <div className="ks-hud">
        <div className="ks-hud-chapters">
          {['ROTATE', 'ASCEND', 'WORK', 'ARRIVE'].map((c) => (
            <span className="ks-hud-chapter" data-chapter key={c}>
              {c}
            </span>
          ))}
        </div>
        <div className="ks-hud-rail">
          <span className="ks-hud-fill" data-progress-fill />
        </div>
        <span className="ks-hud-value">
          <em data-progress-label>00</em>
        </span>
      </div>
    </div>
  )
}
