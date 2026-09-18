import React, { useState, useEffect } from 'react'
import { sound } from './AudioEngine'

interface ContactModalProps {
  isOpen: boolean
  onClose: () => void
}

const INTERESTS = [
  '3D WebGL & Interactive',
  'Spatial Computing & WebXR',
  'Procedural Sound Systems',
  'Creative Direction & Shaders',
  'Full Interactive Campaign',
]

export function ContactModal({ isOpen, onClose }: ContactModalProps) {
  const [submitted, setSubmitted] = useState(false)
  const [selectedInterest, setSelectedInterest] = useState('3D WebGL & Interactive')
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    message: '',
  })

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        sound.playClick(900)
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sound.playBubble(600)
    sound.playHoldBurst()
    setSubmitted(true)
    setTimeout(() => {
      setSubmitted(false)
      onClose()
    }, 2800)
  }

  return (
    <div className="contact-editorial-overlay" onClick={onClose}>
      <div className="contact-editorial-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="editorial-topbar">
          <div className="topbar-left">
            <span className="mono-tag">[ AURELIA LABS / TRANSMISSION ]</span>
            <span className="count-pill">STATUS: ACCEPTING COMMISSIONS</span>
          </div>

          <button
            className="editorial-close-btn"
            onClick={() => {
              sound.playClick(900)
              onClose()
            }}
            onMouseEnter={() => sound.playClick(1200)}
          >
            <span className="bracket">[</span>
            <span className="text">CLOSE (ESC)</span>
            <span className="bracket">]</span>
          </button>
        </div>

                <div className="editorial-hero">
          <div className="hero-header-line">
            <span className="section-index">[ 02 / COLLABORATE ]</span>
            <span className="location-tag">SAN FRANCISCO · TOKYO · GLOBAL XR</span>
          </div>
          <h1 className="editorial-giant-title">LET'S INNOVATE</h1>
          <p className="editorial-lead">
            Partner with us to create award-winning interactive spatial experiences, real-time 3D web environments, and experimental digital identities.
          </p>
        </div>

                <div className="contact-content-grid">
                    <div className="contact-info-col">
            <div className="info-block">
              <span className="info-label">[ DIRECT CONTACT ]</span>
              <a
                href="mailto:hello@aurelia.studio"
                className="big-contact-link"
                onMouseEnter={() => sound.playClick(1100)}
              >
                HELLO@AURELIA.STUDIO
              </a>
              <p className="sub-note">We typically review incoming briefs and respond within 24 hours.</p>
            </div>

            <div className="info-block">
              <span className="info-label">[ CORE EXPERTISE ]</span>
              <ul className="expertise-list">
                <li>• WebGL / WebGPU Immersive Architecture</li>
                <li>• Apple Vision Pro & Spatial WebXR</li>
                <li>• Procedural Soundscapes & Generative Audio</li>
                <li>• High-End Micro-Animations & Druk Typography</li>
                <li>• Bespoke Shaders & Physical Materials</li>
              </ul>
            </div>

            <div className="info-block">
              <span className="info-label">[ SOCIALS & NETWORK ]</span>
              <div className="social-links-row">
                <a
                  href="https://aureliafortheunhurried.vercel.app"
                  target="_blank"
                  rel="noreferrer"
                  className="social-tag"
                  onMouseEnter={() => sound.playClick(1100)}
                >
                  [ AURELIA STUDIO ]
                </a>
                <a
                  href="https://twitter.com"
                  target="_blank"
                  rel="noreferrer"
                  className="social-tag"
                  onMouseEnter={() => sound.playClick(1100)}
                >
                  [ TWITTER / X ]
                </a>
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noreferrer"
                  className="social-tag"
                  onMouseEnter={() => sound.playClick(1100)}
                >
                  [ LINKEDIN ]
                </a>
              </div>
            </div>

            <div className="status-badge-card">
              <div className="pulse-indicator" />
              <div>
                <strong>AURELIA DESIGN LAB ACTIVE</strong>
                <p>Ready to deploy custom creative technology for forward-thinking brands.</p>
              </div>
            </div>
          </div>

                    <div className="contact-form-col">
            {submitted ? (
              <div className="transmission-success-box">
                <div className="success-icon-wrap">✓</div>
                <h3 className="success-title">TRANSMISSION RECEIVED</h3>
                <p className="success-msg">
                  Your project brief has entered our creative queue. Our lead technologist will reach out shortly.
                </p>
              </div>
            ) : (
              <form className="editorial-form" onSubmit={handleSubmit}>
                <div className="form-fields-grid">
                  <div className="form-group">
                    <label className="field-label">YOUR NAME *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Maya Lin"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      onFocus={() => sound.playClick(950)}
                      className="editorial-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="field-label">EMAIL ADDRESS *</label>
                    <input
                      type="email"
                      required
                      placeholder="maya@studio.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      onFocus={() => sound.playClick(950)}
                      className="editorial-input"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="field-label">ORGANIZATION / BRAND</label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Corp / Independent"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    onFocus={() => sound.playClick(950)}
                    className="editorial-input"
                  />
                </div>

                <div className="form-group">
                  <label className="field-label">EXPLORATION FOCUS</label>
                  <div className="interest-pills-wrap">
                    {INTERESTS.map((interest) => (
                      <button
                        key={interest}
                        type="button"
                        className={`interest-pill ${selectedInterest === interest ? 'selected' : ''}`}
                        onClick={() => {
                          sound.playClick(1050)
                          setSelectedInterest(interest)
                        }}
                        onMouseEnter={() => sound.playClick(900)}
                      >
                        <span className="pill-bracket">[</span>
                        <span className="pill-name">{interest}</span>
                        <span className="pill-bracket">]</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label className="field-label">PROJECT BRIEF & TIMELINE *</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Describe your vision, timeline, target platform, or technical goals..."
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    onFocus={() => sound.playClick(950)}
                    className="editorial-textarea"
                  />
                </div>

                <button
                  type="submit"
                  className="editorial-submit-btn"
                  onMouseEnter={() => sound.playClick(1200)}
                >
                  <span className="bracket">[</span>
                  <span className="submit-txt">TRANSMIT BRIEF →</span>
                  <span className="bracket">]</span>
                </button>
              </form>
            )}
          </div>
        </div>

                <div className="editorial-drawer-footer">
          <div className="footer-left">
            <span>AURELIA LABS · IMMERSIVE TECHNOLOGIES</span>
            <span className="dot">•</span>
            <span>ENCRYPTED DIRECT CHANNEL</span>
          </div>
          <div className="footer-right">
            <span>CURRENT TIME: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} PST</span>
          </div>
        </div>
      </div>
    </div>
  )
}
