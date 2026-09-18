import { useEffect, useRef, useState } from 'react'

type CursorState = {
  x: number
  y: number
  scale: number
  rotation: number
  stretch: number
  label: string
  hovering: boolean
  clicking: boolean
  visible: boolean
}

export function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const target = useRef({ x: -100, y: -100 })
  const position = useRef({ x: -100, y: -100 })
  const velocity = useRef({ x: 0, y: 0 })
  const frame = useRef<number>(0)
  const [state, setState] = useState<CursorState>({
    x: -100,
    y: -100,
    scale: 1,
    rotation: 0,
    stretch: 1,
    label: '',
    hovering: false,
    clicking: false,
    visible: false
  })

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return

    const cursor = cursorRef.current
    const dot = dotRef.current

    if (!cursor || !dot) return

    let visible = false
    let hovering = false
    let clicking = false
    let label = ''
    let hoverScale = 1
    let currentScale = 1
    let currentRotation = 0
    let currentStretch = 1
    let lastTime = performance.now()

    const setTarget = (x: number, y: number) => {
      target.current.x = x
      target.current.y = y
    }

    const updateTarget = (e: MouseEvent) => {
      setTarget(e.clientX, e.clientY)

      const element = (e.target as HTMLElement)?.closest(
        '[data-cursor], a, button, input, textarea, select, [role="button"]'
      ) as HTMLElement | null

      const cursorType = element?.getAttribute('data-cursor') || ''

      if (element) {
        hovering = true
        label = cursorType
        hoverScale = cursorType ? 1.65 : 1.35
      } else {
        hovering = false
        label = ''
        hoverScale = 1
      }

      if (!visible) {
        position.current.x = e.clientX
        position.current.y = e.clientY
        visible = true
      }
    }

    const onMouseDown = () => {
      clicking = true
    }

    const onMouseUp = () => {
      clicking = false
    }

    const onMouseLeave = () => {
      visible = false
    }

    const onMouseEnter = () => {
      visible = true
    }

    const animate = (time: number) => {
      const delta = Math.min((time - lastTime) / 16.67, 2)
      lastTime = time

      const dx = target.current.x - position.current.x
      const dy = target.current.y - position.current.y

      position.current.x += dx * (1 - Math.pow(0.78, delta))
      position.current.y += dy * (1 - Math.pow(0.78, delta))

      velocity.current.x = dx
      velocity.current.y = dy

      const speed = Math.min(
        Math.sqrt(dx * dx + dy * dy) / 30,
        1
      )

      currentScale += (
        (hoverScale * (clicking ? 0.78 : 1)) - currentScale
      ) * (1 - Math.pow(0.72, delta))

      const targetRotation = Math.max(
        -15,
        Math.min(15, dx * 0.12)
      )

      currentRotation += (
        targetRotation - currentRotation
      ) * (1 - Math.pow(0.8, delta))

      currentStretch += (
        (1 + speed * 0.12) - currentStretch
      ) * (1 - Math.pow(0.8, delta))

      cursor.style.transform = `
        translate3d(${position.current.x}px, ${position.current.y}px, 0)
        translate(-50%, -50%)
        rotate(${currentRotation}deg)
        scale(${currentScale * currentStretch}, ${currentScale / currentStretch})
      `

      dot.style.transform = `
        translate3d(${target.current.x}px, ${target.current.y}px, 0)
        translate(-50%, -50%)
        scale(${clicking ? 0.65 : hovering ? 0.75 : 1})
      `

      cursor.style.opacity = visible ? '1' : '0'
      dot.style.opacity = visible ? '1' : '0'

      frame.current = requestAnimationFrame(animate)
    }

    window.addEventListener('mousemove', updateTarget, { passive: true })
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    document.addEventListener('mouseleave', onMouseLeave)
    document.addEventListener('mouseenter', onMouseEnter)

    frame.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('mousemove', updateTarget)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('mouseleave', onMouseLeave)
      document.removeEventListener('mouseenter', onMouseEnter)
      cancelAnimationFrame(frame.current)
    }
  }, [])

  useEffect(() => {
    const cursor = cursorRef.current
    if (!cursor) return

    const updateLabel = () => {
      const element = document.elementFromPoint(
        target.current.x,
        target.current.y
      )?.closest('[data-cursor]') as HTMLElement | null

      if (element) {
        setState((prev) => ({
          ...prev,
          label: element.getAttribute('data-cursor') || '',
          hovering: true
        }))
      }
    }

    window.addEventListener('mousemove', updateLabel, { passive: true })

    return () => {
      window.removeEventListener('mousemove', updateLabel)
    }
  }, [])

  return (
    <div className="custom-cursor">
      <div ref={cursorRef} className="cursor-orb">
        <div className="cursor-orb-inner" />
        <span className="cursor-label">
          {state.label}
        </span>
      </div>

      <div ref={dotRef} className="cursor-dot" />
    </div>
  )
}
