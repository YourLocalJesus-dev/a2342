import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { FontLoader, Font } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import {
  scrollStore, TL, WORLD, PROJECTS, TURN_ANCHORS,
  clamp01, norm, easeInCubic, easeInOutCubic, easeOutCubic, easeOutQuint, lerp,
} from '../scroll'

export interface JellyConfig {
  color1: string
  color2: string
  opacity: number
  reflectivity: number
  pattern: number
}

interface Props {
  config: JellyConfig
  holdProgress: number
  isEntered: boolean
  isTransitionOpened: boolean
  onHoverModel?: (h: boolean) => void
}

interface Shard {
  mesh: THREE.Mesh
  home: THREE.Vector3
  normal: THREE.Vector3
  current: THREE.Vector3
  target: THREE.Vector3
  scatter: THREE.Vector3
  spin: THREE.Vector3
  phase: number

  baseQuat: THREE.Quaternion
  ambient: boolean
  field: THREE.Vector3

  burst: THREE.Vector3
  burstSet: boolean
  ease: number
}

interface Ball {
  mesh: THREE.Mesh
  home: THREE.Vector3
  vel: THREE.Vector3
  radius: number
  phase: number
  baseScale: number
}

interface ProjectRing {
  group: THREE.Group
  torus: THREE.Mesh
  band: THREE.Mesh
  glow: THREE.Mesh
  y: number
  spin: number
  index: number
}

interface TurnWord {
  group: THREE.Group
  mat: THREE.MeshPhysicalMaterial
  angle: number
  index: number
}

interface WordSculpture {
  group: THREE.Group
  y: number
  side: number
  index: number
}

const LensShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    k: { value: 0.016 },
    chroma: { value: 0.0022 },
    vignette: { value: 0.22 },
  },
  vertexShader:  `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader:  `
    uniform sampler2D tDiffuse;
    uniform float k, chroma, vignette;
    varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 uv = clamp(vUv + c * r2 * k, 0.0005, 0.9995);
      vec2 dir = c * r2 * chroma;
      float rr = texture2D(tDiffuse, clamp(uv + dir, 0.0005, 0.9995)).r;
      float gg = texture2D(tDiffuse, uv).g;
      float bb = texture2D(tDiffuse, clamp(uv - dir, 0.0005, 0.9995)).b;
      float a  = texture2D(tDiffuse, uv).a;
      float vig = 1.0 - smoothstep(0.25, 0.95, length(c) * 1.25) * vignette;
      gl_FragColor = vec4(vec3(rr, gg, bb) * vig, a);
    }
  `,
}

const FRACT = (x: number) => x - Math.floor(x)
const HASH = (i: number) => FRACT(Math.sin(i * 12.9898) * 43758.5453)

const SHELL_RADIUS = 2.6

const SHELL_JITTER = 0
const SHELL_TILT = 0
const SHELL_SIZE_VAR = 0

const SHELL_DESKTOP = { rows: 17, scale: 3.4 }
const SHELL_MOBILE = { rows: 15, scale: 4.3 }

const ASSEMBLE_FAR = 62

const DEFAULT_C1 = '#e392fe'
const DEFAULT_C2 = '#d357fe'

const JELLY_PALETTE: { hold: [number, number]; c1: string; c2: string }[] = [
  { hold: [0.0, 0.24], c1: '#e392fe', c2: '#d357fe' },
  { hold: [0.36, 0.52], c1: '#6fd0ff', c2: '#3aa0f5' },
  { hold: [0.64, 0.76], c1: '#7af5d0', c2: '#28c9a8' },
  { hold: [0.88, 1.0], c1: '#ffc48a', c2: '#ff8f6b' },
]

const PLATE_HW = 0.14605
const PLATE_HH = 0.16974
const TURN_WORD_RADIUS = 5.2
const HOVER_RADIUS = 1.9
const HOVER_DEPTH = 0.55

export function JellyCanvas({ config, holdProgress, isEntered, isTransitionOpened, onHoverModel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const configRef = useRef(config)

  const refs = useRef({
    holdProgress,
    isEntered,
    isTransitionOpened,
    assembleStart: -1,
    assemble: 0,
    s: 0,
    vel: 0,
    shards: [] as Shard[],
    balls: [] as Ball[],
    aureliaMat: null as THREE.MeshPhysicalMaterial | null,
    ballMat: null as THREE.MeshPhysicalMaterial | null,
    aureliaFade: 0,
    rings: [] as ProjectRing[],
    words: [] as WordSculpture[],
    turnWords: [] as TurnWord[],
    jellyMatOuter: null as THREE.MeshStandardMaterial | null,
    jellyMatInner: null as THREE.MeshPhysicalMaterial | null,

    snapFar: false,
    userTinted: false,
    tintC1: new THREE.Color('#e392fe'),
    tintC2: new THREE.Color('#d357fe'),
    mx: -999,
    my: -999,
    mouse3D: new THREE.Vector3(999, 0, 0),
    plx: 0,
    ply: 0,
    isHovering: false,
    enterBlend: 0,
    aureliaHalfW: 2.1,
  })

  useEffect(() => { configRef.current = config }, [config])
  useEffect(() => { refs.current.holdProgress = holdProgress }, [holdProgress])
  useEffect(() => { refs.current.isEntered = isEntered }, [isEntered])
  useEffect(() => {
    refs.current.isTransitionOpened = isTransitionOpened

    if (isTransitionOpened && refs.current.assembleStart < 0) {
      refs.current.assembleStart = performance.now()

      refs.current.snapFar = true
    }
  }, [isTransitionOpened])

  useEffect(() => {
    const r = refs.current

    if (config.color1 !== DEFAULT_C1 || config.color2 !== DEFAULT_C2) {
      r.userTinted = true
      r.tintC1.set(config.color1)
      r.tintC2.set(config.color2)
    } else {
      r.userTinted = false
    }

    if (r.jellyMatOuter) {
      r.jellyMatOuter.opacity = config.opacity
      r.jellyMatOuter.needsUpdate = true
    }
    if (r.jellyMatInner) {
      r.jellyMatInner.reflectivity = config.reflectivity
      r.jellyMatInner.needsUpdate = true
    }
  }, [config])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const W = () => window.innerWidth
    const H = () => window.innerHeight
    const isMobile = window.innerWidth < 900

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, W() / H(), 0.1, 500)
    camera.position.set(0, 0, 8.4)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      stencil: false,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2))
    renderer.setSize(W(), H())
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))

    const bloom = new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.22, 0.7, 1.05)
    composer.addPass(bloom)
    const lensPass = new ShaderPass(LensShader)
    composer.addPass(lensPass)
    composer.addPass(new OutputPass())

    const texLoader = new THREE.TextureLoader()
    const sphereTex = texLoader.load('/hdri/sphere5.png')
    sphereTex.mapping = THREE.EquirectangularReflectionMapping
    sphereTex.colorSpace = THREE.SRGBColorSpace

    const patternTex = texLoader.load('/textures/paternWhiteBlackBack.jpg')
    patternTex.wrapS = patternTex.wrapT = THREE.RepeatWrapping
    patternTex.repeat.set(100, 100)

    const whiteTex = texLoader.load('/textures/whiteTexture.jpg')
    whiteTex.wrapS = whiteTex.wrapT = THREE.RepeatWrapping
    whiteTex.repeat.set(100, 100)

    const skyMesh = new THREE.Mesh(
      new THREE.SphereGeometry(110, 64, 64),
      new THREE.MeshStandardMaterial({
        map: sphereTex,
        color: new THREE.Color('#93a8c4'),
        side: THREE.BackSide,
        lightMap: patternTex,
        lightMapIntensity: 0.42,
        envMap: whiteTex,
        envMapIntensity: 0.5,
      })
    )
    scene.add(skyMesh)

    new RGBELoader().load('/hdri/photo_studio_01_1k.hdr', (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping
      scene.environment = hdr
      scene.environmentIntensity = 1.0
    })

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.9)
    keyLight.position.set(6, 10, 6)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0xccdcff, 1.1)
    fillLight.position.set(-7, -4, 5)
    scene.add(fillLight)

    const rimLight = new THREE.DirectionalLight(0xffeedd, 1.6)
    rimLight.position.set(1, 4, -8)
    scene.add(rimLight)

    const accentPt = new THREE.PointLight(0xd4b8ff, 2.2, 40)
    scene.add(accentPt)
    scene.add(new THREE.AmbientLight(0xffffff, 0.55))

    const travellerLight = new THREE.PointLight(0xffffff, 1.1, 26)
    scene.add(travellerLight)

    const worldGroup = new THREE.Group()
    scene.add(worldGroup)

    const particleCount = isMobile ? 420 : 900
    const pPos = new Float32Array(particleCount * 3)
    for (let i = 0; i < particleCount; i++) {
      pPos[i * 3 + 0] = (Math.random() - 0.5) * 40
      pPos[i * 3 + 1] = Math.random() * 78 - 10
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 26
    }
    const particleGeo = new THREE.BufferGeometry()
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
    const particleMat = new THREE.PointsMaterial({
      color: 0x9cc6ff,
      size: 0.075,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    })
    const particlePoints = new THREE.Points(particleGeo, particleMat)
    scene.add(particlePoints)

    const jellyGroup = new THREE.Group()
    worldGroup.add(jellyGroup)

    const shardsGroup = new THREE.Group()
    worldGroup.add(shardsGroup)

    const contactGroup = new THREE.Group()
    contactGroup.visible = false
    scene.add(contactGroup)

    const makeGlass = (opts: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.02,
        roughness: 0.02,
        transmission: 0.95,
        ior: 1.52,
        thickness: 1.3,
        transparent: true,
        opacity: 0.97,
        depthWrite: false,
        clearcoat: 1.0,
        clearcoatRoughness: 0.0,
        iridescence: 0.85,
        iridescenceIOR: 1.34,
        iridescenceThicknessRange: [120, 500],
        reflectivity: 0.24,
        envMapIntensity: 4.2,
        side: THREE.DoubleSide,
        ...opts,
      })

    const gltfLoader = new GLTFLoader()

    let mixer: THREE.AnimationMixer | null = null
    gltfLoader.load('/models/Scene14.glb', (gltf) => {
      const root = gltf.scene
      let jelly: THREE.Object3D | null = null
      root.traverse((c) => {
        if (!jelly && (c.name.includes('jellyfish') || c.name === 'Jellyfish_Empty')) jelly = c
      })
      if (!jelly) jelly = root.children[4] || root
      const jellyObj = jelly as THREE.Object3D

      jellyObj.traverse((c) => {
        const m = c as THREE.Mesh
        if (!m.isMesh) return
        const mat = m.material as THREE.MeshStandardMaterial
        if (mat.emissiveMap && !m.name.includes('skin_in')) {
          mat.color.set(configRef.current.color1)
          mat.emissive.set(configRef.current.color2)
          mat.emissiveIntensity = 0.85
          mat.roughness = 0.1
          mat.transparent = true
          mat.opacity = configRef.current.opacity
          mat.side = THREE.DoubleSide
          refs.current.jellyMatOuter = mat
        } else {
          const inner = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(configRef.current.color2),
            transmission: 0.95,
            roughness: 0.04,
            ior: 1.85,
            thickness: 1.7,
            transparent: true,
            opacity: 0.9,
            clearcoat: 1.0,
            clearcoatRoughness: 0.0,
            reflectivity: configRef.current.reflectivity,
            side: THREE.DoubleSide,
          })
          m.material = inner
          refs.current.jellyMatInner = inner
        }
      })

      jellyObj.scale.setScalar(0.65)
      jellyObj.position.set(0, -0.1, 0)
      jellyGroup.add(jellyObj)

      if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(jellyObj)
        const clip =
          gltf.animations.find((a) => a.name.includes('move_1')) ||
          gltf.animations[2] ||
          gltf.animations[0]
        if (clip) {
          const act = mixer.clipAction(clip)
          act.setLoop(THREE.LoopRepeat, Infinity)
          act.play()
        }
      }
    })

    const shards: Shard[] = []
    gltfLoader.load('/models/segRoman.glb', (seg) => {
      let segGeom: THREE.BufferGeometry | null = null
      seg.scene.traverse((c) => {
        const m = c as THREE.Mesh
        if (!segGeom && m.isMesh) segGeom = m.geometry.clone()
      })
      const baseGeo: THREE.BufferGeometry =
        segGeom ?? new THREE.BoxGeometry(0.304, 0.35, 0.046)

      const GOLDEN = Math.PI * (3 - Math.sqrt(5))

      const sharedMat = makeGlass({
        color: new THREE.Color('#dce8f7'),
        thickness: 0.85,
        ior: 1.62,
        roughness: 0.055,
        transmission: 0.88,
        iridescence: 0.75,
        envMapIntensity: 2.4,
        attenuationColor: new THREE.Color('#7f9dc4'),
        attenuationDistance: 3.2,
      })
      const { rows: SHELL_ROWS, scale: SHARD_SCALE } = isMobile ? SHELL_MOBILE : SHELL_DESKTOP

      const plateHW = PLATE_HW * SHARD_SCALE
      const plateHH = PLATE_HH * SHARD_SCALE
      let i = -1

      for (let row = 0; row < SHELL_ROWS; row++) {
        const phi = ((row + 0.5) / SHELL_ROWS) * Math.PI
        const bandR = Math.max(1e-4, Math.sin(phi))
        const cosPhi = Math.cos(phi)

        const angW = 2 * Math.atan(plateHW / (SHELL_RADIUS * bandR))
        const perBand = Math.max(3, Math.ceil((Math.PI * 2) / angW))

        for (let k = 0; k < perBand; k++) {
          i++
          const theta = ((k + (row % 2 ? 0.5 : 0)) / perBand) * Math.PI * 2
          const normal = new THREE.Vector3(
            Math.cos(theta) * bandR,
            cosPhi,
            Math.sin(theta) * bandR
          )

          const radius = SHELL_RADIUS * (1 + (HASH(i * 3.3) * 2 - 1) * SHELL_JITTER)
          const home = normal.clone().multiplyScalar(radius)

          const mesh = new THREE.Mesh(baseGeo, sharedMat)
          mesh.scale.set(
            SHARD_SCALE * (1 + (HASH(i * 13.1) * 2 - 1) * SHELL_SIZE_VAR),
            SHARD_SCALE * (1 + (HASH(i * 23.3) * 2 - 1) * SHELL_SIZE_VAR),
            SHARD_SCALE
          )

          mesh.position.copy(home)

          mesh.lookAt(home.clone().add(normal))
          mesh.rotateX((HASH(i * 5.9) * 2 - 1) * SHELL_TILT)
          mesh.rotateY((HASH(i * 8.3) * 2 - 1) * SHELL_TILT)
          mesh.frustumCulled = false
          shardsGroup.add(mesh)

          const scatterDir = normal
            .clone()
            .add(
              new THREE.Vector3(
                (HASH(i * 7.1) - 0.5) * 0.65,
                (HASH(i * 11.3) - 0.5) * 0.65,
                (HASH(i * 17.7) - 0.5) * 0.65
              )
            )
            .normalize()

          shards.push({
            mesh,
            home,
            normal,
            current: home.clone(),
            target: home.clone(),
            scatter: scatterDir.multiplyScalar(5.0 + HASH(i * 23.9) * 6.5),
            spin: new THREE.Vector3(
              (HASH(i * 31.1) - 0.5) * 0.02,
              (HASH(i * 37.3) - 0.5) * 0.02,
              (HASH(i * 41.7) - 0.5) * 0.02
            ),
            phase: HASH(i * 53.7) * Math.PI * 2,

            ambient: HASH(i * 61.3) < 0.45,

            baseQuat: mesh.quaternion.clone(),
            burst: new THREE.Vector3(),
            burstSet: false,
            ease: 0,
            field: (() => {
              const ang = HASH(i * 67.1) * Math.PI * 2
              const rad = 7.5 + HASH(i * 71.9) * 9.5
              return new THREE.Vector3(
                Math.cos(ang) * rad,
                (HASH(i * 73.7) * 2 - 1) * 15,
                Math.sin(ang) * rad - 2.5
              )
            })(),
          })
        }
      }
      refs.current.shards = shards
    })

    const ringsGroup = new THREE.Group()
    worldGroup.add(ringsGroup)

    const makeBandTexture = (num: string, title: string, cat: string) => {
      const c = document.createElement('canvas')
      c.width = 4096
      c.height = 256
      const cx = c.getContext('2d')!
      cx.clearRect(0, 0, c.width, c.height)
      cx.fillStyle = 'rgba(244, 248, 255, 0.92)'
      cx.fillRect(0, 0, c.width, c.height)
      cx.fillStyle = '#05080f'
      cx.textAlign = 'center'
      cx.textBaseline = 'middle'
      const unit = `${num}  ·  ${title.toUpperCase()}  ·  ${cat.toUpperCase()}  ·  `

      const reps = 7
      cx.font = 'bold 52px "IBM Plex Mono", monospace'
      const w = c.width / reps
      for (let i = 0; i < reps; i++) cx.fillText(unit, w * (i + 0.5), 128)
      const tex = new THREE.CanvasTexture(c)
      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
      return tex
    }

    const RING_R = 3.1
    const torusGeo = new THREE.TorusGeometry(RING_R, 0.3, 28, 128)
    const bandGeo = new THREE.CylinderGeometry(RING_R + 0.42, RING_R + 0.42, 0.8, 128, 1, true)
    const glowGeo = new THREE.TorusGeometry(RING_R, 0.44, 20, 96)

    const ringGlass = makeGlass({
      transmission: 0.93,
      thickness: 1.5,
      ior: 1.5,
      roughness: 0.04,
      iridescence: 0.95,
      envMapIntensity: 4.6,
      depthWrite: false,
    })

    const rings: ProjectRing[] = []
    PROJECTS.forEach((proj, idx) => {
      const g = new THREE.Group()
      g.position.set(0, WORLD.ringY[idx], 0)
      g.rotation.x = Math.PI / 2

      const torus = new THREE.Mesh(torusGeo, ringGlass)
      g.add(torus)

      const glow = new THREE.Mesh(
        glowGeo,
        new THREE.MeshBasicMaterial({
          color: 0xbfe0ff,
          transparent: true,
          opacity: 0.0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
      g.add(glow)

      const band = new THREE.Mesh(
        bandGeo,
        new THREE.MeshBasicMaterial({
          map: makeBandTexture(proj.id, proj.title, proj.category),
          transparent: true,
          opacity: 0,

          side: THREE.FrontSide,
          depthWrite: false,
        })
      )

      band.rotation.x = -Math.PI / 2
      g.add(band)

      ringsGroup.add(g)
      rings.push({
        group: g,
        torus,
        band,
        glow,
        y: WORLD.ringY[idx],
        spin: (idx % 2 === 0 ? 1 : -1) * (0.32 + idx * 0.05),
        index: idx,
      })
    })
    refs.current.rings = rings

    const ASCENT_WORDS = ['IMMERSE', 'AND', 'INSPIRE', 'DELIGHT']

    const buildTypography = (font: Font) => {

      const wordMat = makeGlass({
        color: new THREE.Color('#0d1524'),
        transmission: 0.74,
        roughness: 0.06,
        metalness: 0.08,
        thickness: 1.0,
        opacity: 0.94,
        iridescence: 0.7,
        envMapIntensity: 3.6,
        depthWrite: true,
      })

      const turnMat = () =>
        new THREE.MeshPhysicalMaterial({
          color: new THREE.Color('#05080f'),
          roughness: 0.28,
          metalness: 0.0,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          envMapIntensity: 1.1,
        })

      const TURN_RADIUS = TURN_WORD_RADIUS
      const turnWords: TurnWord[] = []
      TL.turns.forEach((turn, i) => {
        const geo = new TextGeometry(turn.word, {
          font,
          size: 1.12,
          depth: 0.26,
          curveSegments: 6,
          bevelEnabled: true,
          bevelThickness: 0.03,
          bevelSize: 0.02,
          bevelSegments: 3,
        })
        geo.computeBoundingBox()
        geo.center()

        const mat = turnMat()
        const mesh = new THREE.Mesh(geo, mat)
        const g = new THREE.Group()
        g.add(mesh)

        const a = TURN_ANCHORS[i]
        g.position.set(-Math.sin(a) * TURN_RADIUS, -0.15, -Math.cos(a) * TURN_RADIUS)
        g.rotation.y = a
        g.visible = false
        worldGroup.add(g)

        turnWords.push({ group: g, mat, angle: a, index: i })
      })
      refs.current.turnWords = turnWords

      const words: WordSculpture[] = []
      ASCENT_WORDS.forEach((word, i) => {
        const geo = new TextGeometry(word, {
          font,
          size: 1.32,
          depth: 0.3,
          curveSegments: 6,
          bevelEnabled: true,
          bevelThickness: 0.035,
          bevelSize: 0.022,
          bevelSegments: 3,
        })
        geo.computeBoundingBox()
        geo.center()

        const mesh = new THREE.Mesh(geo, wordMat)
        const g = new THREE.Group()
        g.add(mesh)

        const side = i % 2 === 0 ? -1 : 1
        const y = lerp(3.2, WORLD.ascendTopY - 1.4, i / (ASCENT_WORDS.length - 1))
        g.position.set(side * 4.0, y, -1.6 - i * 0.35)
        g.rotation.y = side * 0.42
        g.scale.setScalar(0.001)
        g.visible = false
        worldGroup.add(g)

        words.push({ group: g, y, side, index: i })
      })
      refs.current.words = words

      const aureliaMat = makeGlass({
        color: new THREE.Color('#121b2b'),
        transmission: 0.8,
        roughness: 0.05,
        metalness: 0.1,
        thickness: 1.15,
        ior: 1.56,
        opacity: 0,
        iridescence: 0.55,
        reflectivity: 0.95,
        envMapIntensity: 4.4,
        depthWrite: true,
      })

      const letters = 'AURELIA'.split('')
      const built = letters.map((ch) => {
        const geo = new TextGeometry(ch, {
          font,
          size: 0.88,
          depth: 0.24,
          curveSegments: 8,
          bevelEnabled: true,
          bevelThickness: 0.018,
          bevelSize: 0.013,
          bevelSegments: 4,
        })
        geo.computeBoundingBox()
        const bb = geo.boundingBox!
        return { geo, w: bb.max.x - bb.min.x, h: bb.max.y - bb.min.y }
      })

      const spacing = 0.19
      const totalW = built.reduce((sum, b) => sum + b.w + spacing, -spacing)
      const maxH = Math.max(...built.map((b) => b.h))
      let cx = -totalW / 2

      const lettersGroup = new THREE.Group()
      built.forEach(({ geo, w }) => {
        const mesh = new THREE.Mesh(geo, aureliaMat)
        mesh.position.set(cx, -maxH / 2, 0)
        lettersGroup.add(mesh)
        cx += w + spacing
      })
      contactGroup.add(lettersGroup)
      refs.current.aureliaMat = aureliaMat

      refs.current.aureliaHalfW = totalW / 2 + 0.55

      const balls: Ball[] = []
      const ballMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.14,
        roughness: 0.12,
        metalness: 0.03,
        transmission: 0.2,
        thickness: 1.2,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        ior: 1.5,
        reflectivity: 0.94,
        envMapIntensity: 3.4,
        transparent: true,
        opacity: 0,
      })
      const ballGeo = new THREE.SphereGeometry(1, 28, 28)
      refs.current.ballMat = ballMat

      const halfW = totalW / 2 + 0.3
      const BALL_N = isMobile ? 26 : 40
      for (let i = 0; i < BALL_N; i++) {

        const u = FRACT(i * 0.6180339887 + 0.37)
        const jitterX = (HASH(i * 1.7) - 0.5) * (halfW / BALL_N) * 2.4
        const x = (u * 2 - 1) * halfW + jitterX
        const y = (HASH(i * 2.9) * 2 - 1) * (maxH * 0.72)
        const z = -0.3 + HASH(i * 4.3) * 1.45
        const radius = 0.13 + HASH(i * 5.1) * 0.15

        const mesh = new THREE.Mesh(ballGeo, ballMat)
        mesh.scale.setScalar(radius)
        mesh.position.set(x, y, z)
        contactGroup.add(mesh)

        balls.push({
          mesh,
          home: new THREE.Vector3(x, y, z),
          vel: new THREE.Vector3(),
          radius,
          phase: HASH(i * 6.7) * Math.PI * 2,
          baseScale: radius,
        })
      }
      refs.current.balls = balls
    }

    new FontLoader().load('/fonts/Druk_Regular.json', buildTypography)

    const raycaster = new THREE.Raycaster()
    const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const tmpHit = new THREE.Vector3()
    const _ndc = new THREE.Vector2()

    const onMouseMove = (e: MouseEvent) => {
      const r = refs.current
      r.mx = (e.clientX / W()) * 2 - 1
      r.my = -(e.clientY / H()) * 2 + 1
      r.plx = (e.clientX / W() - 0.5) * 0.38
      r.ply = -(e.clientY / H() - 0.5) * 0.3

      if (!r.isEntered) {
        raycaster.setFromCamera(_ndc.set(r.mx, r.my), camera)
        if (raycaster.ray.intersectPlane(planeZ, tmpHit)) {
          r.mouse3D.copy(tmpHit)
          const near = Math.hypot(tmpHit.x, tmpHit.y) < 3.4 && r.isTransitionOpened
          if (near !== r.isHovering) {
            r.isHovering = near
            onHoverModel?.(near)
          }
        }
      }
    }

    const onMouseLeave = () => {
      if (refs.current.isHovering) {
        refs.current.isHovering = false
        onHoverModel?.(false)
      }
    }

    window.addEventListener('mousemove', onMouseMove, { passive: true })
    window.addEventListener('mouseleave', onMouseLeave)

    const onResize = () => {
      camera.aspect = W() / H()
      camera.updateProjectionMatrix()
      renderer.setSize(W(), H())
      composer.setSize(W(), H())
      bloom.setSize(W(), H())
    }
    window.addEventListener('resize', onResize)

    const unsubscribe = scrollStore.subscribe((smooth, velocity) => {
      refs.current.s = smooth
      refs.current.vel = velocity
    })

    const camPos = new THREE.Vector3(0, 0, 8.4)
    const camLook = new THREE.Vector3(0, 0, 0)
    const tPos = new THREE.Vector3(0, 0, 8.4)
    const tLook = new THREE.Vector3(0, 0, 0)
    let camRoll = 0
    let tRoll = 0

    const _followPos = new THREE.Vector3()
    const _lockedPos = new THREE.Vector3()
    const _followLook = new THREE.Vector3()
    const _lockedLook = new THREE.Vector3()
    const _shardWorld = new THREE.Vector3()
    const _wordDir = new THREE.Vector3()
    const _tintC1 = new THREE.Color()
    const _tintC2 = new THREE.Color()
    const _tmpColor = new THREE.Color()
    const _planeNrm = new THREE.Vector3()
    const _worldHit = new THREE.Vector3()
    const _mouseNDC = new THREE.Vector2()
    const _contactPlane = new THREE.Plane()

    const jellyPos = new THREE.Vector3(0, -0.1, 0)
    const jellyRot = new THREE.Vector3(0, 0, 0)
    let jellyScale = 0.65

    const clock = new THREE.Clock()
    let raf = 0

    const animate = () => {
      raf = requestAnimationFrame(animate)
      const dt = Math.min(clock.getDelta(), 0.05)

      const DAMP = (k60: number) => 1 - Math.pow(1 - k60, dt * 60)
      const t = clock.getElapsedTime()
      const r = refs.current
      const s = r.s
      const hold = r.holdProgress
      const entered = r.isEntered

      if (mixer) mixer.update(dt * (0.85 + s * 0.45))

      let orbitAngle = -1
      let inRotatePhase = false

      r.enterBlend = lerp(r.enterBlend, entered ? 1 : 0, DAMP(0.05))

      if (r.jellyMatOuter || r.jellyMatInner) {
        if (r.userTinted) {
          _tintC1.copy(r.tintC1)
          _tintC2.copy(r.tintC2)
        } else {

          let lo = JELLY_PALETTE[0]
          let hi = JELLY_PALETTE[0]
          let f = 0
          for (let i = 0; i < JELLY_PALETTE.length; i++) {
            const e = JELLY_PALETTE[i]
            if (s <= e.hold[1]) {
              if (s >= e.hold[0] || i === 0) {
                lo = hi = e
                f = 0
              } else {
                const prev = JELLY_PALETTE[i - 1]
                lo = prev
                hi = e
                f = easeInOutCubic(clamp01((s - prev.hold[1]) / (e.hold[0] - prev.hold[1])))
              }
              break
            }
            lo = hi = e
            f = 0
          }
          _tintC1.set(lo.c1).lerp(_tmpColor.set(hi.c1), f)
          _tintC2.set(lo.c2).lerp(_tmpColor.set(hi.c2), f)
        }

        const ck = 1 - Math.pow(2, -dt / 0.22)
        if (r.jellyMatOuter) {
          r.jellyMatOuter.color.lerp(_tintC1, ck)
          r.jellyMatOuter.emissive.lerp(_tintC2, ck)
        }
        if (r.jellyMatInner) {
          r.jellyMatInner.color.lerp(_tintC2, ck)
        }
      }

      accentPt.position.set(
        Math.sin(t * 0.45) * 8,
        Math.cos(t * 0.35) * 5 + jellyPos.y,
        Math.sin(t * 0.6) * 4 + 3
      )

      if (!entered) {

        contactGroup.visible = false

        const ASSEMBLE_MS = 3600
        r.assemble =
          r.assembleStart < 0
            ? 0
            : clamp01((performance.now() - r.assembleStart) / ASSEMBLE_MS)
        const asm = easeOutCubic(r.assemble)

        const dollyT = easeInOutCubic(r.assemble)

        const dolly = lerp(ASSEMBLE_FAR, 8.4, dollyT)
        tPos.set(
          r.plx * 1.15 * asm + Math.sin(t * 0.22) * 0.06 * asm,
          r.ply * 1.15 * asm + Math.cos(t * 0.18) * 0.04 * asm,
          dolly + Math.sin(t * 0.16) * 0.1 * asm
        )
        tLook.set(0, 0, 0)
        tRoll = (1 - asm) * 0.12

        worldGroup.rotation.y = lerp(worldGroup.rotation.y, r.plx * 0.3, DAMP(0.055))
        worldGroup.rotation.x = lerp(worldGroup.rotation.x, r.ply * 0.18, DAMP(0.055))

        jellyPos.set(0, -0.1, 0)
        jellyGroup.position.copy(jellyPos)
        jellyGroup.rotation.set(0, t * 0.15, 0)
        jellyGroup.scale.setScalar(0.65)

        ringsGroup.visible = false
        shardsGroup.visible = true
      } else {

        shardsGroup.visible = true
        ringsGroup.visible = s > TL.ascend.start - 0.06

        worldGroup.rotation.x = lerp(worldGroup.rotation.x, 0, DAMP(0.06))

        if (s < TL.rotate.end) {

          const p = norm(s, TL.rotate.start, TL.rotate.end)
          const TURNS = 4
          const raw = p * TURNS
          const turnIndex = Math.min(Math.floor(raw), TURNS - 1)
          const within = raw - turnIndex

          const eased = (turnIndex + easeInOutCubic(within)) / TURNS
          const angle = eased * Math.PI * 2
          const radius = 8.4
          orbitAngle = angle
          inRotatePhase = true

          tPos.set(
            Math.sin(angle) * radius + r.plx * 0.5,
            r.ply * 0.35,
            Math.cos(angle) * radius
          )
          tLook.set(0, -0.1, 0)

          tRoll = Math.sin(within * Math.PI) * 0.035 * (turnIndex % 2 === 0 ? 1 : -1)

          jellyPos.set(0, -0.1, 0)
          jellyRot.set(Math.sin(t * 0.8) * 0.05, t * 0.2 + eased * Math.PI * 0.6, Math.cos(t * 0.8) * 0.05)
          jellyScale = 0.65

          worldGroup.rotation.y = lerp(worldGroup.rotation.y, 0, DAMP(0.06))
        } else if (s < TL.ascend.end) {

          const p = norm(s, TL.ascend.start, TL.ascend.end)
          const eased = easeInOutCubic(p)
          const y = eased * WORLD.ascendTopY

          jellyPos.set(Math.sin(p * Math.PI * 2) * 0.45, y, Math.sin(p * Math.PI) * 0.4)
          jellyRot.set(-0.1, t * 0.22 + p * Math.PI * 1.1, Math.cos(p * Math.PI * 2) * 0.05)
          jellyScale = lerp(0.65, 0.58, p)

          tPos.set(
            Math.sin(p * Math.PI) * 1.4 + r.plx * 0.55,
            y + lerp(0, -0.75, eased) + r.ply * 0.35,
            lerp(8.4, 7.85, eased) + Math.sin(p * Math.PI) * 0.45
          )
          tLook.set(jellyPos.x, y + lerp(-0.1, 0.35, eased), jellyPos.z)
          tRoll = Math.sin(p * Math.PI * 2) * 0.03
        } else if (s < TL.rings.end) {

          const p = norm(s, TL.rings.start, TL.rings.end)
          const y = lerp(WORLD.ascendTopY, WORLD.ringsExitY, p)

          jellyPos.set(Math.sin(p * Math.PI * 3) * 0.14, y, Math.sin(p * Math.PI * 2) * 0.12)
          jellyRot.set(-0.14, t * 0.26 + p * Math.PI * 2.2, Math.sin(p * Math.PI * 4) * 0.06)
          jellyScale = 0.58

          const orbit = Math.sin(p * Math.PI * 2) * 1.35
          const zSwell = (1 - Math.cos(p * Math.PI * 2)) * 0.5
          tPos.set(orbit + r.plx * 0.5, y - 0.75 + r.ply * 0.3, 7.85 - zSwell)
          tLook.set(jellyPos.x, y + 0.35, jellyPos.z)
          tRoll = Math.sin(p * Math.PI * 2) * 0.04
        } else {

          const p = norm(s, TL.finale.start, TL.finale.end)
          const hand = easeOutQuint(clamp01(p / 0.42))

          const jy = WORLD.ringsExitY + p * 22
          jellyPos.set(Math.sin(p * Math.PI) * 0.6, jy, -p * 7)
          jellyRot.set(-0.2, t * 0.3 + p * Math.PI, 0)
          jellyScale = lerp(0.58, 0.42, p)

          _followPos.set(r.plx * 0.5, jy - 0.75, 7.85)

          const halfFov = (camera.fov / 2) * (Math.PI / 180)
          const needed = (r.aureliaHalfW * 1.16) / (Math.tan(halfFov) * camera.aspect)
          const dolly = Math.max(6.7, needed) + 1.4
          _lockedPos.set(r.plx * 0.55, WORLD.aureliaY + 0.05, dolly + r.ply * 0.3)
          tPos.copy(_followPos).lerp(_lockedPos, hand)

          _followLook.set(jellyPos.x, jy + 0.35, jellyPos.z)
          _lockedLook.set(0, WORLD.aureliaY, 1.4)
          tLook.copy(_followLook).lerp(_lockedLook, hand)
          tRoll = 0
        }

        jellyGroup.position.lerp(jellyPos, DAMP(0.1))
        jellyGroup.rotation.x = lerp(jellyGroup.rotation.x, jellyRot.x, DAMP(0.07))
        jellyGroup.rotation.y = lerp(jellyGroup.rotation.y, jellyRot.y, DAMP(0.07))
        jellyGroup.rotation.z = lerp(jellyGroup.rotation.z, jellyRot.z, DAMP(0.07))
        jellyGroup.scale.setScalar(lerp(jellyGroup.scale.x, jellyScale, DAMP(0.08)))
      }

      if (r.snapFar) {
        camPos.set(0, 0, ASSEMBLE_FAR)
        r.snapFar = false
      }
      const posK = DAMP(entered ? 0.085 : 0.045)
      camPos.lerp(tPos, posK)
      camLook.lerp(tLook, DAMP(entered ? 0.1 : 0.06))
      camRoll = lerp(camRoll, tRoll, DAMP(0.07))

      camera.position.copy(camPos)
      camera.up.set(0, 1, 0)
      camera.lookAt(camLook)
      camera.rotateZ(camRoll)

      travellerLight.position.set(camPos.x + 2.5, camPos.y + 1.5, camPos.z - 1.0)

      particlePoints.rotation.y = t * 0.012
      particleMat.opacity = 0.35 + Math.min(Math.abs(r.vel) * 22, 0.4)

      r.words.forEach((w) => {

        const d = camPos.y - w.y
        const near = clamp01(1 - Math.abs(d) / 9)
        const show = easeOutCubic(near)
        w.group.visible = show > 0.008
        if (!w.group.visible) return
        w.group.scale.setScalar(lerp(w.group.scale.x, 0.3 + show * 0.66, DAMP(0.09)))
        const mesh = w.group.children[0] as THREE.Mesh
        const mat = mesh.material as THREE.MeshPhysicalMaterial
        mat.opacity = show * 0.96
        w.group.rotation.y = w.side * 0.42 + Math.sin(t * 0.35 + w.index) * 0.16
        w.group.position.y = w.y + Math.sin(t * 0.55 + w.index * 1.4) * 0.22
        w.group.position.x = w.side * lerp(5.1, 3.6, show)
      })

      if (r.turnWords.length) {

        const QUARTER = Math.PI / 2
        const rotP = clamp01(s / TL.rotate.end)
        const envelope =
          easeOutCubic(clamp01(rotP / 0.03)) * (1 - easeInOutCubic(clamp01((rotP - 0.78) / 0.22)))

        r.turnWords.forEach((tw) => {
          if (!inRotatePhase) {
            tw.mat.opacity = lerp(tw.mat.opacity, 0, 0.12)
            tw.group.visible = tw.mat.opacity > 0.01
            return
          }

          const q = (orbitAngle - tw.angle) / QUARTER

          if (q < -0.1 || q > 1.12) {
            tw.mat.opacity = 0
            tw.group.visible = false
            return
          }

          const fadeIn = easeOutCubic(clamp01((q + 0.1) / 0.16))
          const fadeOut = 1 - easeInCubic(clamp01((q - 0.7) / 0.22))
          const show = fadeIn * fadeOut * envelope

          tw.group.visible = show > 0.004
          if (!tw.group.visible) return

          tw.mat.opacity = show * 0.97

          _wordDir.copy(camLook).sub(camPos).normalize()
          tw.group.position.copy(camLook).addScaledVector(_wordDir, TURN_WORD_RADIUS)

          tw.group.rotation.y = Math.atan2(-_wordDir.x, -_wordDir.z)
          tw.group.scale.setScalar(1)
        })
      }

      r.rings.forEach((ring) => {
        const d = camPos.y - ring.y

        const near = clamp01(1 - Math.abs(d) / 2.2)
        ring.group.rotation.z = t * ring.spin + ring.index * 0.7
        ring.group.position.y = ring.y + Math.sin(t * 1.1 + ring.index * 1.5) * 0.12

        const bandMat = ring.band.material as THREE.MeshBasicMaterial

        bandMat.opacity = easeOutCubic(near) * 0.6
        if (bandMat.map) bandMat.map.offset.x = (t * 0.035 + ring.index * 0.25) % 1

        const through = clamp01(1 - Math.abs(jellyGroup.position.y - ring.y) / 2.6)
        const glowMat = ring.glow.material as THREE.MeshBasicMaterial
        glowMat.opacity = easeOutCubic(through) * 0.32
        const pop = 1 + easeOutCubic(through) * 0.05
        ring.group.scale.setScalar(lerp(ring.group.scale.x, pop, DAMP(0.12)))
      })

      const m3 = r.mouse3D
      r.shards.forEach((item) => {
        if (!entered) {

          item.target
            .copy(item.home)
            .addScaledVector(item.normal, Math.sin(t * 0.75) * 0.028)

          if (r.assemble < 1) {
            const stagger = clamp01((item.phase / (Math.PI * 2)) * 0.45)
            const local = clamp01((r.assemble - stagger) / (1 - stagger || 1))
            const out = 1 - easeOutCubic(local)
            item.target.addScaledVector(item.scatter, out * 1.25)
          }

          if (r.isHovering && r.isTransitionOpened) {
            _shardWorld.copy(item.home).applyMatrix4(worldGroup.matrixWorld)
            const dist = _shardWorld.distanceTo(m3)
            if (dist < HOVER_RADIUS) {

              const f = Math.pow(1 - dist / HOVER_RADIUS, 1.5)
              item.target.addScaledVector(item.normal, -HOVER_DEPTH * f)
            }
          }
          if (hold > 0.01) item.target.addScaledVector(item.scatter, hold * hold * 0.95)
          item.current.lerp(item.target, DAMP(0.085))
          item.mesh.position.copy(item.current)

          item.mesh.quaternion.copy(item.baseQuat)
          if (hold > 0.001) {
            const k = hold * hold * 72
            item.mesh.rotateX(item.spin.x * k)
            item.mesh.rotateY(item.spin.y * k)
            item.mesh.rotateZ(item.spin.z * k)
          }
        } else if (item.ambient) {
          if (!item.burstSet) {

            item.burst.copy(item.current).setY(item.current.y - camPos.y)
            item.burstSet = true
          }

          const camY = camPos.y
          item.target.set(
            item.field.x + Math.sin(t * 0.21 + item.phase) * 1.15,
            item.field.y + Math.cos(t * 0.17 + item.phase * 1.3) * 1.4,
            item.field.z + Math.sin(t * 0.13 + item.phase * 0.7) * 1.15
          )

          item.ease = lerp(item.ease, 1, DAMP(0.018))
          item.current.lerpVectors(item.burst, item.target, item.ease)
          item.mesh.position.set(
            item.current.x,
            item.current.y + camY * item.ease,
            item.current.z
          )
          item.mesh.rotation.x += item.spin.x * 0.35
          item.mesh.rotation.y += item.spin.y * 0.35
          item.mesh.rotation.z += item.spin.z * 0.35
        } else {

          item.target.copy(item.home).addScaledVector(item.scatter, 1.6)
          item.current.lerp(item.target, DAMP(0.05))
          item.mesh.position.copy(item.current)
          item.mesh.visible = r.enterBlend < 0.995
          item.mesh.rotation.x += item.spin.x
          item.mesh.rotation.y += item.spin.y
          item.mesh.rotation.z += item.spin.z
        }
      })

      const contactStart = TL.finale.start - 0.02
      const contactActive = entered && s >= contactStart
      contactGroup.visible = contactActive
      if (!contactActive && r.aureliaFade !== 0) {
        r.aureliaFade = 0
        if (r.aureliaMat) r.aureliaMat.opacity = 0
        if (r.ballMat) r.ballMat.opacity = 0
      }

      if (contactActive) {
        const rise = clamp01((s - contactStart) / 0.12)
        const eased = easeOutCubic(rise)

        const fadeTarget = easeOutCubic(clamp01((s - contactStart) / 0.085))
        r.aureliaFade = lerp(r.aureliaFade, fadeTarget, DAMP(0.09))
        if (r.aureliaMat) r.aureliaMat.opacity = r.aureliaFade * 0.96
        if (r.ballMat) r.ballMat.opacity = r.aureliaFade

        contactGroup.position.set(0, WORLD.aureliaY - (1 - eased) * 6.5, 1.4)
        contactGroup.scale.setScalar(lerp(0.9, 1.0, eased))
        contactGroup.rotation.y = lerp(contactGroup.rotation.y, r.plx * 0.3, DAMP(0.06))
        contactGroup.rotation.x = lerp(contactGroup.rotation.x, r.ply * 0.18, DAMP(0.06))

        contactGroup.updateMatrixWorld()
        _planeNrm.set(0, 0, 1).applyQuaternion(contactGroup.quaternion)
        _contactPlane.setFromNormalAndCoplanarPoint(_planeNrm, contactGroup.position)
        raycaster.setFromCamera(_mouseNDC.set(r.mx, r.my), camera)
        const hasCursor = raycaster.ray.intersectPlane(_contactPlane, _worldHit) !== null
        const localCursor = hasCursor ? contactGroup.worldToLocal(_worldHit) : null

        r.balls.forEach((b) => {
          const p = b.mesh.position

          if (localCursor) {
            const dx = p.x - localCursor.x
            const dy = p.y - localCursor.y
            const dz = p.z - localCursor.z
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
            const R = 1.75
            if (dist < R && dist > 1e-4) {
              const force = Math.pow(1 - dist / R, 1.5) * 0.2
              b.vel.x += (dx / dist) * force
              b.vel.y += (dy / dist) * force
              b.vel.z += (dz / dist) * force * 0.55
            }
          }

          b.vel.y += Math.sin(t * 1.25 + b.phase) * 0.0011
          b.vel.x += Math.cos(t * 0.9 + b.phase) * 0.0008

          b.vel.x += (b.home.x - p.x) * 0.052
          b.vel.y += (b.home.y - p.y) * 0.052
          b.vel.z += (b.home.z - p.z) * 0.052
          b.vel.multiplyScalar(0.865)

          p.add(b.vel)
          b.mesh.rotation.x += b.vel.y * 0.3
          b.mesh.rotation.y += b.vel.x * 0.3
        })
      }

      composer.render()
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
      unsubscribe()
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseleave', onMouseLeave)
      window.removeEventListener('resize', onResize)
      composer.dispose()
      renderer.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ position: 'fixed', inset: 0, zIndex: 5, pointerEvents: 'none' }}
    />
  )
}
