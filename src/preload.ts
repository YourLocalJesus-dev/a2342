import * as THREE from 'three'

THREE.Cache.enabled = true

type AssetKind = 'buffer' | 'text' | 'image'

interface Asset {
  url: string
  bytes: number
  kind: AssetKind
}

const ASSETS: Asset[] = [
  { url: '/models/Scene14.glb', bytes: 8376656, kind: 'buffer' },
  { url: '/hdri/photo_studio_01_1k.hdr', bytes: 1597273, kind: 'buffer' },
  { url: '/hdri/sphere5.png', bytes: 1032937, kind: 'image' },
  { url: '/fonts/Druk_Regular.json', bytes: 118603, kind: 'text' },
  { url: '/textures/paternWhiteBlackBack.jpg', bytes: 31885, kind: 'image' },
  { url: '/textures/whiteTexture.jpg', bytes: 9386, kind: 'image' },
  { url: '/models/segRoman.glb', bytes: 12212, kind: 'buffer' },
]

const WEBFONTS: string[] = ['500 16px DrukMedium', 'bold 52px "IBM Plex Mono"']

const FONT_BYTES = 237152

const TOTAL_BYTES = ASSETS.reduce((n, a) => n + a.bytes, 0) + FONT_BYTES

export const PRELOAD_TIMEOUT_MS = 25000

const decodeImage = (url: string, blob: Blob) =>
  new Promise<void>((resolve) => {
    const img = new Image()
    const finish = () => resolve()
    img.onload = () => {
      THREE.Cache.add(`image:${url}`, img)
      finish()
    }
    img.onerror = finish
    img.src = URL.createObjectURL(blob)
  })

const store = (asset: Asset, bytes: Uint8Array) => {
  if (asset.kind === 'text') {
    THREE.Cache.add(`file:${asset.url}`, new TextDecoder().decode(bytes))
    return Promise.resolve()
  }
  if (asset.kind === 'image') {
    return decodeImage(asset.url, new Blob([bytes as BlobPart]))
  }
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  THREE.Cache.add(`file:${asset.url}`, copy.buffer)
  return Promise.resolve()
}

const joinChunks = (chunks: Uint8Array[], total: number) => {
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

async function loadAsset(asset: Asset, onBytes: (loaded: number) => void) {
  try {
    const res = await fetch(asset.url, { credentials: 'same-origin' })
    if (!res.ok) throw new Error(`${res.status} ${asset.url}`)

    if (!res.body || typeof res.body.getReader !== 'function') {
      const buf = new Uint8Array(await res.arrayBuffer())
      onBytes(buf.length)
      await store(asset, buf)
      return
    }

    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      chunks.push(value)
      received += value.length
      onBytes(received)
    }

    await store(asset, joinChunks(chunks, received))
    onBytes(received)
  } catch {
    onBytes(asset.bytes)
  }
}

async function loadFonts(onBytes: (loaded: number) => void) {
  const anyDoc = document as Document & { fonts?: FontFaceSet }
  if (!anyDoc.fonts || typeof anyDoc.fonts.load !== 'function') {
    onBytes(FONT_BYTES)
    return
  }
  try {
    await Promise.all(WEBFONTS.map((f) => anyDoc.fonts!.load(f, 'AURELIA BEAT')))
    await anyDoc.fonts.ready
  } catch {
    void 0
  }
  onBytes(FONT_BYTES)
}

export function preloadAll(onProgress: (fraction: number) => void): Promise<void> {
  const loaded = new Map<string, number>()
  let settled = 0

  const report = () => {
    let sum = settled
    for (const v of loaded.values()) sum += v
    onProgress(Math.max(0, Math.min(1, sum / TOTAL_BYTES)))
  }

  const jobs = ASSETS.map((asset) =>
    loadAsset(asset, (n) => {
      loaded.set(asset.url, Math.min(n, asset.bytes))
      report()
    }).then(() => {
      loaded.delete(asset.url)
      settled += asset.bytes
      report()
    })
  )

  jobs.push(
    loadFonts(() => {
      settled += FONT_BYTES
      report()
    })
  )

  return Promise.all(jobs).then(() => {
    onProgress(1)
  })
}
