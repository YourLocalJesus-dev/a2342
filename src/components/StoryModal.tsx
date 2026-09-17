import { useEffect } from 'react'
import { sound } from './AudioEngine'

interface StoryModalProps {
  isOpen: boolean
  onClose: () => void
}

export function StoryModal({ isOpen, onClose }: StoryModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', onKeyDown)
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="story-modal-overlay" onClick={onClose} data-cursor="CLOSE">
      <div className="story-modal-container" onClick={(e) => e.stopPropagation()} data-cursor="READ">
        {/* Modal Top Bar */}
        <div className="modal-header">
          <div className="modal-badge">
            <span className="badge-dot" />
            <span>ARCHITECTURAL DOSSIER · VOL. IV</span>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={() => {
              sound.playClick(400)
              onClose()
            }}
            aria-label="Close Dossier"
          >
            <span>DISMISS [ESC]</span>
            <span className="close-x">✕</span>
          </button>
        </div>

        {/* Modal Content Scroll Area */}
        <div className="modal-body">
          <div className="modal-hero-title">
            <span className="modal-chapter-tag">CASE STUDY 04 // KYOTO RESIDENCE</span>
            <h2>
              House of<br />
              <em>Stillness</em>
            </h2>
            <p className="modal-lead">
              A private pavilion conceived as an acoustic sanctuary. Choreographed around deep cedar eaves, textured volcanic basalt, and the choreography of natural daylight.
            </p>
          </div>

          {/* Architectural Metrics Bar */}
          <div className="metrics-grid">
            <div className="metric-box">
              <span className="m-num">24.2 dB</span>
              <span className="m-label">Acoustic Floor Isolation</span>
            </div>
            <div className="metric-box">
              <span className="m-num">1,420 m²</span>
              <span className="m-label">Sanctuary Footprint</span>
            </div>
            <div className="metric-box">
              <span className="m-num">2,400 K</span>
              <span className="m-label">Solar Dusk Calibration</span>
            </div>
            <div className="metric-box">
              <span className="m-num">MMXXV</span>
              <span className="m-label">Commission Year</span>
            </div>
          </div>

          {/* Blueprint & Visual Composition */}
          <div className="modal-visual-triptych">
            <div className="visual-panel panel-photo">
              <img
                src="/house-of-stillness.jpg"
                alt="House of Stillness Kyoto Exterior and Water Sanctuary"
                className="panel-img"
              />
              <div className="panel-overlay" />
              <div className="panel-art-abstract">
                <span className="blueprint-code">SANCTUARY ARCHIVE // REFLECTING POOL</span>
              </div>
              <p className="panel-caption">The courtyard threshold delays the transition from civic tumult to deep acoustic refuge.</p>
            </div>

            <div className="visual-panel panel-terracotta">
              <div className="panel-art-abstract">
                <div className="sun-ring" />
                <span className="blueprint-code">SOLAR ALIGNMENT // 139°41'E</span>
              </div>
              <p className="panel-caption">Filtered western light penetrates the central atrium only during the golden hour.</p>
            </div>
          </div>

          {/* Editorial Text */}
          <div className="modal-editorial">
            <div className="editorial-col">
              <h3>The Philosophy of Subtraction</h3>
              <p>
                In an era dominated by hyper-stimulation, luxury is no longer defined by ornament, but by the intentional absence of unnecessary signals. The House of Stillness was designed not to impress the visitor, but to return them to themselves.
              </p>
            </div>
            <div className="editorial-col">
              <h3>Material Resonance</h3>
              <p>
                Every surface was chosen for its haptic temperature and acoustic absorption. Charred Japanese cypress (Yakisugi), porous volcanic basalt, and raw brushed copper age together with the passing of seasons.
              </p>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="modal-footer">
            <span className="footer-origin">AURELIA ARCHITECTURAL PRACTICE · 2026</span>
            <button
              type="button"
              className="modal-action-btn"
              onClick={() => {
                sound.playBubble(528)
                onClose()
              }}
            >
              <span>Return to Journey</span>
              <span className="btn-arrow">↗</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
