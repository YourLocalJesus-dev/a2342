class SoothingAmbientAudioEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private musicGain: GainNode | null = null
  private sfxGain: GainNode | null = null
  private warmthFilter: BiquadFilterNode | null = null
  private reverbConvolver: ConvolverNode | null = null
  private sfxDryGain: GainNode | null = null
  private sfxWetGain: GainNode | null = null
  private compressor: DynamicsCompressorNode | null = null
  private isMuted = false
  private isPlayingMusic = false
  private currentChordIndex = 0
  private chordTimer: number | null = null
  private activeVoices: GainNode[] = []
  private lastShardChimeTime = 0

  private holdOsc: OscillatorNode | null = null
  private holdFilter: BiquadFilterNode | null = null
  private holdGain: GainNode | null = null

  private chords = [
    [130.81, 196, 246.94, 293.66, 392],
    [110, 164.81, 220, 261.63, 329.63],
    [87.31, 130.81, 174.61, 220, 261.63, 369.99],
    [98, 146.83, 196, 293.66, 392, 440],
  ]

  private buildReverbImpulse(
    duration = 2.6,
    decay = 3.2,
  ): AudioBuffer | null {
    if (!this.ctx) return null

    const sampleRate = this.ctx.sampleRate
    const length = Math.max(1, Math.floor(sampleRate * duration))
    const impulse = this.ctx.createBuffer(2, length, sampleRate)

    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel)
      for (let i = 0; i < length; i++) {
        const t = i / length
        // Smooth, breathy decay rather than harsh noise burst — softened
        // by squaring the random value toward zero for a gentler tail.
        const raw = Math.random() * 2 - 1
        const soft = raw * raw * raw
        channelData[i] = soft * Math.pow(1 - t, decay)
      }
    }

    return impulse
  }

  public initCtx() {
    if (!this.ctx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as {
          webkitAudioContext: typeof AudioContext
        }).webkitAudioContext

      this.ctx = new AudioContextClass()

      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.setValueAtTime(0.42, this.ctx.currentTime)

      // Gentle overall lowpass so nothing ever feels bright or brittle.
      this.warmthFilter = this.ctx.createBiquadFilter()
      this.warmthFilter.type = 'lowpass'
      this.warmthFilter.frequency.setValueAtTime(
        3200,
        this.ctx.currentTime,
      )
      this.warmthFilter.Q.setValueAtTime(0.4, this.ctx.currentTime)

      this.compressor = this.ctx.createDynamicsCompressor()
      this.compressor.threshold.setValueAtTime(-22, this.ctx.currentTime)
      this.compressor.knee.setValueAtTime(24, this.ctx.currentTime)
      this.compressor.ratio.setValueAtTime(2.5, this.ctx.currentTime)
      this.compressor.attack.setValueAtTime(0.01, this.ctx.currentTime)
      this.compressor.release.setValueAtTime(0.4, this.ctx.currentTime)

      this.warmthFilter.connect(this.compressor)
      this.masterGain.connect(this.warmthFilter)
      this.compressor.connect(this.ctx.destination)

      // Music bus — unchanged routing, just feeds through the warmth filter.
      this.musicGain = this.ctx.createGain()
      this.musicGain.gain.setValueAtTime(0.6, this.ctx.currentTime)
      this.musicGain.connect(this.masterGain)

      // SFX bus splits into a dry path and a reverb-wet path so every
      // effect gets a soft ambient tail instead of a dry, punchy hit.
      this.sfxGain = this.ctx.createGain()
      this.sfxGain.gain.setValueAtTime(0.08, this.ctx.currentTime)

      this.sfxDryGain = this.ctx.createGain()
      this.sfxDryGain.gain.setValueAtTime(0.6, this.ctx.currentTime)

      this.sfxWetGain = this.ctx.createGain()
      this.sfxWetGain.gain.setValueAtTime(0.3, this.ctx.currentTime)

      this.reverbConvolver = this.ctx.createConvolver()
      const impulse = this.buildReverbImpulse()
      if (impulse) this.reverbConvolver.buffer = impulse

      this.sfxGain.connect(this.sfxDryGain)
      this.sfxDryGain.connect(this.masterGain)

      this.sfxGain.connect(this.reverbConvolver)
      this.reverbConvolver.connect(this.sfxWetGain)
      this.sfxWetGain.connect(this.masterGain)
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
  }

  public toggleSound(): boolean {
    this.initCtx()
    this.isMuted = !this.isMuted

    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime
      const target = this.isMuted ? 0 : 0.42

      this.masterGain.gain.cancelScheduledValues(now)
      this.masterGain.gain.setTargetAtTime(target, now, 0.1)
    }

    if (!this.isMuted && !this.isPlayingMusic) {
      this.startSoothingMusic()
    }

    if (!this.isMuted) {
      this.playClick(600)
    }

    return !this.isMuted
  }

  public get isEnabled(): boolean {
    return !this.isMuted
  }

  public startSoothingMusic() {
    this.initCtx()

    if (this.isPlayingMusic || !this.ctx || !this.musicGain) return

    this.isPlayingMusic = true
    this.playNextAmbientChord()
  }

  public stopSoothingMusic() {
    this.isPlayingMusic = false

    if (this.chordTimer !== null) {
      window.clearTimeout(this.chordTimer)
      this.chordTimer = null
    }

    if (this.ctx) {
      const now = this.ctx.currentTime

      this.activeVoices.forEach((voice) => {
        voice.gain.cancelScheduledValues(now)
        voice.gain.setTargetAtTime(0.0001, now, 0.4)
      })
    }

    this.activeVoices = []
  }

  private playNextAmbientChord() {
    if (!this.ctx || !this.musicGain || !this.isPlayingMusic) return

    const now = this.ctx.currentTime
    const chord = this.chords[this.currentChordIndex]
    this.currentChordIndex =
      (this.currentChordIndex + 1) % this.chords.length

    const duration = 9.5
    const voiceGain = this.ctx.createGain()
    const filter = this.ctx.createBiquadFilter()
    const shimmerGain = this.ctx.createGain()

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(750, now)
    filter.frequency.linearRampToValueAtTime(1250, now + 4.2)
    filter.frequency.linearRampToValueAtTime(700, now + duration)

    // Slower, smoother swell in and out — nothing arrives or leaves abruptly.
    voiceGain.gain.setValueAtTime(0.0001, now)
    voiceGain.gain.exponentialRampToValueAtTime(0.16, now + 1.1)
    voiceGain.gain.linearRampToValueAtTime(0.13, now + 4.2)
    voiceGain.gain.setValueAtTime(0.13, now + duration - 2.2)
    voiceGain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + duration + 1.8,
    )

    shimmerGain.gain.setValueAtTime(0.0001, now)
    shimmerGain.gain.linearRampToValueAtTime(0.035, now + 1.4)
    shimmerGain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + duration,
    )

    filter.connect(voiceGain)
    voiceGain.connect(this.musicGain)
    filter.connect(shimmerGain)
    shimmerGain.connect(this.musicGain)

    const oscillators: OscillatorNode[] = []

    chord.forEach((frequency, index) => {
      if (!this.ctx) return

      const oscillator = this.ctx.createOscillator()
      // Sine throughout for a rounder, breathier tone (triangle voices removed).
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, now)
      oscillator.detune.setValueAtTime(
        index % 2 === 0 ? -4 : 4,
        now,
      )

      oscillator.connect(filter)
      oscillator.start(now)
      oscillator.stop(now + duration + 2)
      oscillators.push(oscillator)
    })

    const shimmer = this.ctx.createOscillator()
    shimmer.type = 'sine'
    shimmer.frequency.setValueAtTime(chord[2] * 2, now)
    shimmer.detune.setValueAtTime(6, now)
    shimmer.connect(shimmerGain)
    shimmer.start(now)
    shimmer.stop(now + duration + 1.5)

    this.activeVoices.push(voiceGain)

    window.setTimeout(() => {
      this.activeVoices = this.activeVoices.filter(
        (voice) => voice !== voiceGain,
      )
    }, (duration + 3) * 1000)

    // Chords now overlap more generously (longer gap before the next one
    // starts fading in), so the wash of sound never has a gap or a seam.
    this.chordTimer = window.setTimeout(() => {
      if (this.isPlayingMusic) {
        this.playNextAmbientChord()
      }
    }, 7600)
  }

  public playShardChime() {
    this.initCtx()

    if (!this.ctx || !this.sfxGain || this.isMuted) return

    const now = this.ctx.currentTime

    if (now - this.lastShardChimeTime < 0.16) return

    this.lastShardChimeTime = now

    const notes = [783.99, 880, 987.77, 1174.66, 1318.51]
    const frequency = notes[Math.floor(Math.random() * notes.length)]

    const oscillator = this.ctx.createOscillator()
    const filter = this.ctx.createBiquadFilter()
    const gain = this.ctx.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, now)

    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(frequency, now)
    filter.Q.setValueAtTime(4, now)

    // Softer, rounder attack and a longer tail instead of a sharp tick.
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1)

    oscillator.connect(filter)
    filter.connect(gain)
    gain.connect(this.sfxGain)

    oscillator.start(now)
    oscillator.stop(now + 1.2)
  }

  public playStartChime() {
    this.initCtx()

    if (!this.ctx || !this.sfxGain || this.isMuted) return

    const now = this.ctx.currentTime
    const notes = [261.63, 329.63, 392, 523.25, 659.25]

    notes.forEach((frequency, index) => {
      if (!this.ctx || !this.sfxGain) return

      const oscillator = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      const filter = this.ctx.createBiquadFilter()
      const start = now + index * 0.09

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, start)

      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(1800, start)

      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(
        0.1 / (index * 0.35 + 1),
        start + 0.09,
      )
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        start + 2.4,
      )

      oscillator.connect(filter)
      filter.connect(gain)
      gain.connect(this.sfxGain)

      oscillator.start(start)
      oscillator.stop(start + 2.6)
    })

    this.startSoothingMusic()
  }

  public playClick(freq = 880) {
    this.initCtx()

    if (!this.ctx || !this.sfxGain || this.isMuted) return

    const now = this.ctx.currentTime
    const oscillator = this.ctx.createOscillator()
    const filter = this.ctx.createBiquadFilter()
    const gain = this.ctx.createGain()

    // A soft "tap" rather than a bright blip — narrower pitch swing,
    // gentler edges, and a lowpass to round off any hardness.
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(freq * 1.12, now)
    oscillator.frequency.exponentialRampToValueAtTime(
      freq * 0.9,
      now + 0.09,
    )

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(1600, now)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.032, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)

    oscillator.connect(filter)
    filter.connect(gain)
    gain.connect(this.sfxGain)

    oscillator.start(now)
    oscillator.stop(now + 0.26)
  }

  public playBubble(freq = 440) {
    this.initCtx()

    if (!this.ctx || !this.sfxGain || this.isMuted) return

    const now = this.ctx.currentTime
    const oscillator = this.ctx.createOscillator()
    const gain = this.ctx.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(freq * 0.85, now)
    oscillator.frequency.exponentialRampToValueAtTime(
      freq * 1.5,
      now + 0.3,
    )

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.06)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.62)

    oscillator.connect(gain)
    gain.connect(this.sfxGain)

    oscillator.start(now)
    oscillator.stop(now + 0.66)
  }

  public playSweep(isOpen: boolean) {
    this.initCtx()

    if (!this.ctx || !this.sfxGain || this.isMuted) return

    const now = this.ctx.currentTime
    const oscillator = this.ctx.createOscillator()
    const filter = this.ctx.createBiquadFilter()
    const gain = this.ctx.createGain()

    const startFrequency = isOpen ? 220 : 600
    const endFrequency = isOpen ? 600 : 220

    // Sine instead of triangle, and a slower sweep for a breath-like feel.
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(90, now)

    filter.type = 'lowpass'
    filter.Q.setValueAtTime(0.6, now)
    filter.frequency.setValueAtTime(startFrequency, now)
    filter.frequency.exponentialRampToValueAtTime(
      endFrequency,
      now + 0.75,
    )

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.032, now + 0.14)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85)

    oscillator.connect(filter)
    filter.connect(gain)
    gain.connect(this.sfxGain)

    oscillator.start(now)
    oscillator.stop(now + 0.9)
  }

  public playScrollSwoosh(intensity = 0.5) {
    this.initCtx()

    if (!this.ctx || !this.sfxGain || this.isMuted) return

    const now = this.ctx.currentTime
    const oscillator = this.ctx.createOscillator()
    const filter = this.ctx.createBiquadFilter()
    const gain = this.ctx.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(85, now)
    oscillator.frequency.exponentialRampToValueAtTime(
      150 + intensity * 70,
      now + 0.6,
    )

    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(160, now)
    filter.frequency.exponentialRampToValueAtTime(
      550 + intensity * 280,
      now + 0.6,
    )
    filter.Q.setValueAtTime(0.9, now)

    const volume = Math.min(0.022 + intensity * 0.022, 0.05)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.16)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85)

    oscillator.connect(filter)
    filter.connect(gain)
    gain.connect(this.sfxGain)

    oscillator.start(now)
    oscillator.stop(now + 0.9)
  }

  public startHoldCharge() {
    this.initCtx()

    if (!this.ctx || !this.sfxGain || this.isMuted) return

    this.stopHoldCharge()

    const now = this.ctx.currentTime
    const oscillator = this.ctx.createOscillator()
    const filter = this.ctx.createBiquadFilter()
    const gain = this.ctx.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(174.61, now)

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(350, now)
    filter.Q.setValueAtTime(1.2, now)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(0.032, now + 0.35)

    oscillator.connect(filter)
    filter.connect(gain)
    gain.connect(this.sfxGain)

    oscillator.start(now)

    this.holdOsc = oscillator
    this.holdFilter = filter
    this.holdGain = gain
  }

  public updateHoldProgress(progress: number) {
    if (
      !this.ctx ||
      !this.holdOsc ||
      !this.holdFilter ||
      !this.holdGain
    ) {
      return
    }

    const now = this.ctx.currentTime
    const value = Math.min(Math.max(progress, 0), 1)

    const frequency =
      174.61 + (440 - 174.61) * Math.pow(value, 1.3)

    const filterFrequency = 350 + 1200 * value
    const volume = 0.026 + 0.045 * value

    this.holdOsc.frequency.setTargetAtTime(
      frequency,
      now,
      0.14,
    )

    this.holdFilter.frequency.setTargetAtTime(
      filterFrequency,
      now,
      0.14,
    )

    this.holdGain.gain.setTargetAtTime(
      volume,
      now,
      0.14,
    )
  }

  public stopHoldCharge() {
    if (!this.ctx || !this.holdGain) return

    const now = this.ctx.currentTime

    this.holdGain.gain.cancelScheduledValues(now)
    this.holdGain.gain.setTargetAtTime(0.0001, now, 0.2)

    const oscillator = this.holdOsc

    window.setTimeout(() => {
      try {
        oscillator?.stop()
        oscillator?.disconnect()
      } catch { }

      this.holdOsc = null
      this.holdFilter = null
      this.holdGain = null
    }, 320)
  }

  public playHoldBurst() {
    this.stopHoldCharge()
    this.initCtx()

    if (!this.ctx || !this.sfxGain || this.isMuted) return

    const now = this.ctx.currentTime
    const notes = [523.25, 659.25, 783.99, 987.77, 1174.66]

    notes.forEach((frequency, index) => {
      if (!this.ctx || !this.sfxGain) return

      const oscillator = this.ctx.createOscillator()
      const filter = this.ctx.createBiquadFilter()
      const gain = this.ctx.createGain()
      const start = now + index * 0.07

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, start)

      filter.type = 'bandpass'
      filter.frequency.setValueAtTime(frequency, start)
      filter.Q.setValueAtTime(3, start)

      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(
        0.05 / (index * 0.3 + 1),
        start + 0.05,
      )
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        start + 2,
      )

      oscillator.connect(filter)
      filter.connect(gain)
      gain.connect(this.sfxGain)

      oscillator.start(start)
      oscillator.stop(start + 2.2)
    })
  }
}

export const sound = new SoothingAmbientAudioEngine()