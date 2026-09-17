import React, { useState, useEffect } from 'react'
import { sound } from './AudioEngine'

interface WorkModalProps {
  isOpen: boolean
  onClose: () => void
}

interface CaseItem {
  id: string
  title: string
  subtitle: string
  category: '3d' | 'xr' | 'ai' | 'all'
  categoryLabel: string
  tags: string[]
  awards: string[]
  description: string
  gradient: string
  accentColor: string
  year: string
  link?: string
}

const CASES: CaseItem[] = [
  {
    id: 'configurator',
    title: '3D Configurator',
    subtitle: 'Bespoke Glass Customizer',
    category: '3d',
    categoryLabel: 'Interactive / 3D / WebGL',
    tags: ['WebGL', 'Three.js', 'Physical Glass', 'Real-time 3D'],
    awards: ['FWA OF THE DAY', 'CSSDA SITE OF THE DAY'],
    description:
      'Sophisticated 3D glass customizer offering an immersive, tactile experience that allows users to interactively design and visualize bespoke glass objects with physical accuracy.',
    gradient: 'linear-gradient(135deg, #e392fe 0%, #74a7fe 100%)',
    accentColor: '#e392fe',
    year: '2025',
    link: 'https://labs.noomoagency.com/',
  },
  {
    id: 'intel-ai',
    title: 'Intel | AI.IO',
    subtitle: 'Interactive Kiosk & Activation',
    category: 'ai',
    categoryLabel: 'Computer Vision / XR / AI',
    tags: ['Interactive Kiosk', 'AI Vision', 'Booth Experience', 'Activation'],
    awards: ['FWA OF THE DAY', 'BEST AI EXPERIENCE MWC'],
    description:
      "An immersive AI experience created for Intel's showcase at AWS re:Invent, marked by a personalized biometric journey guiding athletes through interactive performance drills.",
    gradient: 'linear-gradient(135deg, #53d5fd 0%, #005a3c 100%)',
    accentColor: '#53d5fd',
    year: '2024',
    link: 'https://noomoagency.com/',
  },
  {
    id: 'silly-bunny',
    title: 'The Silly Bunny',
    subtitle: 'AR & Illustrated Storybook',
    category: 'xr',
    categoryLabel: 'WebAR / Mixed Reality',
    tags: ['Immersive Web', 'AR Kit', '3D / 2D Blend', 'Audio Story'],
    awards: ['FWA OF THE DAY', 'AXXIS DESIGN AWARDS'],
    description:
      'Highly interactive storybook with a seamless WebAR activation and a vibrant fusion of 3D volumetric assets and handcrafted 2D illustrations.',
    gradient: 'linear-gradient(135deg, #febb25 0%, #ee4d31 100%)',
    accentColor: '#febb25',
    year: '2024',
    link: 'https://noomoagency.com/',
  },
  {
    id: 'aurelia-beat',
    title: 'Aurelia Beat',
    subtitle: 'Procedural Audio & 3D Microsite',
    category: '3d',
    categoryLabel: 'Spatial Sound / Kinetic 3D',
    tags: ['Web Audio API', 'Simplex Shaders', 'Frequency Reactor'],
    awards: ['INNOVATION OF THE MONTH'],
    description:
      'A sensory web playground generating real-time algorithmic soundscapes that morph kinetic 3D geometries based on user touch and harmonic frequency bins.',
    gradient: 'linear-gradient(135deg, #8231fe 0%, #d357fe 100%)',
    accentColor: '#8231fe',
    year: '2025',
    link: 'https://labs.noomoagency.com/',
  },
  {
    id: 'spatial-vision',
    title: 'Spatial Canvas',
    subtitle: 'Apple Vision Pro Prototype',
    category: 'xr',
    categoryLabel: 'Spatial Computing / WebXR',
    tags: ['VisionOS', 'WebXR', 'Eye-Tracking Interaction', 'Gaussian Splatting'],
    awards: ['SPECIAL KUDOS', 'DEV INNOVATION'],
    description:
      'Next-generation spatial interface designed for visionOS exploring fluid glass physics, glance-based gaze selection, and micro-haptic spatial resonance.',
    gradient: 'linear-gradient(135deg, #00fdff 0%, #1a0a53 100%)',
    accentColor: '#00fdff',
    year: '2025',
    link: 'https://noomoagency.com/',
  },
  {
    id: 'metahuman-fashion',
    title: 'Aura Studio',
    subtitle: 'Generative Digital Fashion',
    category: 'ai',
    categoryLabel: 'Generative AI / Unreal 5',
    tags: ['Diffusion Shaders', 'Cloth Simulation', 'Dynamic Textures'],
    awards: ['WEBBY NOMINEE', 'AOTD WINNER'],
    description:
      'Digital haute couture showroom featuring procedural garment morphing, neural texture synthesis, and real-time volumetric lighting.',
    gradient: 'linear-gradient(135deg, #f4a4c0 0%, #942192 100%)',
    accentColor: '#f4a4c0',
    year: '2024',
    link: 'https://noomoagency.com/',
  },
]

export function WorkModal({ isOpen, onClose }: WorkModalProps) {
  const [activeFilter, setActiveFilter] = useState<'all' | '3d' | 'xr' | 'ai'>('all')

  // Close on Escape key
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

  const filteredCases = activeFilter === 'all' 
    ? CASES 
    : CASES.filter((c) => c.category === activeFilter)

  return (
    <div className="work-editorial-overlay" onClick={onClose}>
      <div className="work-editorial-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Top Sticky Bar */}
        <div className="editorial-topbar">
          <div className="topbar-left">
            <span className="mono-tag">[ AURELIA LABS / ARCHIVE ]</span>
            <span className="count-pill">{filteredCases.length} EXPERIENCES</span>
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

        {/* Hero Title Section */}
        <div className="editorial-hero">
          <div className="hero-header-line">
            <span className="section-index">[ 01 / PORTFOLIO ]</span>
            <div className="filter-pill-group">
              {(['all', '3d', 'xr', 'ai'] as const).map((filterKey) => (
                <button
                  key={filterKey}
                  className={`filter-btn ${activeFilter === filterKey ? 'active' : ''}`}
                  onClick={() => {
                    sound.playClick(1100)
                    setActiveFilter(filterKey)
                  }}
                  onMouseEnter={() => sound.playClick(950)}
                >
                  <span className="bracket">[</span>
                  <span>{filterKey === 'all' ? 'ALL WORK' : filterKey.toUpperCase()}</span>
                  <span className="bracket">]</span>
                </button>
              ))}
            </div>
          </div>

          <h1 className="editorial-giant-title">SELECTED WORK</h1>
          <p className="editorial-lead">
            Exploring the bleeding edge of WebGL, spatial computing, procedural audio, and generative digital reality.
          </p>
        </div>

        {/* Projects Grid */}
        <div className="editorial-work-grid">
          {filteredCases.map((item, idx) => (
            <div
              key={item.id}
              className="editorial-work-card"
              onMouseEnter={() => sound.playClick(1350)}
            >
              {/* Card Media Preview */}
              <div className="card-media-wrapper" style={{ background: item.gradient }}>
                <div className="card-media-overlay" />
                <div className="card-badge-top">
                  <span className="award-badge">{item.awards[0]}</span>
                  <span className="year-badge">{item.year}</span>
                </div>
                <div className="card-center-action">
                  <span className="action-circle">↗</span>
                </div>
                <div className="card-media-shimmer" />
              </div>

              {/* Card Meta Content */}
              <div className="card-content">
                <div className="card-category-row">
                  <span className="mono-num">0{idx + 1}</span>
                  <span className="category-name">{item.categoryLabel}</span>
                </div>

                <h3 className="card-title">{item.title}</h3>
                <h4 className="card-subtitle">{item.subtitle}</h4>
                <p className="card-desc">{item.description}</p>

                <div className="card-tags-row">
                  {item.tags.map((tag) => (
                    <span key={tag} className="tag-item">#{tag}</span>
                  ))}
                </div>

                {item.link && (
                  <div className="card-cta">
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noreferrer"
                      className="explore-link"
                      onClick={() => sound.playClick(1100)}
                    >
                      <span>[ EXPLORE EXPERIMENT ]</span>
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Editorial Footer */}
        <div className="editorial-drawer-footer">
          <div className="footer-left">
            <span>© 2026 AURELIA LABS</span>
            <span className="dot">•</span>
            <span>SHAPING DIGITAL EMOTION & FORM</span>
          </div>
          <div className="footer-right">
            <span>READY TO CREATE SOMETHING UNFORGETTABLE?</span>
            <a href="mailto:hello@aurelia.studio" className="footer-link" onClick={() => sound.playClick(1100)}>
              [ HELLO@AURELIA.STUDIO ]
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
