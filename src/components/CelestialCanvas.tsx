import { useEffect, useRef } from 'react'

export function CelestialCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mouse = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let time = 0

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
    }

    updateSize()
    window.addEventListener('resize', updateSize)

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const nx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2)
      const ny = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2)
      mouse.current.targetX = Math.max(-1, Math.min(1, nx))
      mouse.current.targetY = Math.max(-1, Math.min(1, ny))
    }

    const onMouseLeave = () => {
      mouse.current.targetX = 0
      mouse.current.targetY = 0
    }

    window.addEventListener('mousemove', onMouseMove)
    document.body.addEventListener('mouseleave', onMouseLeave)

    // Orbital particles
    const ringParticles = Array.from({ length: 40 }, (_, i) => ({
      angle: (i / 40) * Math.PI * 2,
      radiusRatio: 0.95 + Math.random() * 0.25,
      speed: 0.003 + Math.random() * 0.003,
      size: Math.random() * 1.6 + 0.6,
      alpha: Math.random() * 0.6 + 0.3
    }))

    const render = () => {
      const rect = canvas.getBoundingClientRect()
      const w = rect.width
      const h = rect.height

      // Completely clear canvas with full transparency
      ctx.clearRect(0, 0, w, h)

      mouse.current.x += (mouse.current.targetX - mouse.current.x) * 0.06
      mouse.current.y += (mouse.current.targetY - mouse.current.y) * 0.06

      time += 0.015

      const cx = w / 2 + mouse.current.x * 20
      const cy = h / 2 + mouse.current.y * 20
      const radius = Math.min(w, h) * 0.36 + Math.sin(time * 1.5) * 3

      // 1. Soft spherical glow (contained strictly within radial bounds)
      const glow = ctx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, radius * 1.25)
      glow.addColorStop(0, 'rgba(255, 252, 198, 0.3)')
      glow.addColorStop(0.5, 'rgba(218, 155, 121, 0.1)')
      glow.addColorStop(1, 'rgba(217, 230, 83, 0)')

      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, radius * 1.25, 0, Math.PI * 2)
      ctx.fill()

      // 2. Main Spherical Body
      const lightX = cx - radius * 0.35 + mouse.current.x * 15
      const lightY = cy - radius * 0.4 + mouse.current.y * 15

      const sphereGrad = ctx.createRadialGradient(
        lightX,
        lightY,
        radius * 0.02,
        cx,
        cy,
        radius
      )

      sphereGrad.addColorStop(0, '#ffffff')
      sphereGrad.addColorStop(0.12, '#fffcc6')
      sphereGrad.addColorStop(0.3, '#f9ed73')
      sphereGrad.addColorStop(0.55, '#da9b79')
      sphereGrad.addColorStop(0.8, '#5d202a')
      sphereGrad.addColorStop(1, '#1b211d')

      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.clip()

      ctx.fillStyle = sphereGrad
      ctx.fill()

      // Internal fluid refraction wave inside the clipped sphere
      ctx.globalCompositeOperation = 'screen'
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
      ctx.beginPath()
      for (let x = -radius; x <= radius; x += 8) {
        const yOffset = Math.sin((x / radius) * 3.5 + time * 2) * 10
        const y = Math.sqrt(Math.max(0, radius * radius - x * x)) * 0.25 + yOffset
        if (x === -radius) ctx.moveTo(cx + x, cy + y)
        else ctx.lineTo(cx + x, cy + y)
      }
      ctx.lineTo(cx + radius, cy + radius)
      ctx.lineTo(cx - radius, cy + radius)
      ctx.closePath()
      ctx.fill()

      ctx.restore()

      // 3. Ethereal orbital ring
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(-0.55 + mouse.current.x * 0.08)
      ctx.scale(1, 0.24)

      ctx.beginPath()
      ctx.arc(0, 0, radius * 1.35, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Ring orbital particle glints
      ringParticles.forEach((p) => {
        p.angle += p.speed
        const px = Math.cos(p.angle) * radius * p.radiusRatio
        const py = Math.sin(p.angle) * radius * p.radiusRatio

        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`
        ctx.beginPath()
        ctx.arc(px, py, p.size, 0, Math.PI * 2)
        ctx.fill()
      })

      ctx.restore()

      animId = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener('resize', updateSize)
      window.removeEventListener('mousemove', onMouseMove)
      document.body.removeEventListener('mouseleave', onMouseLeave)
      cancelAnimationFrame(animId)
    }
  }, [])

  return (
    <div className="celestial-wrapper">
      <canvas ref={canvasRef} className="celestial-canvas" />
    </div>
  )
}
