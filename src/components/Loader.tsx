import { useEffect, useRef, useState } from 'react'

interface LoaderProps {
  onComplete: () => void
}

export function Loader({ onComplete }: LoaderProps) {
  const [progress, setProgress] = useState(0)
  const [isFading, setIsFading] = useState(false)
  const [isExited, setIsExited] = useState(false)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    let current = 0
    const interval = setInterval(() => {
      current += Math.floor(Math.random() * 6) + 3
      if (current >= 100) {
        current = 100
        setProgress(100)
        clearInterval(interval)
        setTimeout(() => {
          setIsFading(true)
          setTimeout(() => {
            setIsExited(true)
            onCompleteRef.current()
          }, 800)
        }, 250)
      } else {
        setProgress(current)
      }
    }, 30)

    return () => clearInterval(interval)
  }, [])

  if (isExited) return null

  return (
    <div className={`minimal-loader ${isFading ? 'is-fading' : ''}`}>
      <div className="loader-center">
        <span className="loader-sub">STUDIO ATELIER · 2026</span>
        <h1 className="loader-title">Aurelia</h1>
        <div className="loader-line-track">
          <div className="loader-line-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="loader-counter">
          <span>{String(progress).padStart(2, '0')}</span>
          <span className="counter-pct">%</span>
        </div>
      </div>
    </div>
  )
}
