import { useEffect, useState } from 'react'

// Background sound for focus sessions: rain, waves or brown noise, made in
// the browser with the Web Audio API (no audio files to download or
// license). It plays while a focus session runs, on every screen, and fades
// out when the session is paused or ends. The choice is kept on this device:
//   studypack.sound.v1 = { sound: 'off' | 'rain' | 'waves' | 'brown', volume: 0-1 }

const KEY = 'studypack.sound.v1'
export const SOUNDS = [
  { id: 'off', label: 'Off' },
  { id: 'rain', label: 'Rain' },
  { id: 'waves', label: 'Waves' },
  { id: 'brown', label: 'Brown noise' },
]
const DEFAULT = { sound: 'off', volume: 0.5 }
const FADE_S = 1.2
const LOOP_S = 8

export function readSound(storage = globalThis.localStorage) {
  try {
    const s = JSON.parse(storage?.getItem(KEY) ?? 'null')
    return s && SOUNDS.some((x) => x.id === s.sound) ? { sound: s.sound, volume: Math.min(1, Math.max(0, Number(s.volume) || 0)) } : DEFAULT
  } catch {
    return DEFAULT
  }
}

// Noise samples: 'pink' (rain) or 'brown' (deeper, for waves and brown noise).
export function noise(kind, length, random = Math.random) {
  const out = new Float32Array(length)
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    last = 0
  for (let i = 0; i < length; i++) {
    const white = random() * 2 - 1
    if (kind === 'brown') {
      last = (last + 0.02 * white) / 1.02
      out[i] = last * 3.5
    } else {
      b0 = 0.99765 * b0 + white * 0.099046
      b1 = 0.963 * b1 + white * 0.2965164
      b2 = 0.57 * b2 + white * 1.0526913
      out[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11
    }
  }
  return out
}

// One AudioContext for the app; the sound currently playing, if any.
let ctx = null
let playing = null

function build(sound) {
  ctx ??= new AudioContext()
  const buffer = ctx.createBuffer(1, ctx.sampleRate * LOOP_S, ctx.sampleRate)
  buffer.copyToChannel(noise(sound === 'rain' ? 'pink' : 'brown', buffer.length), 0)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = true
  const out = ctx.createGain()
  out.gain.value = 0
  let chain = source
  const add = (node) => {
    chain.connect(node)
    chain = node
    return node
  }
  if (sound === 'rain') {
    Object.assign(add(ctx.createBiquadFilter()), { type: 'highpass' }).frequency.value = 500
    Object.assign(add(ctx.createBiquadFilter()), { type: 'lowpass' }).frequency.value = 7000
  }
  const extra = []
  if (sound === 'waves') {
    Object.assign(add(ctx.createBiquadFilter()), { type: 'lowpass' }).frequency.value = 700
    // A slow swell, like waves coming in: about one every 11 seconds.
    const swell = add(ctx.createGain())
    swell.gain.value = 0.55
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.09
    const depth = ctx.createGain()
    depth.gain.value = 0.45
    lfo.connect(depth).connect(swell.gain)
    lfo.start()
    extra.push(lfo)
  }
  if (sound === 'brown') Object.assign(add(ctx.createBiquadFilter()), { type: 'lowpass' }).frequency.value = 1200
  chain.connect(out).connect(ctx.destination)
  source.start()
  return { sound, source, out, extra }
}

function stop() {
  if (!playing) return
  const { source, out, extra } = playing
  playing = null
  const t = ctx.currentTime
  out.gain.cancelScheduledValues(t)
  out.gain.setValueAtTime(out.gain.value, t)
  out.gain.linearRampToValueAtTime(0, t + FADE_S)
  setTimeout(() => [source, ...extra].forEach((node) => node.stop()), FADE_S * 1000 + 100)
}

function play(sound, volume) {
  if (playing?.sound !== sound) {
    stop()
    playing = build(sound)
  }
  // Browsers start audio only after a tap; the Start button is one. After a
  // reload mid-session, it waits for the next tap anywhere.
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
    const wake = () => ctx.resume().catch(() => {})
    document.addEventListener('pointerdown', wake, { once: true })
  }
  const t = ctx.currentTime
  const gain = playing.out.gain
  gain.cancelScheduledValues(t)
  gain.setValueAtTime(gain.value, t)
  // Volume feels even on a squared scale; 0.6 is loud enough at the top.
  gain.linearRampToValueAtTime(volume * volume * 0.6, t + FADE_S)
}

// { sound, volume, setSound, setVolume }. Plays while `running`.
export function useStudySound(running) {
  const [choice, setChoice] = useState(readSound)
  const save = (next) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // Storage blocked: the choice lasts for this visit.
    }
    setChoice(next)
  }

  useEffect(() => {
    if (!running || choice.sound === 'off' || choice.volume === 0 || typeof AudioContext === 'undefined') return stop()
    try {
      play(choice.sound, choice.volume)
    } catch {
      // No audio on this device.
    }
  }, [running, choice.sound, choice.volume])
  useEffect(() => stop, [])

  return {
    ...choice,
    setSound: (sound) => save({ ...choice, sound }),
    setVolume: (volume) => save({ ...choice, volume }),
  }
}
