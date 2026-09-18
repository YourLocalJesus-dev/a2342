import React, { useEffect, useState, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'
import { JellyCanvas, JellyConfig } from './components/JellyCanvas'
import { WorkModal } from './components/WorkModal'
import { ContactModal } from './components/ContactModal'
import { sound } from './components/AudioEngine'
import { ScrollNarrative } from './components/ScrollNarrative'
import { scrollStore } from './scroll'

// The 36 authentic curated color swatches matching Noomo Labs
const PALETTE_COLORS = [
  '#000000', '#0433FF', '#1A0A53', '#942192', '#791A3E', '#5C0000',
  '#EE4D31', '#FEBB25', '#005819', '#444444', '#53D5FD', '#8231FE',
  '#A048FE', '#D357FE', '#E4001D', '#FB7D56', '#FECC5A', '#459D34',
  '#929292', '#00FDFF', '#74A7FE', '#B18CFE', '#FF40FF', '#E63B7A',
  '#F6A680', '#FFF76B', '#79ED61', '#ffffff', '#BAF6FC', '#D4E3FE',
  '#D9CAFE', '#F1C9FE', '#F4A4C0', '#FFC4AB', '#FFE4A8', '#CCE8B5'
]

const DEFAULT_JELLY_CONFIG: JellyConfig = {
  color1: '#e392fe',
  color2: '#d357fe',
  opacity: 1.0,
  reflectivity: 0.12,
  pattern: 0,
}

function App() {
  // Preloader & Experience state
  const [loadPercentage, setLoadPercentage] = useState(0)
  const [isPreloaderDone, setIsPreloaderDone] = useState(false)
  const [isTransitionOpened, setIsTransitionOpened] = useState(false)
  /* True once the shards have swarmed into the orb and the camera has
     finished its dolly. The click-and-hold UI is gated on THIS, not on
     isTransitionOpened, so the interface arrives as the orb closes instead
     of hanging in space over an empty scene while the shards fly in. */
  const [isAssembled, setIsAssembled] = useState(false)

  // Enter Experience / Click & Hold State
  const [isEntered, setIsEntered] = useState(false)
  const [holdProgress, setHoldProgress] = useState(0)
  const [isHolding, setIsHolding] = useState(false)
  const holdRafRef = useRef<number | null>(null)
  const holdStartTimeRef = useRef<number>(0)

  // Navigation & Modals
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isWorkOpen, setIsWorkOpen] = useState(false)
  const [isContactOpen, setIsContactOpen] = useState(false)

  // Audio State
  const [isSoundOn, setIsSoundOn] = useState(true)

  // Scroll audio cue tracking (visual scroll lives in the shared scrollStore)
  const lastScrollCueRef = useRef(0)

  // Custom Magnetic Cursor
  /* The cursor is driven IMPERATIVELY through a ref. It used to be React
     state written on every mousemove, which re-rendered the entire app —
     canvas wrapper and all — hundreds of times a second. That is what made
     the cursor lag, stutter and feel "buggy": it was always a few frames
     behind the real pointer. Now the transform is written straight to the
     node inside a rAF, so it tracks perfectly and costs no renders. */
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const cursorTargetRef = useRef({ x: -100, y: -100 })
  const cursorRafRef = useRef<number | null>(null)
  const [cursorText, setCursorText] = useState('')
  const [isCursorDiff, setIsCursorDiff] = useState(false)
  const [isCursorExpanded, setIsCursorExpanded] = useState(false)

  // Customize Me Widget State
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false)
  const [customizeTab, setCustomizeTab] = useState<'color1' | 'color2' | 'pattern1' | 'pattern2'>('color1')
  const [jellyConfig, setJellyConfig] = useState<JellyConfig>(DEFAULT_JELLY_CONFIG)

  // Preloader Counter Simulation
  useEffect(() => {
    let current = 0
    const interval = setInterval(() => {
      const step = current < 65 ? Math.floor(Math.random() * 8) + 4 : Math.floor(Math.random() * 5) + 1
      current = Math.min(current + step, 100)
      setLoadPercentage(current)

      if (current >= 100) {
        clearInterval(interval)
        setTimeout(() => {
          setIsPreloaderDone(true)
          sound.playClick(1050)
        }, 250)
      }
    }, 38)

    return () => clearInterval(interval)
  }, [])

  // Auto-unlock audio on user interaction
  useEffect(() => {
    const unlockAudio = () => {
      sound.initCtx()
      sound.startSoothingMusic()
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }
    window.addEventListener('pointerdown', unlockAudio, { once: true })
    window.addEventListener('keydown', unlockAudio, { once: true })

    return () => {
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }
  }, [])

  // Start Experience Click Handler
  const handleStartExperience = () => {
    sound.playStartChime()
    setIsTransitionOpened(true)
    // Rising sweep that runs underneath the shard fly-in.
    sound.playAssembleSweep()
    /* Must stay in lockstep with ASSEMBLE_MS in JellyCanvas. A shade longer so
       the UI lands just after the last plate seats, never before. */
    window.setTimeout(() => setIsAssembled(true), 2750)
  }

  // Lock scrolling before holding to enter
  useEffect(() => {
    if (!isEntered) {
      document.body.style.overflow = 'hidden'
      window.scrollTo(0, 0)
      const preventDefaultScroll = (e: Event) => {
        e.preventDefault()
      }
      window.addEventListener('wheel', preventDefaultScroll, { passive: false })
      window.addEventListener('touchmove', preventDefaultScroll, { passive: false })
      return () => {
        window.removeEventListener('wheel', preventDefaultScroll)
        window.removeEventListener('touchmove', preventDefaultScroll)
      }
    } else {
      document.body.style.overflow = 'auto'
    }
  }, [isEntered])

  // =========================================================================
  // CLICK AND HOLD INTERACTION
  // =========================================================================
  const enterExperience = () => {
    if (isEntered) return
    setIsEntered(true)
    setIsHolding(false)
    setHoldProgress(1)
    sound.playHoldBurst()
    document.body.style.overflow = 'auto'
    /* The "CLICK AND HOLD" label is set by the canvas hover test, which only
       re-runs on mouse MOVE. Entering without moving the mouse would leave the
       label stuck on screen, so clear it explicitly here. */
    resetCursor()
  }

  useEffect(() => {
    // Ignore press-and-hold until the orb exists to be held.
    if (isEntered || !isTransitionOpened || !isAssembled) return

    const handleDown = (e: MouseEvent | TouchEvent) => {
      if (isEntered) return
      const target = e.target as HTMLElement
      if (target.closest('.options-menu, .selected-menu, header, .mobile-menu, button, input, .volume, .send, .home-footer a')) {
        return
      }

      setIsHolding(true)
      sound.startHoldCharge()
      holdStartTimeRef.current = performance.now()

      if (holdRafRef.current) cancelAnimationFrame(holdRafRef.current)

      const tickHold = () => {
        const elapsed = performance.now() - holdStartTimeRef.current
        const p = Math.min(elapsed / 1300, 1) // 1.3 seconds hold

        setHoldProgress(p)
        sound.updateHoldProgress(p)

        if (p >= 1) {
          enterExperience()
        } else {
          holdRafRef.current = requestAnimationFrame(tickHold)
        }
      }

      holdRafRef.current = requestAnimationFrame(tickHold)
    }

    const handleUp = () => {
      if (isEntered) return
      if (holdRafRef.current) cancelAnimationFrame(holdRafRef.current)

      setIsHolding(false)
      sound.stopHoldCharge()

      // Smooth decay
      const decay = () => {
        setHoldProgress((prev) => {
          if (prev <= 0.03) return 0
          const next = prev - 0.06
          holdRafRef.current = requestAnimationFrame(decay)
          return next
        })
      }
      holdRafRef.current = requestAnimationFrame(decay)
    }

    window.addEventListener('mousedown', handleDown)
    window.addEventListener('mouseup', handleUp)
    window.addEventListener('touchstart', handleDown, { passive: true })
    window.addEventListener('touchend', handleUp)

    return () => {
      window.removeEventListener('mousedown', handleDown)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('touchstart', handleDown)
      window.removeEventListener('touchend', handleUp)
    }
  }, [isEntered, isTransitionOpened, isAssembled])

  // Hand the scroll track over to the shared eased scroll store once the
  // experience is entered, and ride it for the audio swoosh cues.
  useEffect(() => {
    if (!isEntered) {
      scrollStore.reset()
      return
    }
    scrollStore.start()
    return scrollStore.subscribe((smooth) => {
      const diff = Math.abs(smooth - lastScrollCueRef.current)
      if (diff > 0.04) {
        sound.playScrollSwoosh(diff * 4.5)
        lastScrollCueRef.current = smooth
      }
    })
  }, [isEntered])

  // Custom Cursor Mouse Listener with Automatic Hover Detection
  useEffect(() => {
    // rAF loop: coalesces many mousemoves into one write per frame.
    const tick = () => {
      const el = cursorRef.current
      if (el) {
        const { x, y } = cursorTargetRef.current
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`
      }
      cursorRafRef.current = requestAnimationFrame(tick)
    }
    cursorRafRef.current = requestAnimationFrame(tick)

    const handleMouseMove = (e: MouseEvent) => {
      cursorTargetRef.current = { x: e.clientX, y: e.clientY }

      const target = e.target as HTMLElement | null
      if (!target) return

      // When hovering text input fields or textarea, hide custom cursor so native I-beam cursor is clear
      if (target.closest('input, textarea')) {
        setIsCursorExpanded(false)
        setCursorText('')
        return
      }

      // Check [data-cursor]
      const cursorTarget = target.closest('[data-cursor]') as HTMLElement | null
      if (cursorTarget) {
        const val = cursorTarget.getAttribute('data-cursor') || ''
        setCursorText(val)
        setIsCursorExpanded(true)
        setIsCursorDiff(false)
        return
      }

      // If hovering over buttons or links without custom cursor text, give slight expansion
      if (target.closest('button, a, .clickable, .tab-btn, .color, .send, .volume')) {
        if (!cursorText) {
          setIsCursorExpanded(true)
        }
      }
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (cursorRafRef.current) cancelAnimationFrame(cursorRafRef.current)
    }
  }, [cursorText])

  const setCursorHover = (text: string, isDiff: boolean = false) => {
    setCursorText(text)
    setIsCursorExpanded(!!text)
    setIsCursorDiff(isDiff)
  }

  const resetCursor = () => {
    setCursorText('')
    setIsCursorExpanded(false)
    setIsCursorDiff(false)
  }

  // Audio Toggle
  const handleToggleSound = () => {
    const next = sound.toggleSound()
    setIsSoundOn(next)
  }

  // Reset Jelly Config to Defaults
  const handleResetJelly = () => {
    sound.playBubble(700)
    setJellyConfig(DEFAULT_JELLY_CONFIG)
  }


  return (
    <div className="aurelia-app">
      {/* Custom Cursor */}
      <div
        id="cursor"
        ref={cursorRef}
        className={`${isCursorDiff ? 'dif' : ''} ${isCursorExpanded ? 'expanded' : ''}`}
      >
        <div className="wrapper">
          <div className="text">
            <p>{cursorText}</p>
          </div>
        </div>
      </div>

      {/* Circle Wipe Transition */}
      <div className={`transition-component ${isTransitionOpened ? 'is-opened' : ''}`}>
        <div className="wrapper">
          <h1 className="logo-text">Aurelia Labs</h1>
        </div>
        <div className="dots" />
      </div>

      {/* Preloader */}
      <div className={`home-preloader ${isPreloaderDone ? 'is-done' : ''} ${isTransitionOpened ? 'is-hidden' : ''}`}>
        <div className="top" />

        <div className="center">
          {/* Active Loading State */}
          <div className="loading">
            <p>Loading</p>
          </div>

          <div className="progress">
            <div className="bar">
              <div className="space">
                <div
                  className="fill"
                  style={{ left: `${Math.min(loadPercentage, 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="value">
            <p>
              {loadPercentage}
              <span>%</span>
            </p>
          </div>

          {/* Morph to IMMERSE ME IN [START] State */}
          <div className="done">
            <div className="text text-1">
              <p>Immerse</p>
            </div>

            <div
              className="send"
              onClick={handleStartExperience}
              onMouseEnter={() => {
                sound.playClick(1100)
                setCursorHover('START', true)
              }}
              onMouseLeave={resetCursor}
            >
              <div className="child">
                <span className="elem elem-1">[</span>
                <span className="elem elem-2">]</span>
                <span className="elem elem-3">[</span>
                <span className="elem elem-4">]</span>
                <div className="circle">
                  <div className="inner-circle">
                    <p>start</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="text text-2">
              <p>
                me in <img alt="arrow" className="arrow" src="/images/icons/arrowNext.svg" />
              </p>
            </div>
          </div>
        </div>

        <div className="bottom">
          <div
            className="volume"
            onClick={handleToggleSound}
            onMouseEnter={() => {
              sound.playClick(900)
              setCursorHover('SOUND')
            }}
            onMouseLeave={resetCursor}
          >
            <div className="lines">
              <img className={`off ${isSoundOn ? 'active' : ''}`} alt="lines" src="/images/icons/WavesOff.png" />
              <img className={`on ${isSoundOn ? 'active' : ''}`} alt="lines" src="/images/icons/Waves.png" />
            </div>
            <div className={`status ${isSoundOn ? 'active' : ''}`}>
              <p>{isSoundOn ? 'on' : 'off'}</p>
            </div>
            <div className="back-left" />
            <div className="back-right" />
          </div>
          <p>
            To make this experience more<br />immersive we use sound effects
          </p>
        </div>
      </div>

      {/* Fixed Header (Reveals only after immersing into experience) */}
      <header className={isEntered ? 'is-visible' : ''}>
        <div className="header">
          <div
            className="header-logo"
            onMouseEnter={() => {
              sound.playClick(950)
              setCursorHover('HOME', true)
            }}
            onMouseLeave={resetCursor}
          >
            <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
              <span>aurelia</span> <span className="logo-script">labs</span>
            </a>
          </div>

          <div className="right-menu">
            <a
              href="#work"
              onClick={(e) => {
                e.preventDefault()
                sound.playClick(1100)
                setIsWorkOpen(true)
              }}
              onMouseEnter={() => {
                sound.playClick(950)
                setCursorHover('WORK', true)
              }}
              onMouseLeave={resetCursor}
            >
              [<span>Work</span>]
            </a>

            <a
              href="https://noomoagency.com/?ref=labs"
              target="_blank"
              rel="noreferrer"
              onClick={() => sound.playClick(1100)}
              onMouseEnter={() => {
                sound.playClick(950)
                setCursorHover('AGENCY', true)
              }}
              onMouseLeave={resetCursor}
            >
              [<span>Aurelia Agency</span>]
            </a>

            <a
              href="#contact"
              onClick={(e) => {
                e.preventDefault()
                sound.playClick(1100)
                setIsContactOpen(true)
              }}
              onMouseEnter={() => {
                sound.playClick(950)
                setCursorHover('CONTACT', true)
              }}
              onMouseLeave={resetCursor}
            >
              [<span>Contact</span>]
            </a>

            {/* Hamburger Switch */}
            <div
              className={`menu-switch ${isMobileMenuOpen ? 'active' : ''}`}
              onClick={() => {
                sound.playClick(1000)
                setIsMobileMenuOpen(!isMobileMenuOpen)
              }}
              onMouseEnter={() => setCursorHover('MENU', true)}
              onMouseLeave={resetCursor}
            >
              <div className="line" />
              <div className="line" />
              <span className="el el-1">[</span>
              <span className="el el-2">]</span>
              <span className="el el-3">[</span>
              <span className="el el-4">]</span>
            </div>

            {/* Mobile Menu Drawer */}
            <div className={`mobile-menu ${isMobileMenuOpen ? 'active' : ''}`}>
              <div className="top">
                <a
                  href="#"
                  onClick={() => {
                    setIsMobileMenuOpen(false)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                >
                  [<span>Home</span>]
                </a>
                <a
                  href="#"
                  onClick={() => {
                    setIsMobileMenuOpen(false)
                    setIsWorkOpen(true)
                  }}
                >
                  [<span>Work</span>]
                </a>
                <a
                  href="https://noomoagency.com/?ref=labs"
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  [<span>Aurelia Agency</span>]
                </a>
                <a
                  href="#"
                  onClick={() => {
                    setIsMobileMenuOpen(false)
                    setIsContactOpen(true)
                  }}
                >
                  [<span>Contact</span>]
                </a>
              </div>
              <div className="bottom">
                <a href="https://linkedin.com" target="_blank" rel="noreferrer">LinkedIn</a>
                <a href="https://twitter.com" target="_blank" rel="noreferrer">Twitter</a>
                <a href="mailto:hello@aurelia.studio">hello@aurelia.studio</a>
              </div>
            </div>
          </div>
        </div>
      </header>


      {/* Hero Studio Identity & Crazy Animated Accolades */}
      <div className={`hero-giant-title ${isEntered ? 'is-hidden' : ''} ${isAssembled ? '' : 'is-preload'}`}>
        <div className="hero-studio-container">
          
          {/* Top Studio Prestige Tag */}
          <div className="hero-studio-badge">
            <span className="live-dot" />
            <span className="badge-text">DIGITAL INNOVATION &amp; SPATIAL DESIGN ATELIER</span>
            <span className="badge-sep">/</span>
            <span className="badge-status">ACCEPTING Q3–Q4 COMMISSIONS</span>
          </div>

          {/* Main Giant Studio Title with Staggered Characters */}
          <div className="hero-title-wrap">
            <h1 className="hero-title-text" aria-label="AURELIA LABS">
              <span className="char">A</span>
              <span className="char">U</span>
              <span className="char">R</span>
              <span className="char">E</span>
              <span className="char">L</span>
              <span className="char">I</span>
              <span className="char">A</span>
              <span className="char space">&nbsp;</span>
              <span className="char">L</span>
              <span className="char">A</span>
              <span className="char">B</span>
              <span className="char">S</span>
            </h1>
          </div>

          {/* Studio Pitch & Accolades */}
          <div className="hero-studio-pitch">
            <p className="pitch-primary">
              WE ARCHITECT HYPER-SENSORY 3D DIGITAL WORLDS, SPATIAL COMPUTING &amp; LUXURY EXPERIENCES
            </p>
            <p className="pitch-secondary">
              Awarded 14x Awwwards SOTD · 8x FWA of the Day · Crafting unmissable digital art for visionary brands
            </p>
          </div>

          {/* Floating Studio Capability Pills (Left & Right Flanks) */}
          <div className="hero-floating-pills">
            <div
              className="hero-pill pill-left"
              onClick={() => {
                sound.playClick(1100)
                setIsWorkOpen(true)
              }}
              onMouseEnter={() => setCursorHover('EXPLORE', true)}
              onMouseLeave={resetCursor}
            >
              <div className="pill-dot" />
              <div>
                <span className="pill-title">SPATIAL COMPUTING &amp; XR</span>
                <span className="pill-sub">EXPLORE LAB WORKS →</span>
              </div>
            </div>

            <div
              className="hero-pill pill-right"
              onClick={() => {
                sound.playClick(1100)
                setIsContactOpen(true)
              }}
              onMouseEnter={() => setCursorHover('CONNECT', true)}
              onMouseLeave={resetCursor}
            >
              <div className="pill-dot" />
              <div>
                <span className="pill-title">CREATIVE ENGINEERING</span>
                <span className="pill-sub">START A PROJECT →</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 3D WebGL Canvas with Faceted Chrome Sphere & Jellyfish */}
      <JellyCanvas
        config={jellyConfig}
        holdProgress={holdProgress}
        isEntered={isEntered}
        isTransitionOpened={isTransitionOpened}
        onHoverModel={(isHovering) => {
          // Only offer the affordance once the orb is actually assembled.
          if (!isEntered && isAssembled) {
            setIsCursorExpanded(isHovering)
            setCursorText(isHovering ? 'CLICK AND HOLD' : '')
          }
        }}
      />

      {/* Hero Bottom Bar: ARE YOU READY TO STEP INTO THE FUTURE? + Progress Fill */}
      <div className={`hero-bottom-bar ${isEntered ? 'is-hidden' : ''} ${isAssembled ? 'is-visible' : ''}`}>
        <div className="bottom-row">
          <span className="tagline">ARE YOU READY TO STEP INTO THE FUTURE?</span>
          <div className="right-hold-group">
            <span className="hold-text">CLICK AND HOLD</span>
          </div>
        </div>
        <div className="full-progress-track">
          <div
            className="full-progress-fill"
            style={{ width: `${Math.min(holdProgress * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* ==================================================================
          THE SCROLL NARRATIVE
            00–30%  ROTATE · the world turns, four words rise from below
            30–58%  ASCEND · the jellyfish climbs past 3D word sculptures
            58–82%  WORK   · four rotating glass project rings
            82–100% ARRIVE · camera detaches and settles on AURELIA
          ================================================================== */}
      <ScrollNarrative isEntered={isEntered} />


      {/* 10,000px Virtual Scroll Track & Footer (ONLY rendered when entered) */}
      {isEntered && (
        <>
          <div className="home-page" />

          {/* Frosted Glass Footer */}
          <div className="home-footer">
            <div className="wrapper">
              <h4>Let's innovate together</h4>

              <div
                className="send"
                onClick={() => {
                  sound.playClick(1000)
                  setIsContactOpen(true)
                }}
                onMouseEnter={() => {
                  sound.playClick(1200)
                  setCursorHover('SEND', false)
                }}
                onMouseLeave={resetCursor}
              >
                <div className="child">
                  <span className="elem elem-1">[</span>
                  <span className="elem elem-2">]</span>
                  <span className="elem elem-3">[</span>
                  <span className="elem elem-4">]</span>
                  <div className="circle">
                    <div className="inner-circle">
                      <p>
                        send<br />message
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="for-social">
                <div className="socials">
                  <a
                    href="https://linkedin.com"
                    target="_blank"
                    rel="noreferrer"
                    onMouseEnter={() => setCursorHover('LINKEDIN', false)}
                    onMouseLeave={resetCursor}
                  >
                    linkedin
                  </a>
                  <a
                    href="mailto:hello@aurelia.studio"
                    onMouseEnter={() => setCursorHover('EMAIL', false)}
                    onMouseLeave={resetCursor}
                  >
                    hello@aurelia.studio
                  </a>
                  <a
                    href="https://twitter.com"
                    target="_blank"
                    rel="noreferrer"
                    onMouseEnter={() => setCursorHover('TWITTER', false)}
                    onMouseLeave={resetCursor}
                  >
                    twitter
                  </a>
                </div>

                <div className="bottom">
                  <p className="copy">© Aurelia Labs · All rights reserved</p>
                </div>
              </div>

              <div className="points" />
            </div>
          </div>
        </>
      )}

      {/* Fixed Bottom UI Controls */}
      <div className={`social-links-global-parent ${isAssembled ? 'is-visible' : ''}`}>
        <div className="social-links-global">
          {/* Bottom Left Volume Toggle */}
          <div
            className="volume"
            onClick={handleToggleSound}
            onMouseEnter={() => {
              sound.playClick(900)
              setCursorHover('AUDIO')
            }}
            onMouseLeave={resetCursor}
          >
            <div className="lines">
              <img className={`off ${isSoundOn ? 'active' : ''}`} alt="lines" src="/images/icons/WavesOff.png" />
              <img className={`on ${isSoundOn ? 'active' : ''}`} alt="lines" src="/images/icons/Waves.png" />
            </div>
            <div className={`status ${isSoundOn ? 'active' : ''}`}>
              <p>{isSoundOn ? 'on' : 'off'}</p>
            </div>
            <div className="back-left" />
            <div className="back-right" />
          </div>

          {/* Bottom Right "Customize Me" AR / Jelly Widget */}
          <div
            className={`ar-mode ${isCustomizeOpen ? 'active' : ''}`}
            onMouseEnter={() => {
              if (!isCustomizeOpen) {
                sound.playSweep(true)
                setIsCustomizeOpen(true)
              }
            }}
            onMouseLeave={() => {
              if (isCustomizeOpen) {
                sound.playSweep(false)
                setIsCustomizeOpen(false)
              }
            }}
          >
            <img alt="icon" className="jel-icon" src="/images/icons/JelIcon.svg" />

            {/* Expanded Options Drawer */}
            <div className="options-menu">
              {customizeTab === 'color1' && (
                <div className="colors">
                  {PALETTE_COLORS.map((hex) => (
                    <div
                      key={hex}
                      className="color"
                      style={{ backgroundColor: hex }}
                      onClick={() => {
                        sound.playBubble(550)
                        setJellyConfig({ ...jellyConfig, color1: hex })
                      }}
                      onMouseEnter={() => sound.playClick(1400)}
                    />
                  ))}
                </div>
              )}

              {customizeTab === 'color2' && (
                <div className="colors">
                  {PALETTE_COLORS.map((hex) => (
                    <div
                      key={hex}
                      className="color"
                      style={{ backgroundColor: hex }}
                      onClick={() => {
                        sound.playBubble(680)
                        setJellyConfig({ ...jellyConfig, color2: hex })
                      }}
                      onMouseEnter={() => sound.playClick(1400)}
                    />
                  ))}
                </div>
              )}

              {customizeTab === 'pattern1' && (
                <div className="slider-block">
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={Math.round(jellyConfig.opacity * 100)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) / 100
                      setJellyConfig({ ...jellyConfig, opacity: val })
                    }}
                  />
                  <div className="value-block">
                    <span className="value">{Math.round(jellyConfig.opacity * 100)}%</span>
                  </div>
                </div>
              )}

              {customizeTab === 'pattern2' && (
                <div className="slider-block">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(jellyConfig.reflectivity * 100)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) / 100
                      setJellyConfig({ ...jellyConfig, reflectivity: val })
                    }}
                  />
                  <div className="value-block">
                    <span className="value">{jellyConfig.reflectivity.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Selected Menu Tabs Bar */}
            <div className="selected-menu">
              <div className="top">
                <div className="options">
                  <div
                    className={`item color-item ${customizeTab === 'color1' ? 'is-selected' : ''}`}
                    onClick={() => {
                      sound.playClick(1000)
                      setCustomizeTab('color1')
                    }}
                  >
                    <div className="color-preview" style={{ backgroundColor: jellyConfig.color1 }} />
                  </div>

                  <div
                    className={`item color-item ${customizeTab === 'color2' ? 'is-selected' : ''}`}
                    onClick={() => {
                      sound.playClick(1000)
                      setCustomizeTab('color2')
                    }}
                  >
                    <div className="color-preview" style={{ backgroundColor: jellyConfig.color2 }} />
                  </div>

                  <div
                    className={`item ${customizeTab === 'pattern1' ? 'is-selected' : ''}`}
                    onClick={() => {
                      sound.playClick(1000)
                      setCustomizeTab('pattern1')
                    }}
                  >
                    <img alt="pattern" className="pattern-img" src="/images/icons/patternCus1.png" />
                  </div>

                  <div
                    className={`item ${customizeTab === 'pattern2' ? 'is-selected' : ''}`}
                    onClick={() => {
                      sound.playClick(1000)
                      setCustomizeTab('pattern2')
                    }}
                  >
                    <img alt="pattern" className="pattern-img" src="/images/icons/patternCus2.png" />
                  </div>
                </div>
              </div>

              <div className="bottom">
                <img
                  alt="icon"
                  className="restart"
                  src="/images/icons/restartIcon.svg"
                  title="Reset Defaults"
                  onClick={handleResetJelly}
                />
                <p className="title">customize me</p>
                <div className="place" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Work & Contact Modals */}
      <WorkModal isOpen={isWorkOpen} onClose={() => setIsWorkOpen(false)} />
      <ContactModal isOpen={isContactOpen} onClose={() => setIsContactOpen(false)} />
    </div>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
