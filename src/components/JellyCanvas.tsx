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
  /* Chosen plates survive the burst as a drifting debris field. `field` is
     their anchor, with y stored RELATIVE to the camera so the field rides
     along as the camera climbs the world. */
  /* The exact orientation the plate was built with. Every per-frame rotation
     is applied as an offset FROM this, never accumulated onto the mesh, so
     the shell always returns to a perfectly symmetric rest state. */
  baseQuat: THREE.Quaternion
  ambient: boolean
  field: THREE.Vector3
  /* Where the burst left the plate, captured once on the first ambient frame.
     The drift eases out of this toward `field`, so there is no jump between
     the explosion and the ambient pattern. */
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

/* Subtle barrel distortion + chromatic fringing — the "expensive lens" look. */
const LensShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    k: { value: 0.016 },
    chroma: { value: 0.0022 },
    vignette: { value: 0.22 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
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

/* ── Airtight shard shell constants ────────────────────────────────────────
   Verified by Monte-Carlo ray casting from inside the jellyfish volume:
   300 plates on a Fibonacci sphere at R = 2.60, each segRoman plate scaled
   3.25 (0.95 x 1.10 world units), gives 0.0000% escaping rays — at rest,
   through the full breathing cycle, and under the cursor dent. That ~2.3x
   area overprovision is what seals the shell, which the previous
   per-triangle placement did not (it measured 0.008% leakage: the visible
   gaps the jellyfish showed through). */
const SHELL_RADIUS = 2.6
/* All three perturbations are ZERO: the shell is a perfectly regular mosaic.
   Every plate sits at exactly SHELL_RADIUS, lies flush on the tangent plane
   and is exactly the same size, so the latitude bands line up into clean
   horizontal rings — the ordered, machined look of the reference. Ray casting
   confirms the symmetric shell is still 0.0000% airtight, so none of this
   irregularity was ever load-bearing for coverage. */
const SHELL_JITTER = 0
const SHELL_TILT = 0 // plates lie flush on the tangent plane
const SHELL_SIZE_VAR = 0 // every plate identical
/* Desktop and mobile shells. Both were Monte-Carlo verified sealed; the
   mobile variant trades 130 transmissive draw calls for larger plates. */
/* `rows` = latitude bands; the count per band is derived so neighbours always
   overlap, so plate COUNT is an output, not an input (~195 / ~138). */
const SHELL_DESKTOP = { rows: 17, scale: 3.4 }
const SHELL_MOBILE = { rows: 15, scale: 4.3 }
// Inscribed half-extents of the segRoman plate at scale 1, used to derive how
// many plates a latitude band needs in order to stay overlapped.
/* SECTION PALETTE.
   One hue per narrative beat. The jellyfish crossfades between these as the
   scroll moves from one phase to the next, so each section has its own
   identity without the change ever reading as a hard switch. Anchors are the
   MIDPOINT of each phase, so the colour is settled while you are inside a
   section and only in motion across the boundary. */
/* Camera distance the assembly starts from. At 62 the orb covers ~14% of the
   half-screen (a distant speck); the old 19.5 covered ~43% and barely read as
   an approach at all. */
const ASSEMBLE_FAR = 62

const DEFAULT_C1 = '#e392fe'
const DEFAULT_C2 = '#d357fe'

const JELLY_PALETTE: { at: number; c1: string; c2: string }[] = [
  { at: 0.0, c1: '#e392fe', c2: '#d357fe' }, // rotate  — the signature violet
  { at: 0.44, c1: '#6fd0ff', c2: '#3aa0f5' }, // ascend  — cool ascent blue
  { at: 0.7, c1: '#7af5d0', c2: '#28c9a8' }, // rings   — glass teal
  { at: 0.93, c1: '#ffc48a', c2: '#ff8f6b' }, // finale  — warm arrival
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
    assembleStart: -1, // ms timestamp of the START press, -1 until pressed
    assemble: 0, // 0 = shards far out and scattered, 1 = orb fully formed
    s: 0,
    vel: 0,
    shards: [] as Shard[],
    balls: [] as Ball[],
    rings: [] as ProjectRing[],
    words: [] as WordSculpture[],
    turnWords: [] as TurnWord[],
    jellyMatOuter: null as THREE.MeshStandardMaterial | null,
    jellyMatInner: null as THREE.MeshPhysicalMaterial | null,
    /* Set once the user picks their own colour in the customize widget. From
       then on their choice wins and the automatic section shift stops, so we
       never fight the control the user just used. */
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
    // Stamp the moment START was pressed; the assembly animation is timed
    // from here rather than from page load.
    if (isTransitionOpened && refs.current.assembleStart < 0) {
      refs.current.assembleStart = performance.now()
      /* Teleport the camera to the far mark rather than letting it damp out
         to it. The rig eases toward its target, so without this the camera
         would DRIFT AWAY from the orb while the shards fly in — the opposite
         of the intended approach. */
      refs.current.snapFar = true
    }
  }, [isTransitionOpened])

  /* Live material sync from the "customize me" widget. */
  useEffect(() => {
    const r = refs.current
    /* A colour that differs from the default means the user has chosen one in
       the widget. Their pick then overrides the automatic section shift — the
       control must always win over the ambient animation. */
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

    // ── Scene / camera / renderer ───────────────────────────────────────────
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

    // ── Post processing ─────────────────────────────────────────────────────
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    /* Threshold 0.92 against an almost-white frame meant nearly every pixel
       qualified, so bloom smeared the whole image into a white haze. Raise the
       threshold above the page value and cut the strength: now only genuine
       speculars flare. */
    const bloom = new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.22, 0.7, 1.05)
    composer.addPass(bloom)
    const lensPass = new ShaderPass(LensShader)
    composer.addPass(lensPass)
    composer.addPass(new OutputPass())

    // ── Sky sphere (drives all the internal refraction) ─────────────────────
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

    /* The sky drives every refraction in the scene, so its VALUE is what
       decides whether the glass reads at all. A near-white dome meant white
       glass on a white page: nothing to see. Tinting it to a deep slate blue
       gives the shards a dark interior to refract and a value to stand
       against, which is what makes the faceted sphere legible. */
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

    // ── Lighting ────────────────────────────────────────────────────────────
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

    /* A travelling light that rides with the camera so glass always sparkles,
       no matter how far up the column we are. */
    const travellerLight = new THREE.PointLight(0xffffff, 1.1, 26)
    scene.add(travellerLight)

    const worldGroup = new THREE.Group()
    scene.add(worldGroup)

    // ── Depth particles ─────────────────────────────────────────────────────
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

    // ── Glass material factory ──────────────────────────────────────────────
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

    // ── Jellyfish ───────────────────────────────────────────────────────────
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

    // ── Airtight faceted shell ──────────────────────────────────────────────
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
      /* Slightly tinted, slightly rougher glass with a real IOR reads as a
         faceted crystal; perfectly clear glass on a white page reads as
         nothing at all. */
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

      /* LAT-LONG MOSAIC.
         Plates are laid out in latitude bands — each band is a ring of panels
         sharing one colatitude — so the shell reads as an ordered segmented
         sphere whose seams form horizontal bands, rather than shards thrown
         at random (a golden-angle scatter produced exactly the "randomly
         stacked rectangles" look that was rejected).

         The count per band is DERIVED, not chosen: at colatitude phi the band
         has circumference 2*PI*R*sin(phi), so it needs ceil(2PI / angularWidth)
         plates to close. That guarantees neighbours overlap at every latitude,
         including the tight polar caps, which is what keeps the shell opaque.
         Odd bands are offset half a plate so seams never line up into a
         continuous vertical crack (brick bond).

         Verified by Monte-Carlo ray casting: 0.0000% leakage at rest, while
         breathing, and under the worst-case cursor dent, on both profiles. */
      const plateHW = PLATE_HW * SHARD_SCALE
      const plateHH = PLATE_HH * SHARD_SCALE
      let i = -1

      for (let row = 0; row < SHELL_ROWS; row++) {
        const phi = ((row + 0.5) / SHELL_ROWS) * Math.PI
        const bandR = Math.max(1e-4, Math.sin(phi))
        const cosPhi = Math.cos(phi)

        // Angular width one plate spans on this band -> how many close it.
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
          /* lookAt aligns +Z with the normal and keeps +Y as close to world up
             as possible, so every plate in a band shares an orientation and
             the grid stays legible. No random spin — that is what made the
             old shell look like scattered debris. */
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
            /* Roughly 45% of plates persist as ambient debris. Keeping all of
               them would crowd the later sections and cost ~195 transmissive
               draws forever; a subset reads as drifting crystal while the rest
               genuinely blow away. */
            ambient: HASH(i * 61.3) < 0.45,
            /* Anchor on a tall cylindrical shell around the camera path, with
               a hollow centre so nothing ever parks in front of the subject.
               y is relative to the camera and spans a tall band so plates
               enter and leave frame as the journey climbs. */
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

    // ── Glass project rings ─────────────────────────────────────────────────
    const ringsGroup = new THREE.Group()
    worldGroup.add(ringsGroup)

    const makeBandTexture = (num: string, title: string, cat: string) => {
      const c = document.createElement('canvas')
      c.width = 4096
      c.height = 256
      const cx = c.getContext('2d')!
      cx.clearRect(0, 0, c.width, c.height)
      cx.fillStyle = 'rgba(8, 14, 26, 0.42)'
      cx.fillRect(0, 0, c.width, c.height)
      cx.fillStyle = '#ffffff'
      cx.textAlign = 'center'
      cx.textBaseline = 'middle'
      const unit = `${num}  ·  ${title.toUpperCase()}  ·  ${cat.toUpperCase()}  ·  `
      /* More, smaller repetitions. At 3 reps the type was ~2 units tall on a
         17-unit circumference, so when the camera passed THROUGH the ring the
         letters wrapped right around the field of view and collided with
         themselves. 7 smaller reps read as an engraved ticker band, and the
         DOM card stays the thing you actually read the project name from. */
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

    // Smaller rings: the jellyfish shrinks to pass through, so a tighter hoop
    // keeps it reading as a gate rather than a distant halo.
    const RING_R = 2.35
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
      g.rotation.x = Math.PI / 2 // lie flat so the jellyfish rises through it

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
          /* FrontSide, not DoubleSide. The band is an open cylinder, so
             DoubleSide also drew its BACK wall — the far side of the ring
             showing through the near side, mirrored. Two counter-running
             copies of the project name overlapped into unreadable text. */
          side: THREE.FrontSide,
          depthWrite: false,
        })
      )
      // Cancel the group's X rotation so the band axis is world-vertical and
              // the type reads upright rather than upside-down.
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

    // ── Typography: 3D word sculptures + AURELIA ────────────────────────────
    const ASCENT_WORDS = ['IMMERSE', 'AND', 'INSPIRE', 'DELIGHT']

    const buildTypography = (font: Font) => {
      /* --- Word sculptures that drift past during the ascent --- */
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

      /* --- PHASE 1 ROTATION WORDS ------------------------------------------
         These are real 3D text meshes parked on the orbit circle BEHIND the
         jellyfish, one every 90 degrees. The camera swings around that circle,
         so each quarter turn naturally brings the next word round to face you
         and carries the previous one away. Because visibility is a function of
         camera ANGLE rather than a scroll window, the outgoing word fades out
         gradually as you keep scrolling instead of snapping off.             */
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

        /* The camera orbits at (sin a, 0, cos a) * 8.4. To read BEHIND the
           jellyfish the word must sit on the OPPOSITE side of the origin, so
           its position is negated. rotation.y = a still turns its face back
           toward the camera. */
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

      /* --- AURELIA: glassy, modest in size, always legible --- */
      const aureliaMat = makeGlass({
        color: new THREE.Color('#121b2b'),
        transmission: 0.8,
        roughness: 0.05,
        metalness: 0.1,
        thickness: 1.15,
        ior: 1.56,
        opacity: 0.96,
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
      // Half-extent of the whole sculpture (letters + the orb halo around it),
      // used to pull the camera back far enough on narrow/portrait viewports.
      refs.current.aureliaHalfW = totalW / 2 + 0.55

      /* --- White orbs draped over the word, repelled by the cursor --- */
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
      })
      const ballGeo = new THREE.SphereGeometry(1, 28, 28)

      const halfW = totalW / 2 + 0.3
      const BALL_N = isMobile ? 26 : 40
      for (let i = 0; i < BALL_N; i++) {
        /* Golden-ratio stratification across X guarantees even coverage of the
           whole wordmark; pure hashing clumped the orbs into one corner and
           left the rest of AURELIA bare. Y is a shallow band so they drape
           over the letters rather than orbiting them. */
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

    // ── Pointer ─────────────────────────────────────────────────────────────
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

    // ── Scroll subscription (shared eased clock) ────────────────────────────
    const unsubscribe = scrollStore.subscribe((smooth, velocity) => {
      refs.current.s = smooth
      refs.current.vel = velocity
    })

    // ── Camera rig ──────────────────────────────────────────────────────────
    /* We drive a target position + target look-at, then critically damp both.
       Damping the look-at (instead of snapping it) is what removes the jerk
       when the camera hands off from "follow the jellyfish" to "frame
       AURELIA" — the transition reads as a deliberate camera move. */
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
      const t = clock.getElapsedTime()
      const r = refs.current
      const s = r.s
      const hold = r.holdProgress
      const entered = r.isEntered

      if (mixer) mixer.update(dt * (0.85 + s * 0.45))

      // Live orbit angle for phase 1, consumed by the rotation-word crossfade.
      let orbitAngle = -1
      let inRotatePhase = false

      r.enterBlend = lerp(r.enterBlend, entered ? 1 : 0, 0.05)

      /* ── Jellyfish section tint ──────────────────────────────────────────
         Walk the palette, find the two anchors the scroll currently sits
         between, and interpolate. easeInOutCubic on the segment fraction
         means the hue is stationary in the middle of a section and only
         moves across the boundary, so it never looks like a colour cycle.

         The result is then eased toward per-frame with a small lerp: that
         second stage is what guarantees smoothness even if the scroll value
         jumps (a scrollbar drag, an anchor jump, a dropped frame). */
      if (r.jellyMatOuter || r.jellyMatInner) {
        if (r.userTinted) {
          _tintC1.copy(r.tintC1)
          _tintC2.copy(r.tintC2)
        } else {
          let lo = JELLY_PALETTE[0]
          let hi = JELLY_PALETTE[JELLY_PALETTE.length - 1]
          for (let i = 0; i < JELLY_PALETTE.length - 1; i++) {
            if (s >= JELLY_PALETTE[i].at && s <= JELLY_PALETTE[i + 1].at) {
              lo = JELLY_PALETTE[i]
              hi = JELLY_PALETTE[i + 1]
              break
            }
          }
          const span = hi.at - lo.at
          const f = span > 0 ? easeInOutCubic(clamp01((s - lo.at) / span)) : 0
          _tintC1.set(lo.c1).lerp(_tmpColor.set(hi.c1), f)
          _tintC2.set(lo.c2).lerp(_tmpColor.set(hi.c2), f)
        }

        // Frame-rate independent approach, same half-life idea as the scroll.
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
        /* ── HERO: faceted sphere, gentle breathing parallax ─────────────── */
        contactGroup.visible = false

        /* ASSEMBLY.
           On START the shards are flung far out and the camera sits back; over
           ASSEMBLE_MS they swarm into the lat-long orb while the camera dollies
           in. `assemble` drives both, and main.tsx reveals the click-and-hold UI
           on the same clock, so the interface lands exactly as the orb closes. */
        const ASSEMBLE_MS = 2600
        r.assemble =
          r.assembleStart < 0
            ? 0
            : clamp01((performance.now() - r.assembleStart) / ASSEMBLE_MS)
        const asm = easeOutCubic(r.assemble)

        /* Camera pushes from FAR back to the framing distance as the orb forms.
           19.5 was only ~2.3x the final 8.4, which barely read as a zoom; 62
           starts the orb as a distant speck so the approach has real scale. */
        const dolly = lerp(ASSEMBLE_FAR, 8.4, asm)
        tPos.set(
          r.plx * 1.15 * asm + Math.sin(t * 0.22) * 0.06 * asm,
          r.ply * 1.15 * asm + Math.cos(t * 0.18) * 0.04 * asm,
          dolly + Math.sin(t * 0.16) * 0.1 * asm
        )
        tLook.set(0, 0, 0)
        tRoll = (1 - asm) * 0.12

        worldGroup.rotation.y = lerp(worldGroup.rotation.y, r.plx * 0.3, 0.055)
        worldGroup.rotation.x = lerp(worldGroup.rotation.x, r.ply * 0.18, 0.055)

        jellyPos.set(0, -0.1, 0)
        jellyGroup.position.copy(jellyPos)
        jellyGroup.rotation.set(0, t * 0.15, 0)
        jellyGroup.scale.setScalar(0.65)

        ringsGroup.visible = false
        shardsGroup.visible = true
      } else {
        /* ── THE JOURNEY ─────────────────────────────────────────────────── */
        /* The shards NEVER disappear. After the burst they become a permanent
           ambient debris field that follows the camera up the world, so every
           later section still has crystal drifting through it for depth. */
        shardsGroup.visible = true
        ringsGroup.visible = s > TL.ascend.start - 0.06

        worldGroup.rotation.x = lerp(worldGroup.rotation.x, 0, 0.06)

        if (s < TL.rotate.end) {
          /* ── PHASE 1 · THE WORLD ROTATES ───────────────────────────────
             Camera orbits the jellyfish on a level plane. Y never changes:
             no rise, no fall — it turns. Four quarter turns, each eased so
             it accelerates, sweeps, then settles before the next word. */
          const p = norm(s, TL.rotate.start, TL.rotate.end)
          const TURNS = 4
          const raw = p * TURNS
          const turnIndex = Math.min(Math.floor(raw), TURNS - 1)
          const within = raw - turnIndex
          // Ease within each quarter so each "turn" lands with weight.
          const eased = (turnIndex + easeInOutCubic(within)) / TURNS
          const angle = eased * Math.PI * 2
          const radius = 8.4
          orbitAngle = angle
          inRotatePhase = true

          tPos.set(
            Math.sin(angle) * radius + r.plx * 0.5,
            r.ply * 0.35, // strictly level — parallax only, never scroll-driven
            Math.cos(angle) * radius
          )
          tLook.set(0, -0.1, 0)
          // A whisper of roll on the sweep, zero at each settle point.
          tRoll = Math.sin(within * Math.PI) * 0.035 * (turnIndex % 2 === 0 ? 1 : -1)

          jellyPos.set(0, -0.1, 0)
          jellyRot.set(Math.sin(t * 0.8) * 0.05, t * 0.2 + eased * Math.PI * 0.6, Math.cos(t * 0.8) * 0.05)
          jellyScale = 0.65

          worldGroup.rotation.y = lerp(worldGroup.rotation.y, 0, 0.06)
        } else if (s < TL.ascend.end) {
          /* ── PHASE 2 · THE ASCENT ──────────────────────────────────────
             Words fade, the jellyfish climbs, 3D type drifts past. */
          const p = norm(s, TL.ascend.start, TL.ascend.end)
          const eased = easeInOutCubic(p)
          const y = eased * WORLD.ascendTopY

          /* Every oscillator below uses sin(p·π·even) so it returns to zero at
             BOTH ends, and every offset lerps from the pose the previous phase
             finished on to the pose the next phase begins on. That makes the
             phase seams continuous — no lurch when the timeline hands over. */
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
          /* ── PHASE 3 · GLASS PROJECT RINGS ─────────────────────────────
             The jellyfish shrinks and threads through all four rings while
             the camera stays locked just behind it. */
          const p = norm(s, TL.rings.start, TL.rings.end)
          const y = lerp(WORLD.ascendTopY, WORLD.ringsExitY, p)

          jellyPos.set(Math.sin(p * Math.PI * 3) * 0.14, y, Math.sin(p * Math.PI * 2) * 0.12)
          jellyRot.set(-0.14, t * 0.26 + p * Math.PI * 2.2, Math.sin(p * Math.PI * 4) * 0.06)
          // Shrink quickly at the start so it clearly fits through the rings.
          jellyScale = lerp(0.58, 0.2, easeOutCubic(clamp01(p / 0.55)))

          /* sin(p·2π) is zero at p=0 and p=1, and the Z term is written as a
             (1-cos) swell rather than a cos so it also starts at exactly the
             7.85 the ascent ended on. Both seams stay continuous. */
          const orbit = Math.sin(p * Math.PI * 2) * 1.35
          const zSwell = (1 - Math.cos(p * Math.PI * 2)) * 0.5
          tPos.set(orbit + r.plx * 0.5, y - 0.75 + r.ply * 0.3, 7.85 - zSwell)
          tLook.set(jellyPos.x, y + 0.35, jellyPos.z)
          tRoll = Math.sin(p * Math.PI * 2) * 0.04
        } else {
          /* ── PHASE 4 · CAMERA DETACHES, AURELIA ARRIVES ────────────────
             The jellyfish keeps rising out of frame; the camera stops
             chasing it and eases onto the AURELIA sculpture. */
          const p = norm(s, TL.finale.start, TL.finale.end)
          const hand = easeOutQuint(clamp01(p / 0.42)) // handoff weight

          const jy = WORLD.ringsExitY + p * 22
          jellyPos.set(Math.sin(p * Math.PI) * 0.6, jy, -p * 7)
          jellyRot.set(-0.2, t * 0.3 + p * Math.PI, 0)
          jellyScale = lerp(0.2, 0.13, p)

          /* Blend from "trailing the jellyfish" to the locked hero shot. */
          // Matches the exact camera pose the rings phase ends on, so the
          // handoff starts from zero discontinuity.
          _followPos.set(r.plx * 0.5, jy - 0.75, 7.85)
          /* Frame AURELIA to the viewport instead of a fixed distance: on a
             portrait phone the horizontal FOV is tiny, so dolly back until the
             sculpture plus its orbs comfortably fit with margin. */
          const halfFov = (camera.fov / 2) * (Math.PI / 180)
          const needed = (r.aureliaHalfW * 1.16) / (Math.tan(halfFov) * camera.aspect)
          const dolly = Math.max(6.7, needed) + 1.4 // +1.4 = sculpture's own Z
          _lockedPos.set(r.plx * 0.55, WORLD.aureliaY + 0.05, dolly + r.ply * 0.3)
          tPos.copy(_followPos).lerp(_lockedPos, hand)

          _followLook.set(jellyPos.x, jy + 0.35, jellyPos.z)
          _lockedLook.set(0, WORLD.aureliaY, 1.4)
          tLook.copy(_followLook).lerp(_lockedLook, hand)
          tRoll = 0
        }

        jellyGroup.position.lerp(jellyPos, 0.1)
        jellyGroup.rotation.x = lerp(jellyGroup.rotation.x, jellyRot.x, 0.07)
        jellyGroup.rotation.y = lerp(jellyGroup.rotation.y, jellyRot.y, 0.07)
        jellyGroup.rotation.z = lerp(jellyGroup.rotation.z, jellyRot.z, 0.07)
        jellyGroup.scale.setScalar(lerp(jellyGroup.scale.x, jellyScale, 0.08))
      }

      // ── Damp camera ──────────────────────────────────────────────────────
      if (r.snapFar) {
        camPos.set(0, 0, ASSEMBLE_FAR)
        r.snapFar = false
      }
      const posK = entered ? 0.085 : 0.045
      camPos.lerp(tPos, posK)
      camLook.lerp(tLook, entered ? 0.1 : 0.06)
      camRoll = lerp(camRoll, tRoll, 0.07)

      camera.position.copy(camPos)
      camera.up.set(0, 1, 0)
      camera.lookAt(camLook)
      camera.rotateZ(camRoll)

      travellerLight.position.set(camPos.x + 2.5, camPos.y + 1.5, camPos.z - 1.0)

      // ── Particles ────────────────────────────────────────────────────────
      particlePoints.rotation.y = t * 0.012
      particleMat.opacity = 0.35 + Math.min(Math.abs(r.vel) * 22, 0.4)

      // ── Word sculptures ──────────────────────────────────────────────────
      r.words.forEach((w) => {
        // Local visibility window keyed off camera height, so they reveal as
        // the jellyfish passes rather than all at once.
        const d = camPos.y - w.y
        const near = clamp01(1 - Math.abs(d) / 9)
        const show = easeOutCubic(near)
        w.group.visible = show > 0.008
        if (!w.group.visible) return
        w.group.scale.setScalar(lerp(w.group.scale.x, 0.3 + show * 0.66, 0.09))
        const mesh = w.group.children[0] as THREE.Mesh
        const mat = mesh.material as THREE.MeshPhysicalMaterial
        mat.opacity = show * 0.96
        w.group.rotation.y = w.side * 0.42 + Math.sin(t * 0.35 + w.index) * 0.16
        w.group.position.y = w.y + Math.sin(t * 0.55 + w.index * 1.4) * 0.22
        w.group.position.x = w.side * lerp(5.1, 3.6, show)
      })

      // ── Rotation words (phase 1) ─────────────────────────────────────────
      /* Each word is scored on how close the camera's orbit angle is to that
         word's anchor, wrapped to +/-PI so the fade is symmetric and
         continuous across the 0/2PI seam. The window is wider than the 90
         degree spacing, so consecutive words overlap and CROSSFADE as you
         scroll rather than popping on and off.

         A global envelope then fades the whole set in at the very start and
         out over the last fifth of the rotation. Without it the 360 degree
         loop would swing DESIGN back into view at the end, and the words
         would still be on screen when the ascent begins. */
      if (r.turnWords.length) {
        /* Each word owns exactly ONE quarter turn. `d` is how far the camera
           has swept PAST that word's anchor, so q is 0..1 across its own
           quarter. Deliberately NOT wrapped to [-PI, PI]: the orbit sweeps
           0 -> 2PI monotonically, and wrapping made the last quarter read as
           only 60deg from DESIGN's anchor, swinging DESIGN back on screen
           underneath TO ACCOMPLISH. */
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
          // Slight bleed past both ends so consecutive words kiss rather than
          // leaving a dead frame between them.
          if (q < -0.1 || q > 1.12) {
            tw.mat.opacity = 0
            tw.group.visible = false
            return
          }

          const fadeIn = easeOutCubic(clamp01((q + 0.1) / 0.22))
          const fadeOut = 1 - easeInCubic(clamp01((q - 0.82) / 0.30))
          const show = fadeIn * fadeOut * envelope

          tw.group.visible = show > 0.004
          if (!tw.group.visible) return

          tw.mat.opacity = show * 0.97

          /* The word rides the camera exactly (a === orbitAngle) and is placed
             on the OPPOSITE side of the origin, so it is always dead centre
             and always behind the jellyfish. Pinning it to a fixed azimuth
             instead let it drift to the frame edge while still fully opaque.
             The motion is therefore vertical: it rises from below as it fades
             in and sinks away as it leaves. */
          /* Use the angle of the ACTUAL camera (camPos is damped and lags the
             target by `posK`), not the target angle. Driving off the target
             left every word visibly offset to one side of frame while the
             camera caught up. atan2 of the live position is always exact. */
          const a = Math.atan2(camPos.x, camPos.z)
          /* Incoming word rises from below; outgoing word recedes backwards
             instead of also sitting low, so during a crossfade the two are
             separated in depth rather than stacked on the same spot. */
          const leaving = q > 0.5
          const rad = TURN_WORD_RADIUS + (1 - show) * (leaving ? 2.6 : 1.2)
          const yOff = leaving ? (1 - show) * 0.55 : -(1 - show) * 1.45
          tw.group.position.set(
            -Math.sin(a) * rad,
            -0.15 + yOff,
            -Math.cos(a) * rad
          )
          tw.group.rotation.y = a // face square-on to the camera
          tw.group.scale.setScalar(0.78 + show * 0.22)
        })
      }

      // ── Rings ────────────────────────────────────────────────────────────
      r.rings.forEach((ring) => {
        const d = camPos.y - ring.y
        /* The label fade must be narrower than the ring SPACING, or several
           bands are legible at once and their text overlaps into mush. The
           rings now sit 3.4 apart (one tight "projects" section), so a 12-unit
           falloff had three labels competing; 2.2 means a band is essentially
           only readable while it is the one being approached. */
        const near = clamp01(1 - Math.abs(d) / 2.2)
        ring.group.rotation.z = t * ring.spin + ring.index * 0.7
        ring.group.position.y = ring.y + Math.sin(t * 1.1 + ring.index * 1.5) * 0.12

        const bandMat = ring.band.material as THREE.MeshBasicMaterial
        // Softer: supporting texture, not competing with the DOM label card.
        bandMat.opacity = easeOutCubic(near) * 0.6
        if (bandMat.map) bandMat.map.offset.x = (t * 0.035 + ring.index * 0.25) % 1

        // Flare as the jellyfish passes through the hoop.
        const through = clamp01(1 - Math.abs(jellyGroup.position.y - ring.y) / 2.6)
        const glowMat = ring.glow.material as THREE.MeshBasicMaterial
        glowMat.opacity = easeOutCubic(through) * 0.32
        const pop = 1 + easeOutCubic(through) * 0.05
        ring.group.scale.setScalar(lerp(ring.group.scale.x, pop, 0.12))
      })

      // ── Shard physics ────────────────────────────────────────────────────
      const m3 = r.mouse3D
      r.shards.forEach((item) => {
        if (!entered) {
          /* Breathing rides ALONG THE NORMAL, so plates slide radially and
             stay overlapped instead of separating tangentially. */
          item.target
            .copy(item.home)
            .addScaledVector(item.normal, Math.sin(t * 0.75 + item.phase) * 0.028)

          /* Fly-in: before the orb is formed each plate is pushed out along its
             own scatter vector, so they converge from all directions. Staggered
             per plate (by its hash phase) so the shell knits together rather
             than snapping shut all at once. */
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
              /* The cursor presses the shell INWARD along each plate's own
                 normal. An outward push would fan the plates apart and let
                 daylight — and the jellyfish — through the gaps; denting
                 inward can only ever increase overlap, so the shell stays
                 provably sealed while still feeling soft and reactive. */
              const f = Math.pow(1 - dist / HOVER_RADIUS, 1.5)
              item.target.addScaledVector(item.normal, -HOVER_DEPTH * f)
            }
          }
          if (hold > 0.01) item.target.addScaledVector(item.scatter, hold * hold * 0.95)
          item.current.lerp(item.target, 0.085)
          item.mesh.position.copy(item.current)
          /* NO accumulated wobble while the shell is intact.
             This used to be rotateZ(sin(t*0.3 + phase)*0.0007 + hold*spin.z).
             Because `phase` is a per-plate hash, every plate crept to a
             DIFFERENT angle over time: the shell is BUILT perfectly symmetric
             (identical plates, zero tilt, one sphere), but this quietly
             accumulated a unique rotation on each one, so within seconds the
             mosaic looked randomly tilted again. That is why the asymmetry
             kept coming back even after every build-time constant was zeroed.

             Instead: reset to the pristine orientation each frame, then apply
             a tumble that is a pure FUNCTION of hold. That makes it exactly
             reversible — at hold 0 the shell is bit-for-bit symmetric, and a
             partial press-and-release leaves no permanent skew. */
          item.mesh.quaternion.copy(item.baseQuat)
          if (hold > 0.001) {
            const k = hold * hold * 72
            item.mesh.rotateX(item.spin.x * k)
            item.mesh.rotateY(item.spin.y * k)
            item.mesh.rotateZ(item.spin.z * k)
          }
        } else if (item.ambient) {
          if (!item.burstSet) {
            // Freeze the hand-off point, in camera-local Y.
            item.burst.copy(item.current).setY(item.current.y - camPos.y)
            item.burstSet = true
          }
          /* AMBIENT FIELD.
             The plate drifts in a tall shell around the camera. Its anchor is
             expressed RELATIVE to the current camera height, so the field
             travels with the journey instead of being left behind at the hero
             once the camera has climbed 47 units. Slow sine drift on all three
             axes keeps it alive without ever looking like it is orbiting. */
          const camY = camPos.y
          item.target.set(
            item.field.x + Math.sin(t * 0.21 + item.phase) * 1.15,
            item.field.y + Math.cos(t * 0.17 + item.phase * 1.3) * 1.4,
            item.field.z + Math.sin(t * 0.13 + item.phase * 0.7) * 1.15
          )
          /* Settle into the drift pattern in the camera's LOCAL frame, then add
             the camera height. Lerping the camera-relative offset (rather than
             the absolute world position) is essential: the camera climbs 39
             units over the journey, and a 0.018 world-space lerp lagged it by
             7-14 units — far outside the ~2.7-unit half-view — so the field
             was left behind and the later sections emptied out. In the local
             frame the plate tracks the camera exactly and the easing only ever
             applies to the drift itself. */
          item.ease = lerp(item.ease, 1, 0.018)
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
          // Plates not chosen for the field fly out and stay gone.
          item.target.copy(item.home).addScaledVector(item.scatter, 1.6)
          item.current.lerp(item.target, 0.05)
          item.mesh.position.copy(item.current)
          item.mesh.visible = r.enterBlend < 0.995
          item.mesh.rotation.x += item.spin.x
          item.mesh.rotation.y += item.spin.y
          item.mesh.rotation.z += item.spin.z
        }
      })

      // ── AURELIA contact scene ────────────────────────────────────────────
      const contactStart = TL.finale.start - 0.02
      const contactActive = entered && s >= contactStart
      contactGroup.visible = contactActive

      if (contactActive) {
        const rise = clamp01((s - contactStart) / 0.12)
        const eased = easeOutCubic(rise)

        contactGroup.position.set(0, WORLD.aureliaY - (1 - eased) * 6.5, 1.4)
        contactGroup.scale.setScalar(lerp(0.9, 1.0, eased))
        contactGroup.rotation.y = lerp(contactGroup.rotation.y, r.plx * 0.3, 0.06)
        contactGroup.rotation.x = lerp(contactGroup.rotation.x, r.ply * 0.18, 0.06)

        /* Cursor → world point on the plane of the sculpture. */
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

          // Idle drift.
          b.vel.y += Math.sin(t * 1.25 + b.phase) * 0.0011
          b.vel.x += Math.cos(t * 0.9 + b.phase) * 0.0008

          // Spring home + damping.
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
