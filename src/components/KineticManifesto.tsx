import { sound } from './AudioEngine'

export function KineticManifesto() {
  const handleWordHover = (freq: number) => {
    sound.playClick(freq)
  }

  return (
    <section className="kinetic scene" aria-label="Presence demands no spectacle. Stillness is pure authority.">
      {/* Top Header */}
      <div className="kinetic-top-row">
        <div className="badge-row">
          <span className="badge-dot" />
          <p className="eyebrow">Chapter 03 · Manifesto</p>
        </div>
        <span className="kinetic-serial">MMXXVI · AXIOM</span>
      </div>

      {/* Main Kinetic Typography Stage */}
      <div className="kinetic-lines">
        {/* Phase 1 (Visible initially, glides out on scroll) */}
        <div className="kinetic-phrase phrase-primary">
          <div className="phrase-row">
            <span
              className="k-word word-1"
              data-cursor="Allure"
              onMouseEnter={() => handleWordHover(520)}
            >
              Presence
            </span>
            <span
              className="k-word word-2 is-italic"
              data-cursor="Allure"
              onMouseEnter={() => handleWordHover(580)}
            >
              demands no
            </span>
          </div>
          <div className="phrase-row">
            <span
              className="k-word word-3 is-stroked"
              data-cursor="Allure"
              onMouseEnter={() => handleWordHover(650)}
            >
              spectacle.
            </span>
          </div>
        </div>

        {/* Phase 2 (Glides in smoothly on scroll, perfectly centered, never overlaps) */}
        <div className="kinetic-phrase phrase-secondary">
          <div className="phrase-row">
            <span
              className="k-word word-4"
              data-cursor="Allure"
              onMouseEnter={() => handleWordHover(720)}
            >
              Stillness
            </span>
            <span
              className="k-word word-5 is-italic is-stroked"
              data-cursor="Allure"
              onMouseEnter={() => handleWordHover(780)}
            >
              is pure
            </span>
          </div>
          <div className="phrase-row">
            <span
              className="k-word word-6 is-italic"
              data-cursor="Allure"
              onMouseEnter={() => handleWordHover(880)}
            >
              authority.
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="kinetic-bottom-bar">
        <p className="kinetic-note">Scroll slowly. Let the excess fall away.</p>
        <div className="scroll-indicator-wrap" data-cursor="SCROLL">
          <span className="scroll-txt">SCROLL TO REVEAL</span>
          <div className="scroll-indicator-wheel">
            <span className="wheel-bar" />
          </div>
        </div>
      </div>
    </section>
  )
}
