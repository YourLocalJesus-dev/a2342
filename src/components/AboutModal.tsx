import { useEffect } from 'react'
import { sound } from './AudioEngine'

interface AboutModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
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
      <div className="story-modal-container about-aurelia-modal" onClick={(e) => e.stopPropagation()} data-cursor="READ">
        {/* Modal Top Bar */}
        <div className="modal-header">
          <div className="modal-badge">
            <span className="badge-dot" />
            <span>STUDIO MONOGRAPH · ABOUT AURELIA</span>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={() => {
              sound.playClick(400)
              onClose()
            }}
            aria-label="Close Monograph"
          >
            <span>DISMISS [ESC]</span>
            <span className="close-x">✕</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          <div className="modal-hero-title">
            <span className="modal-chapter-tag">AN INDEPENDENT DESIGN PRACTICE · EST. 2024</span>
            <h2>
              The Pursuit of<br />
              <em>Unhurried Wonder</em>
            </h2>
            <p className="modal-lead">
              Aurelia is a multidisciplinary creative direction studio and atelier. We operate at the intersection of architectural spaces, bespoke material objects, and sensory identity design.
            </p>
          </div>

          {/* Core Studio Pillars */}
          <div className="about-pillars-grid">
            <div className="about-pillar-card">
              <span className="pillar-num">01</span>
              <h3>Spatial Poetics</h3>
              <p>
                We design sanctuaries, residences, and pavilions where architecture recedes, leaving space for natural light, tactile stone, and acoustic stillness.
              </p>
            </div>

            <div className="about-pillar-card">
              <span className="pillar-num">02</span>
              <h3>Collectible Artifacts</h3>
              <p>
                Limited-edition furniture, cast bronze vessels, and monolithic luminaires sculpted by master craftsmen across Kyoto, Milan, and New Delhi.
              </p>
            </div>

            <div className="about-pillar-card">
              <span className="pillar-num">03</span>
              <h3>Sensory Identity</h3>
              <p>
                Creative direction, tactile typography, and brand worldbuilding for visionary institutions and cultural patrons who value enduring resonance.
              </p>
            </div>
          </div>

          {/* Quote Banner */}
          <div className="about-quote-box">
            <blockquote>
              “Design is not merely a problem solved. It is an enduring atmosphere that lingers long after you leave the room.”
            </blockquote>
            <span className="quote-author">— Aurelia Creative Direction Ethos</span>
          </div>

          {/* Atelier Studios & Coordinates */}
          <div className="metrics-grid">
            <div className="metric-box">
              <span className="m-num">TOKYO</span>
              <span className="m-label">Sanctuary & Woodcraft Lab</span>
            </div>
            <div className="metric-box">
              <span className="m-num">MILAN</span>
              <span className="m-label">Furniture & Stone Atelier</span>
            </div>
            <div className="metric-box">
              <span className="m-num">NEW DELHI</span>
              <span className="m-label">Bronze & Metal Metallurgy</span>
            </div>
            <div className="metric-box">
              <span className="m-num">LONDON</span>
              <span className="m-label">Identity & Editorial Studio</span>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="modal-footer">
            <span className="footer-origin">AURELIA ATELIER · MMXXVI</span>
            <button
              type="button"
              className="modal-action-btn"
              onClick={() => {
                sound.playBubble(523)
                onClose()
                const storiesEl = document.querySelector('#stories')
                storiesEl?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              <span>Explore Selected Works</span>
              <span className="btn-arrow">↗</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
