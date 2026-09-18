import { useState } from 'react'
import { sound } from './AudioEngine'

interface ObjectItem {
  id: string
  num: string
  title: string
  subtitle: string
  edition: string
  origin: string
  dimensions: string
  craftTime: string
  materials: {
    name: string
    color: string
    accent: string
    texture: string
    description: string
  }[]
  type: 'vessel' | 'chair' | 'luminaire'
}

const OBJECTS_DATA: ObjectItem[] = [
  {
    id: 'solace-vessel',
    num: '01',
    title: 'Solace Vessel',
    subtitle: 'Sculptural Vessel · Edition of 12',
    edition: '12 / 12 Worldwide',
    origin: 'Kyoto & Tokyo, Japan',
    dimensions: 'H 42cm × W 28cm × D 28cm',
    craftTime: '140 Hours Lost-Wax Casting',
    type: 'vessel',
    materials: [
      {
        name: 'Cast Bronze',
        color: '#a34828',
        accent: '#5a2212',
        texture: 'radial-gradient(circle at 35% 30%, #d87654 0%, #a34828 45%, #4e1d0e 90%)',
        description: 'Patinised molten bronze with natural fire oxidisation patina.'
      },
      {
        name: 'Nero Obsidian',
        color: '#1a1d1e',
        accent: '#0d0f10',
        texture: 'radial-gradient(circle at 35% 30%, #434c50 0%, #1a1d1e 50%, #08090a 90%)',
        description: 'Volcanic glass polished by hand with diamond paste.'
      },
      {
        name: 'Travertine',
        color: '#e4d8c5',
        accent: '#b8a68d',
        texture: 'radial-gradient(circle at 35% 30%, #fdfbf7 0%, #e4d8c5 55%, #a89478 95%)',
        description: 'Porous Roman sedimentary stone with honed satin sealing.'
      }
    ]
  },
  {
    id: 'field-chair',
    num: '02',
    title: 'Field Chair',
    subtitle: 'Sculptural Lounge · Solid Wood',
    edition: 'Bespoke Commission',
    origin: 'Milan & Copenhagen',
    dimensions: 'H 74cm × W 68cm × D 70cm',
    craftTime: '90 Hours Hand Joinery',
    type: 'chair',
    materials: [
      {
        name: 'Oiled Smoked Oak',
        color: '#2d3b36',
        accent: '#182420',
        texture: 'radial-gradient(circle at 35% 30%, #465d55 0%, #2d3b36 50%, #141c19 90%)',
        description: 'Century-old European oak fumed with organic plant oils.'
      },
      {
        name: 'Saddle Umber',
        color: '#6e4530',
        accent: '#3d2417',
        texture: 'radial-gradient(circle at 35% 30%, #9e6447 0%, #6e4530 50%, #29170e 90%)',
        description: 'Vegetable-tanned full grain Tuscan hide with blind stitch seams.'
      },
      {
        name: 'Chalk Bouclé',
        color: '#dedad2',
        accent: '#9a9487',
        texture: 'radial-gradient(circle at 35% 30%, #f8f6f0 0%, #dedad2 50%, #878072 90%)',
        description: 'Textured natural alpaca wool weave with soft tactile warmth.'
      }
    ]
  },
  {
    id: 'komorebi-monolith',
    num: '03',
    title: 'Komorebi Monolith',
    subtitle: 'Acoustic Luminaire · Warm Resonance',
    edition: 'Numbered Atelier Batch',
    origin: 'New Delhi & London',
    dimensions: 'H 86cm × W 22cm × D 22cm',
    craftTime: '115 Hours Precision Milling',
    type: 'luminaire',
    materials: [
      {
        name: 'Brushed Brass',
        color: '#c9a24d',
        accent: '#6b5119',
        texture: 'radial-gradient(circle at 35% 30%, #ffe38f 0%, #c9a24d 50%, #5c430e 90%)',
        description: 'Solid billet brass with micro-brushed satin lacquer.'
      },
      {
        name: 'Fluted Alabaster',
        color: '#f0ece1',
        accent: '#b5aca0',
        texture: 'radial-gradient(circle at 35% 30%, #ffffff 0%, #f0ece1 55%, #8f8576 95%)',
        description: 'Translucent stone casting diffuse solar warmth (2400K).'
      },
      {
        name: 'Raw Titanium',
        color: '#71787c',
        accent: '#393e41',
        texture: 'radial-gradient(circle at 35% 30%, #a8b0b5 0%, #71787c 50%, #272c30 90%)',
        description: 'Aerospace-grade anodized titanium with matte bead-blasted finish.'
      }
    ]
  }
]

export function ObjectStudio() {
  const [selectedMaterials, setSelectedMaterials] = useState<Record<string, number>>({
    'solace-vessel': 0,
    'field-chair': 0,
    'komorebi-monolith': 0
  })

  const [activeCard, setActiveCard] = useState<string | null>(null)
  const [tiltStates, setTiltStates] = useState<Record<string, { x: number; y: number }>>({})

  const handleMaterialChange = (objId: string, matIndex: number) => {
    setSelectedMaterials((prev) => ({ ...prev, [objId]: matIndex }))
    sound.playClick(600 + matIndex * 150)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>, objId: string) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2)
    const y = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2)
    setTiltStates((prev) => ({
      ...prev,
      [objId]: { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }
    }))
  }

  const handleMouseLeave = (objId: string) => {
    setTiltStates((prev) => ({
      ...prev,
      [objId]: { x: 0, y: 0 }
    }))
  }

  return (
    <div className="object-studio">
      <div className="object-header-row">
        <div>
          <p className="eyebrow">Chapter 05 · Material Artifacts</p>
          <h2 className="studio-heading">Selected Objects</h2>
        </div>
        <p className="studio-tagline">
          Sculpted for contemplation. Each piece exists at the intersection of architectural geometry and tactile stillness.
        </p>
      </div>

      <div className="object-cards-grid">
        {OBJECTS_DATA.map((item) => {
          const matIdx = selectedMaterials[item.id] || 0
          const currentMat = item.materials[matIdx]
          const tilt = tiltStates[item.id] || { x: 0, y: 0 }
          const isDetailOpen = activeCard === item.id

          return (
            <article
              key={item.id}
              className={`object-luxury-card ${isDetailOpen ? 'is-expanded' : ''}`}
              data-cursor="TOUCH"
              onMouseMove={(e) => handleMouseMove(e, item.id)}
              onMouseLeave={() => handleMouseLeave(item.id)}
              style={{
                transform: `perspective(1000px) rotateY(${tilt.x * 6}deg) rotateX(${-tilt.y * 6}deg) translateZ(0)`
              }}
            >
                            <div className="card-top-bar">
                <span className="card-num">{item.num}</span>
                <span className="card-origin">{item.origin}</span>
              </div>

                            <div className="card-visual-stage">
                <div
                  className="specular-glint"
                  style={{
                    transform: `translate(${tilt.x * 50}px, ${tilt.y * 50}px)`
                  }}
                />

                {item.type === 'vessel' && (
                  <div
                    className="sculpture-vessel"
                    style={{
                      background: currentMat.texture,
                      boxShadow: `0 24px 48px ${currentMat.accent}55, inset -18px -18px 24px ${currentMat.accent}`
                    }}
                  >
                    <div
                      className="vessel-neck"
                      style={{
                        background: currentMat.texture
                      }}
                    />
                    <div className="vessel-rim" />
                  </div>
                )}

                {item.type === 'chair' && (
                  <div className="sculpture-chair">
                    <div
                      className="chair-arch"
                      style={{
                        borderColor: currentMat.color,
                        boxShadow: `0 20px 40px ${currentMat.accent}44`
                      }}
                    >
                      <i style={{ background: currentMat.color }} />
                    </div>
                    <div className="chair-legs" style={{ background: currentMat.accent }} />
                  </div>
                )}

                {item.type === 'luminaire' && (
                  <div className="sculpture-luminaire">
                    <div
                      className="luminaire-body"
                      style={{
                        background: currentMat.texture,
                        boxShadow: `0 20px 40px ${currentMat.accent}55`
                      }}
                    >
                      <div className="luminaire-slit" />
                      <div className="luminaire-glow" />
                    </div>
                  </div>
                )}
              </div>

                            <div className="material-picker">
                <span className="picker-label">FINISH:</span>
                <div className="swatches-row">
                  {item.materials.map((m, idx) => (
                    <button
                      key={m.name}
                      type="button"
                      className={`swatch-btn ${idx === matIdx ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleMaterialChange(item.id, idx)
                      }}
                      title={m.name}
                      style={{ background: m.color }}
                    >
                      <span className="sr-only">{m.name}</span>
                    </button>
                  ))}
                </div>
                <span className="active-mat-name">{currentMat.name}</span>
              </div>

                            <div className="card-info">
                <h3>{item.title}</h3>
                <p className="card-mat-desc">{currentMat.description}</p>
                <div className="card-specs-row">
                  <span>{item.dimensions}</span>
                  <span>·</span>
                  <span>{item.craftTime}</span>
                </div>
              </div>

                            <button
                type="button"
                className="spec-expand-btn"
                onClick={() => {
                  setActiveCard(isDetailOpen ? null : item.id)
                  sound.playClick(500)
                }}
              >
                <span>{isDetailOpen ? 'Close Archive' : 'Atelier Dossier'}</span>
                <span className="expand-arrow">{isDetailOpen ? '−' : '+'}</span>
              </button>

                            {isDetailOpen && (
                <div className="card-dossier-drawer">
                  <div className="dossier-row">
                    <span className="d-label">EDITION STATUS</span>
                    <span className="d-val">{item.edition}</span>
                  </div>
                  <div className="dossier-row">
                    <span className="d-label">ORIGIN ATELIER</span>
                    <span className="d-val">{item.origin}</span>
                  </div>
                  <div className="dossier-row">
                    <span className="d-label">DIMENSIONS</span>
                    <span className="d-val">{item.dimensions}</span>
                  </div>
                  <div className="dossier-row">
                    <span className="d-label">ACQUISITION</span>
                    <span className="d-val">Private Inquiry Only</span>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}
