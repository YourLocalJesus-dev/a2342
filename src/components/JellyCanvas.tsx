import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

export interface JellyConfig {
  color1: string
  color2: string
  opacity: number
  reflectivity: number
  pattern: number
}

interface Props {
  config: JellyConfig
  scrollProgress: number
  holdProgress: number
  isEntered: boolean
  isTransitionOpened: boolean
  onHoverModel?: (h: boolean) => void
}

interface Shard {
  mesh: THREE.Mesh
  attractorPoint: THREE.Vector3
  currentPosition: THREE.Vector3
  targetPosition: THREE.Vector3
  scatterVector: THREE.Vector3
  rotSpeed: THREE.Vector3
  phase: number
}

interface Ball {
  mesh: THREE.Mesh
  home: THREE.Vector3
  vel: THREE.Vector3
  phase: number
}

// Subtle barrel lens correction
const LensShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, k: { value: 0.012 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float k; varying vec2 vUv;
    void main(){
      vec2 uv=vUv-0.5; float r2=dot(uv,uv);
      vec2 d=clamp(vUv+uv*r2*k,0.001,0.999);
      gl_FragColor=texture2D(tDiffuse,d);
    }`,
}

interface ProjectRing {
  group: THREE.Group
  ringMesh: THREE.Mesh
  bannerMesh: THREE.Mesh
  baseY: number
  spinSpeed: number
}

export function JellyCanvas({ config, scrollProgress, holdProgress, isEntered, isTransitionOpened, onHoverModel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const configRef = useRef(config)
  const refs = useRef({
    holdProgress, isEntered, isTransitionOpened, scrollProgress,
    shards: [] as Shard[], balls: [] as Ball[],
    projectRings: [] as ProjectRing[],
    jellyMatOuter: null as THREE.MeshStandardMaterial | null,
    jellyMatInner: null as THREE.MeshPhysicalMaterial | null,
    mx: -999, my: -999, mouse3D: new THREE.Vector3(999, 0, 0),
    plx: 0, ply: 0, camX: 0, camY: 0, camZ: 8.2, ss: 0,
    isHovering: false, contactGroup: null as THREE.Group | null,
  })

  useEffect(() => { configRef.current = config }, [config])
  useEffect(() => { refs.current.holdProgress = holdProgress }, [holdProgress])
  useEffect(() => { refs.current.isEntered = isEntered }, [isEntered])
  useEffect(() => { refs.current.isTransitionOpened = isTransitionOpened }, [isTransitionOpened])
  useEffect(() => { refs.current.scrollProgress = scrollProgress }, [scrollProgress])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const W = () => window.innerWidth, H = () => window.innerHeight

    // ── Scene & Camera ────────────────────────────────────────────────────────
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(36, W() / H(), 0.1, 400)
    camera.position.set(0, 0, 8.2)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(W(), H())
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)

    // ── Post-processing ───────────────────────────────────────────────────────
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const lensPass = new ShaderPass(LensShader)
    composer.addPass(lensPass)
    composer.addPass(new OutputPass())

    // ── Authentic Studio Sky Sphere (Noomo Spec) ──────────────────────────────
    // This gives genuine internal refraction to all glass meshes
    const texLoader = new THREE.TextureLoader()
    const sphereTex = texLoader.load('/hdri/sphere5.png')
    sphereTex.mapping = THREE.EquirectangularReflectionMapping
    sphereTex.colorSpace = THREE.SRGBColorSpace

    const patternTex = texLoader.load('/textures/paternWhiteBlackBack.jpg')
    patternTex.wrapS = THREE.RepeatWrapping
    patternTex.wrapT = THREE.RepeatWrapping
    patternTex.repeat.set(100, 100)

    const whiteTex = texLoader.load('/textures/whiteTexture.jpg')
    whiteTex.wrapS = THREE.RepeatWrapping
    whiteTex.wrapT = THREE.RepeatWrapping
    whiteTex.repeat.set(100, 100)

    const skyGeo = new THREE.SphereGeometry(80, 64, 64)
    const skyMat = new THREE.MeshStandardMaterial({
      map: sphereTex,
      side: THREE.BackSide,
      lightMap: patternTex,
      lightMapIntensity: 0.9,
      envMap: whiteTex,
      envMapIntensity: 1.2,
      transparent: false,
    })
    const skyMesh = new THREE.Mesh(skyGeo, skyMat)
    scene.add(skyMesh)

    // ── Environment Map & Studio Lighting ─────────────────────────────────────
    new RGBELoader().load('/hdri/photo_studio_01_1k.hdr', hdr => {
      hdr.mapping = THREE.EquirectangularReflectionMapping
      scene.environment = hdr
      scene.environmentIntensity = 1.8
    })

    const keyLight = new THREE.DirectionalLight(0xffffff, 4.5)
    keyLight.position.set(6, 10, 6)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0xccdcff, 3.0)
    fillLight.position.set(-7, -4, 5)
    scene.add(fillLight)

    const rimLight = new THREE.DirectionalLight(0xffeedd, 3.5)
    rimLight.position.set(1, 4, -8)
    scene.add(rimLight)

    const accentPt = new THREE.PointLight(0xd4b8ff, 4.0, 30)
    scene.add(accentPt)

    scene.add(new THREE.AmbientLight(0xffffff, 2.2))

    const worldGroup = new THREE.Group()
    scene.add(worldGroup)

    // ── 3D Spatial Particle Field (Parallax & Depth Cues) ──────────────────────
    const particleCount = 450
    const particlePositions = new Float32Array(particleCount * 3)
    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3 + 0] = (Math.random() - 0.5) * 32 + (i % 2 === 0 ? 3 : -2)
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 44 - 6
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 22 + 2
    }
    const particleGeo = new THREE.BufferGeometry()
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
    const particleMat = new THREE.PointsMaterial({
      color: 0x98c5ff,
      size: 0.08,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const particlePoints = new THREE.Points(particleGeo, particleMat)
    worldGroup.add(particlePoints)

    const jellyGroup = new THREE.Group()
    worldGroup.add(jellyGroup)

    const shardsGroup = new THREE.Group()
    worldGroup.add(shardsGroup)

    // Contact "AURELIA" crystal glass text & floating interactive orbs
    const contactGroup = new THREE.Group()
    contactGroup.visible = false
    contactGroup.scale.set(0.001, 0.001, 0.001)
    scene.add(contactGroup)
    refs.current.contactGroup = contactGroup

    // ── Crystal-Clear Glass Material Factory ───────────────────��──────────────
    const makeGlass = (opts: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.02,
        roughness: 0.015,
        transmission: 0.96,
        ior: 1.54,
        thickness: 1.4,
        transparent: true,
        opacity: 0.98,
        depthWrite: false,
        clearcoat: 1.0,
        clearcoatRoughness: 0.0,
        iridescence: 0.9,
        iridescenceIOR: 1.35,
        iridescenceThicknessRange: [120, 500],
        reflectivity: 0.22,
        envMapIntensity: 4.8,
        side: THREE.DoubleSide,
        ...opts,
      })

    // ── Jellyfish 3D Model ────────────────────────────────────────────────────
    let mixer: THREE.AnimationMixer | null = null
    const gltfLoader = new GLTFLoader()
    gltfLoader.load('/models/Scene14.glb', gltf => {
      const root = gltf.scene
      let jelly: THREE.Object3D | null = null
      root.traverse(c => {
        if (!jelly && (c.name.includes('jellyfish') || c.name === 'Jellyfish_Empty')) jelly = c
      })
      if (!jelly) jelly = root.children[4] || root
      jelly.traverse(c => {
        if (!(c as THREE.Mesh).isMesh) return
        const m = c as THREE.Mesh
        const mat = m.material as THREE.MeshStandardMaterial
        if (mat.emissiveMap && !m.name.includes('skin_in')) {
          mat.color.set(configRef.current.color1)
          mat.emissive.set(configRef.current.color2)
          mat.emissiveIntensity = 0.85
          mat.roughness = 0.10
          mat.transparent = true
          mat.opacity = 0.94
          mat.side = THREE.DoubleSide
          refs.current.jellyMatOuter = mat
        } else {
          const inner = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(configRef.current.color2),
            transmission: 0.96,
            roughness: 0.03,
            ior: 1.9,
            thickness: 1.8,
            transparent: true,
            opacity: 0.90,
            clearcoat: 1.0,
            clearcoatRoughness: 0.0,
            side: THREE.DoubleSide,
          })
          m.material = inner
          refs.current.jellyMatInner = inner
        }
      })
      jelly.scale.set(0.65, 0.65, 0.65)
      jelly.position.set(0, -0.1, 0)
      jelly.renderOrder = 0
      jellyGroup.add(jelly)

      if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(jelly)
        const clip = gltf.animations.find(a => a.name.includes('move_1')) || gltf.animations[2] || gltf.animations[0]
        if (clip) {
          const act = mixer.clipAction(clip)
          act.setLoop(THREE.LoopRepeat, Infinity)
          act.play()
        }
      }
    })

    // ── Glass Shards (Faceted Crystal Sphere) ─────────────────────────────────
    // Fixed: Complete coverage with zero gaps so jellyfish is fully enclosed
    const shards: Shard[] = []
    gltfLoader.load('/models/half4.glb', h4 => {
      let half: THREE.Mesh | null = null
      h4.scene.traverse(c => { if (!half && (c as THREE.Mesh).isMesh) half = c as THREE.Mesh })
      gltfLoader.load('/models/segRoman.glb', seg => {
        let segGeom: THREE.BufferGeometry | null = null
        seg.scene.traverse(c => { if (!segGeom && (c as THREE.Mesh).isMesh) segGeom = (c as THREE.Mesh).geometry.clone() })
        if (!half) return

        const geo = half.geometry
        geo.computeVertexNormals()
        const pa = geo.attributes.position.array
        const ia = geo.index?.array ?? null
        const tot = ia ? ia.length : pa.length / 3
        const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), N = new THREE.Vector3()

        const addFacet = (cp: THREE.Vector3, nv: THREE.Vector3) => {
          const ap = cp.clone().multiplyScalar(2.65)
          const g = segGeom ? segGeom.clone() : new THREE.BoxGeometry(0.65, 0.52, 0.06)
          const m = new THREE.Mesh(g, makeGlass({ thickness: 1.2, ior: 1.56, iridescence: 0.95 }))
          m.scale.set(2.45, 2.45, 2.45)
          m.position.copy(ap)
          m.lookAt(ap.clone().add(nv))
          m.frustumCulled = false
          m.renderOrder = 2
          shardsGroup.add(m)

          const sd = nv.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 0.7,
            (Math.random() - 0.5) * 0.7,
            (Math.random() - 0.5) * 0.7
          )).normalize()

          shards.push({
            mesh: m,
            attractorPoint: ap.clone(),
            currentPosition: ap.clone(),
            targetPosition: ap.clone(),
            scatterVector: sd.multiplyScalar(4.5 + Math.random() * 5.5),
            rotSpeed: new THREE.Vector3(
              (Math.random() - 0.5) * 0.006,
              (Math.random() - 0.5) * 0.006,
              (Math.random() - 0.5) * 0.006
            ),
            phase: Math.random() * Math.PI * 2,
          })
        }

        // Generate all facets without skipping to guarantee 100% airtight coverage
        for (let i = 0; i < tot; i += 3) {
          const i0 = ia ? ia[i] * 3 : i * 3
          const i1 = ia ? ia[i + 1] * 3 : (i + 1) * 3
          const i2 = ia ? ia[i + 2] * 3 : (i + 2) * 3
          vA.fromArray(pa, i0)
          vB.fromArray(pa, i1)
          vC.fromArray(pa, i2)
          N.crossVectors(vB.clone().sub(vA), vC.clone().sub(vA)).normalize()
          const c = new THREE.Vector3().addVectors(vA, vB).add(vC).divideScalar(3)
          addFacet(c, N)
          addFacet(new THREE.Vector3(c.x, c.y, -c.z), new THREE.Vector3(N.x, N.y, -N.z))
        }
        refs.current.shards = shards
      })
    })

    // ── 4 Elongated Rotating 3D Glass Project Portals / Tunnels ───────────────
    const ringsGroup = new THREE.Group()
    worldGroup.add(ringsGroup)

    const ringProjects = [
      { id: '01', title: '3D CONFIGURATOR', category: 'BESPOKE GLASS WEBGL', y: 20.0 },
      { id: '02', title: 'INTEL | AI.IO', category: 'INTERACTIVE KIOSK & CV', y: 27.5 },
      { id: '03', title: 'THE SILLY BUNNY', category: 'WEBAR & MIXED REALITY', y: 35.0 },
      { id: '04', title: 'SPATIAL CANVAS', category: 'VISIONOS PROTOTYPE', y: 42.5 },
    ]

    const makeRingTexture = (num: string, title: string, cat: string) => {
      const c = document.createElement('canvas')
      c.width = 2048
      c.height = 256
      const cx = c.getContext('2d')!
      cx.clearRect(0, 0, 2048, 256)
      cx.fillStyle = 'rgba(10, 16, 28, 0.55)'
      cx.fillRect(0, 0, 2048, 256)
      cx.fillStyle = '#ffffff'
      cx.font = 'bold 52px "IBM Plex Mono", monospace'
      cx.textAlign = 'center'
      cx.textBaseline = 'middle'
      const phrase = `✦  ${num} // ${title.toUpperCase()}  [ ${cat.toUpperCase()} ]  ✦  `
      cx.fillText(phrase + phrase, 1024, 128)
      const tex = new THREE.CanvasTexture(c)
      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping
      return tex
    }

    // Elongated physical glass tunnel geometry: 2.6 units deep along flight path
    const barrelGeo = new THREE.CylinderGeometry(3.2, 3.2, 2.6, 64, 1, true)
    const rimGeo = new THREE.TorusGeometry(3.2, 0.14, 24, 64)
    const bannerGeo = new THREE.CylinderGeometry(3.18, 3.18, 1.8, 64, 1, true)
    const ringGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.94,
      roughness: 0.05,
      ior: 1.54,
      thickness: 1.4,
      transparent: true,
      opacity: 0.94,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      iridescence: 0.85,
      reflectivity: 0.9,
      envMapIntensity: 4.5,
      side: THREE.DoubleSide,
    })

    const projectRings: ProjectRing[] = []
    ringProjects.forEach((proj, idx) => {
      const rg = new THREE.Group()
      rg.position.set(0, proj.y, 0)
      // Rotated horizontal so jellyfish flies straight through the cylinder tunnel
      rg.rotation.x = Math.PI / 2

      // Elongated glass cylinder barrel
      const barrelMesh = new THREE.Mesh(barrelGeo, ringGlassMat)
      rg.add(barrelMesh)

      // Top and bottom protective glass rims
      const topRim = new THREE.Mesh(rimGeo, ringGlassMat)
      topRim.position.y = 1.3
      topRim.rotation.x = Math.PI / 2
      rg.add(topRim)

      const bottomRim = new THREE.Mesh(rimGeo, ringGlassMat)
      bottomRim.position.y = -1.3
      bottomRim.rotation.x = Math.PI / 2
      rg.add(bottomRim)

      // Project title rotating text cylinder
      const bannerTex = makeRingTexture(proj.id, proj.title, proj.category)
      const bannerMat = new THREE.MeshBasicMaterial({
        map: bannerTex,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const bMesh = new THREE.Mesh(bannerGeo, bannerMat)
      rg.add(bMesh)

      ringsGroup.add(rg)
      projectRings.push({
        group: rg,
        ringMesh: barrelMesh,
        bannerMesh: bMesh,
        baseY: proj.y,
        spinSpeed: (idx % 2 === 0 ? 1 : -1) * 0.42,
      })
    })
    refs.current.projectRings = projectRings

    // ── 3D Crystal-Clear Glass "AURELIA" + Interactive Floating Orbs ─────────
    const balls: Ball[] = []
    const fontLoader = new FontLoader()
    fontLoader.load('/fonts/Druk_Regular.json', font => {
      // Smoky High-Contrast Crystal Glass Material (Refined & Highly Legible)
      const textMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#141d2c'),
        emissive: new THREE.Color('#0a101d'),
        emissiveIntensity: 0.2,
        transmission: 0.86,
        roughness: 0.08,
        metalness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.02,
        ior: 1.58,
        thickness: 1.2,
        reflectivity: 0.95,
        envMapIntensity: 4.5,
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide,
      })

      const chars = 'AURELIA'.split('')
      const letterGeoms = chars.map(char => {
        const geo = new TextGeometry(char, {
          font,
          size: 0.82, // Scaled a bit smaller for elegant proportions
          depth: 0.22,
          curveSegments: 8,
          bevelEnabled: true,
          bevelThickness: 0.02,
          bevelSize: 0.014,
          bevelSegments: 4,
        })
        geo.computeBoundingBox()
        const bb = geo.boundingBox!
        const w = bb.max.x - bb.min.x
        return { geo, w }
      })

      const spacing = 0.20
      const totalWidth = letterGeoms.reduce((sum, item) => sum + item.w + spacing, -spacing)
      let currentX = -totalWidth / 2

      letterGeoms.forEach(({ geo, w }) => {
        const mesh = new THREE.Mesh(geo, textMat)
        mesh.position.set(currentX, -0.40, 0)
        contactGroup.add(mesh)
        currentX += w + spacing
      })

      // 22 Dynamic crystal-clear spheres surrounding & intersecting "AURELIA"
      const ballPositions: [number, number, number, number][] = [
        // [x, y, z, radius]
        [-3.4, 0.8, 0.4, 0.28],
        [-2.6, 1.3, 0.8, 0.22],
        [-1.8, 1.1, 0.5, 0.32],
        [-0.9, 1.4, 0.9, 0.24],
        [0.0, 1.5, 0.6, 0.36],
        [0.9, 1.3, 0.8, 0.25],
        [1.8, 1.4, 0.5, 0.30],
        [2.7, 1.1, 0.7, 0.23],
        [3.5, 0.7, 0.4, 0.32],
        // Lower cluster
        [-3.1, -0.7, 0.6, 0.26],
        [-2.1, -1.1, 0.9, 0.33],
        [-1.1, -1.3, 0.7, 0.22],
        [0.0, -1.2, 1.1, 0.38],
        [1.1, -1.3, 0.8, 0.25],
        [2.2, -1.0, 0.6, 0.31],
        [3.2, -0.6, 0.9, 0.24],
        // Foreground accent orbs (threading in front of letters)
        [-2.0, 0.1, 1.4, 0.28],
        [-0.6, 0.2, 1.5, 0.22],
        [0.7, -0.1, 1.6, 0.27],
        [2.1, 0.1, 1.3, 0.24],
        [-3.6, -0.1, 0.3, 0.20],
        [3.6, 0.0, 0.3, 0.20],
      ]

      ballPositions.forEach(([x, y, z, r], i) => {
        const ballGeo = new THREE.SphereGeometry(r, 36, 36)
        // Radiant luminous pearl white balls
        const ballMat = new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          emissive: 0xffffff,
          emissiveIntensity: 0.18,
          roughness: 0.10,
          metalness: 0.04,
          transmission: 0.28,
          thickness: 1.4,
          clearcoat: 1.0,
          clearcoatRoughness: 0.04,
          ior: 1.54,
          reflectivity: 0.95,
          envMapIntensity: 3.5,
        })
        const ballMesh = new THREE.Mesh(ballGeo, ballMat)
        const home = new THREE.Vector3(x, y, z)
        ballMesh.position.copy(home)
        contactGroup.add(ballMesh)

        balls.push({
          mesh: ballMesh,
          home,
          vel: new THREE.Vector3(),
          phase: i * 0.45,
        })
      })

      refs.current.balls = balls
    })

    // ── Mouse & Raycasting ────────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster()
    const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)

    const onMouseMove = (e: MouseEvent) => {
      const r = refs.current
      r.mx = (e.clientX / W()) * 2 - 1
      r.my = -(e.clientY / H()) * 2 + 1
      r.plx = (e.clientX / W() - 0.5) * 0.38
      r.ply = -(e.clientY / H() - 0.5) * 0.30

      raycaster.setFromCamera(new THREE.Vector2(r.mx, r.my), camera)
      const hit = new THREE.Vector3()
      if (raycaster.ray.intersectPlane(planeZ, hit)) {
        r.mouse3D.copy(hit)
        const nearSphere = Math.hypot(hit.x, hit.y) < 3.2 && r.isTransitionOpened && !r.isEntered
        if (nearSphere !== r.isHovering) {
          r.isHovering = nearSphere
          onHoverModel?.(nearSphere)
        }
      }
    }

    const onMouseLeave = () => {
      if (refs.current.isHovering) {
        refs.current.isHovering = false
        onHoverModel?.(false)
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseleave', onMouseLeave)

    const onResize = () => {
      camera.aspect = W() / H()
      camera.updateProjectionMatrix()
      renderer.setSize(W(), H())
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      composer.setSize(W(), H())
    }
    window.addEventListener('resize', onResize)

    // ── Animation Loop ────────────────────────────────────────────────────────
    let raf: number
    const clock = new THREE.Clock()
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t

    const animate = () => {
      raf = requestAnimationFrame(animate)
      const dt = clock.getDelta()
      const t = clock.getElapsedTime()
      const r = refs.current
      const scroll = r.scrollProgress
      const hold = r.holdProgress
      const entered = r.isEntered

      if (mixer) mixer.update(dt * (0.85 + scroll * 0.5))

      // Smooth scroll interpolation
      r.ss = lerp(r.ss, scroll, 0.055)
      const s = r.ss

      // Light orbit
      accentPt.position.set(
        Math.sin(t * 0.45) * 7,
        Math.cos(t * 0.35) * 5 - s * 8,
        Math.sin(t * 0.6) * 4 + 3
      )

      if (!entered) {
        // ── HERO FACETED SPHERE ───────────────────────────────────────────────
        contactGroup.visible = false
        r.camX = lerp(r.camX, r.plx * 1.1 + Math.sin(t * 0.22) * 0.055, 0.038)
        r.camY = lerp(r.camY, r.ply * 1.1 + Math.cos(t * 0.18) * 0.035, 0.038)
        r.camZ = 8.2 + Math.sin(t * 0.16) * 0.09
        camera.position.set(r.camX, r.camY, r.camZ)
        camera.rotation.z = 0
        camera.lookAt(0, 0, 0)
        worldGroup.rotation.y = lerp(worldGroup.rotation.y, r.plx * 0.3, 0.055)
        worldGroup.rotation.x = lerp(worldGroup.rotation.x, r.ply * 0.18, 0.055)

        jellyGroup.position.set(0, -0.1, 0)
        jellyGroup.rotation.set(0, t * 0.15, 0)

      } else {
        // ── CRAZY 3D SCROLLING JOURNEY ────────────────────────────────────────
        // Phase 1 (s < 0.28): 3D XYZ turns to the right and right!
        // Phase 2 (s >= 0.28): Diving downwards with alternating left/right positioning

        let targetCamX = 0
        let targetCamY = 0
        let targetCamZ = 8.2
        let targetCamRoll = 0
        let targetJellyX = 0
        let targetJellyY = -0.1
        let targetJellyZ = 0
        let targetJellyRotY = s * Math.PI * 2.2 + t * 0.14
        let targetJellyRotX = 0
        let targetJellyRotZ = 0

        if (s < 0.32) {
          // ── PHASE 1: PURE HORIZONTAL 360° ROTATION (DOES NOT GO UP, DOES NOT GO DOWN) ──
          const rotPhase = s / 0.32
          const orbitAngle = rotPhase * Math.PI * 2.0 // Full 360° orbit
          const orbitRadius = 8.2

          targetCamX = Math.sin(orbitAngle) * orbitRadius + r.plx * 0.45
          targetCamY = 0 // Stays strictly at 0: DOES NOT GO UP, DOES NOT GO DOWN!
          targetCamZ = Math.cos(orbitAngle) * orbitRadius
          targetCamRoll = Math.sin(rotPhase * Math.PI * 4.0) * 0.04

          targetJellyX = 0
          targetJellyY = -0.1
          targetJellyZ = 0
          targetJellyRotY = t * 0.2 + rotPhase * Math.PI * 1.5
          targetJellyRotX = Math.sin(t * 0.8) * 0.05
          targetJellyRotZ = Math.cos(t * 0.8) * 0.05

          jellyGroup.scale.setScalar(0.65)
        } else if (s < 0.52) {
          // ── PHASE 2: ASCENT THROUGH BOXES OF INFO (Cards 1 & 2 before the rings) ──
          const infoT = (s - 0.32) / 0.20 // 0.0 to 1.0
          const jellyY = infoT * 16.0 // Jellyfish climbs from Y = 0 to Y = 16.0

          targetJellyX = Math.sin(infoT * Math.PI * 2.0) * 0.42
          targetJellyY = jellyY
          targetJellyZ = 0
          targetJellyRotY = t * 0.22 + infoT * Math.PI * 1.2
          targetJellyRotX = -0.12 // Pitched slightly upward
          targetJellyRotZ = Math.cos(infoT * Math.PI * 2.0) * 0.05

          jellyGroup.scale.setScalar(0.65)

          // Camera tracks the jellyfish ascending
          targetCamY = jellyY - 0.7 + r.ply * 0.3
          targetCamX = Math.sin(infoT * Math.PI) * 1.2 + r.plx * 0.5
          targetCamZ = 8.2 + Math.sin(infoT * Math.PI) * 0.4
          targetCamRoll = Math.sin(infoT * Math.PI * 2.0) * 0.04
        } else if (s < 0.76) {
          // ── PHASE 3: 4 ELONGATED GLASS PROJECT RINGS (Y = 20.0 to 42.5) ──
          const ringT = (s - 0.52) / 0.24 // 0.0 to 1.0
          const jellyY = 16.0 + ringT * (44.0 - 16.0) // from Y = 16 up to 44 through all 4 cylinders

          targetJellyX = Math.sin(ringT * Math.PI * 3.0) * 0.12 // Centered alignment through cylinders
          targetJellyY = jellyY
          targetJellyZ = 0
          targetJellyRotY = t * 0.25 + ringT * Math.PI * 2.5
          targetJellyRotX = -0.16
          targetJellyRotZ = Math.sin(ringT * Math.PI * 4.0) * 0.07

          // Jellyfish shrinks down to 0.24 as it traverses the rings
          const currentScale = THREE.MathUtils.lerp(0.65, 0.24, Math.min(Math.max((s - 0.52) / 0.16, 0), 1))
          jellyGroup.scale.setScalar(currentScale)

          // Camera follows jellyfish through the rings
          targetCamY = jellyY - 0.7 + r.ply * 0.3
          targetCamX = Math.sin(ringT * Math.PI * 2.0) * 1.5 + r.plx * 0.5
          targetCamZ = 7.6 + Math.sin(ringT * Math.PI * 2.0) * 0.5
          targetCamRoll = Math.sin(ringT * Math.PI * 2.0) * 0.05
        } else if (s < 0.86) {
          // ── PHASE 4: POST-RING ASCENDING FLIGHT (Y = 44.0 to 60.0) ──
          // Dedicated scroll section where jellyfish goes up instead of instantly jumping to contact
          const postRingT = (s - 0.76) / 0.10 // 0.0 to 1.0
          const jellyY = 44.0 + postRingT * 16.0 // climbs to Y = 60.0

          targetJellyX = Math.sin(postRingT * Math.PI) * 0.3
          targetJellyY = jellyY
          targetJellyZ = 0
          targetJellyRotY = t * 0.28 + postRingT * Math.PI
          targetJellyRotX = -0.18
          targetJellyRotZ = Math.cos(postRingT * Math.PI) * 0.05

          jellyGroup.scale.setScalar(0.24)

          targetCamY = jellyY - 0.7 + r.ply * 0.3
          targetCamX = r.plx * 0.4
          targetCamZ = 7.8
          targetCamRoll = 0
        } else {
          // ── PHASE 5: CAMERA DETACHES & FRAMES "AURELIA" (PULLED BACK, NOT ZOOMED IN) ──
          const finaleT = (s - 0.86) / 0.14

          // Jellyfish continues ascending away into the distance:
          targetJellyY = 60.0 + finaleT * 26.0
          targetJellyX = Math.sin(finaleT * Math.PI) * 0.5
          targetJellyZ = -finaleT * 8.0
          jellyGroup.scale.setScalar(0.18)

          // Camera STOPS following jellyfish and settles comfortably at Y = 54.0, Z = 7.8 (wide view)
          targetCamY = 54.0 - 0.1
          targetCamX = r.plx * 0.4
          targetCamZ = 7.8 + r.ply * 0.3
          targetCamRoll = 0
        }

        r.camX = lerp(r.camX, targetCamX, 0.075)
        r.camY = lerp(r.camY, targetCamY, 0.075)
        r.camZ = lerp(r.camZ, targetCamZ, 0.075)
        camera.position.set(r.camX, r.camY, r.camZ)

        jellyGroup.position.set(
          lerp(jellyGroup.position.x, targetJellyX, 0.075),
          lerp(jellyGroup.position.y, targetJellyY, 0.075),
          lerp(jellyGroup.position.z, targetJellyZ, 0.075)
        )
        jellyGroup.rotation.y = lerp(jellyGroup.rotation.y, targetJellyRotY, 0.06)
        jellyGroup.rotation.x = lerp(jellyGroup.rotation.x, targetJellyRotX, 0.06)
        jellyGroup.rotation.z = lerp(jellyGroup.rotation.z, targetJellyRotZ, 0.06)

        particlePoints.rotation.y = t * 0.02
        particlePoints.rotation.x = -s * 0.8

        // Animate the 4 rotating 3D glass project rings
        refs.current.projectRings.forEach((pr, i) => {
          pr.group.rotation.z = t * pr.spinSpeed + i * 0.5
          pr.group.position.y = pr.baseY + Math.sin(t * 1.3 + i * 1.5) * 0.15
        })

        // ── CONTACT SCENE: 3D CRYSTAL "AURELIA" & PEARL WHITE BALLS RISING FROM BELOW ──
        const isContactActive = s >= 0.84
        contactGroup.visible = isContactActive

        if (isContactActive) {
          const riseProgress = Math.min(Math.max((s - 0.84) / 0.12, 0), 1.0)
          // Cubic ease-out gives a majestic weighted arrival from down below
          const easeRise = 1 - Math.pow(1 - riseProgress, 3)

          const settledY = 54.0
          const startOffset = -14.0 // Rises from Y = 40.0 up to 54.0
          const currentY = settledY + (1 - easeRise) * startOffset

          contactGroup.position.set(0, currentY, 1.8)
          contactGroup.scale.setScalar(lerp(0.85, 1.0, easeRise))
          contactGroup.rotation.y = lerp(contactGroup.rotation.y, r.plx * 0.35 + Math.sin(t * 0.3) * 0.03, 0.05)
          contactGroup.rotation.x = lerp(contactGroup.rotation.x, r.ply * 0.22, 0.05)

          // Camera focuses on "AURELIA"
          camera.lookAt(contactGroup.position.x, currentY - 0.1, contactGroup.position.z)

          // Dynamic Cursor Repulsion & Harmonic Spring Physics for Pearl White Balls
          const planeContact = new THREE.Plane().setFromNormalAndCoplanarPoint(
            new THREE.Vector3(0, 0, 1),
            contactGroup.position
          )
          const cursorContact = new THREE.Vector3()
          raycaster.setFromCamera(new THREE.Vector2(r.mx, r.my), camera)

          let localCursor: THREE.Vector3 | null = null
          if (raycaster.ray.intersectPlane(planeContact, cursorContact)) {
            localCursor = contactGroup.worldToLocal(cursorContact.clone())
          }

          refs.current.balls.forEach(b => {
            if (localCursor) {
              const dx = b.mesh.position.x - localCursor.x
              const dy = b.mesh.position.y - localCursor.y
              const dz = b.mesh.position.z - localCursor.z
              const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
              const repelRadius = 1.6

              if (dist < repelRadius && dist > 0.001) {
                const force = Math.pow(1 - dist / repelRadius, 1.4) * 0.16
                b.vel.x += (dx / dist) * force
                b.vel.y += (dy / dist) * force
                b.vel.z += (dz / dist) * force * 0.6
              }
            }

            // Gentle floating breathing oscillation
            b.vel.y += Math.sin(t * 1.3 + b.phase) * 0.0009
            b.vel.x += Math.cos(t * 0.95 + b.phase) * 0.0006

            // Spring return to home
            const toHomeX = b.home.x - b.mesh.position.x
            const toHomeY = b.home.y - b.mesh.position.y
            const toHomeZ = b.home.z - b.mesh.position.z
            b.vel.x += toHomeX * 0.055
            b.vel.y += toHomeY * 0.055
            b.vel.z += toHomeZ * 0.055

            // Friction / damping
            b.vel.multiplyScalar(0.86)

            b.mesh.position.add(b.vel)
            b.mesh.rotation.x += b.vel.y * 0.25
            b.mesh.rotation.y += b.vel.x * 0.25
          })
        } else if (s < 0.32) {
          // Camera looks at centered jellyfish during horizontal 360° rotation
          camera.lookAt(0, -0.1, 0)
          camera.rotateZ(targetCamRoll)
        } else {
          // Camera follows jellyfish upwards through cards, rings, and ascent
          camera.lookAt(jellyGroup.position.x, jellyGroup.position.y, jellyGroup.position.z)
          camera.rotateZ(targetCamRoll)
        }

        shardsGroup.position.y = lerp(shardsGroup.position.y, -s * 3.5, 0.038)
        shardsGroup.rotation.y = t * 0.035
      }

      // ── Shard Physics & Scattering ──────────────────────────────────────────
      const m3 = r.mouse3D
      r.shards.forEach(item => {
        if (!entered) {
          const wp = item.attractorPoint.clone().applyMatrix4(worldGroup.matrixWorld)
          const dist = wp.distanceTo(m3)
          if (dist < 1.85 && r.isHovering && r.isTransitionOpened) {
            item.targetPosition.copy(item.attractorPoint).addScaledVector(
              wp.clone().sub(m3).normalize(),
              (1 - dist / 1.85) * 0.55
            )
          } else {
            item.targetPosition.copy(item.attractorPoint).multiplyScalar(
              1 + Math.sin(t * 0.75 + item.phase) * 0.035
            )
          }
          if (hold > 0.01) item.targetPosition.addScaledVector(item.scatterVector, hold * 0.88)
          item.currentPosition.lerp(item.targetPosition, 0.085)
          item.mesh.position.copy(item.currentPosition)
          item.mesh.rotation.x += Math.sin(t * 0.28 + item.phase) * 0.0006
          item.mesh.rotation.y += Math.cos(t * 0.22 + item.phase) * 0.0006
        } else {
          item.targetPosition.copy(item.attractorPoint).add(item.scatterVector)
          item.currentPosition.lerp(item.targetPosition, 0.045)
          item.mesh.position.copy(item.currentPosition)
          item.mesh.rotation.x += item.rotSpeed.x
          item.mesh.rotation.y += item.rotSpeed.y
          item.mesh.rotation.z += item.rotSpeed.z
        }
      })

      composer.render()
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
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
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 5,
        pointerEvents: 'none',
      }}
    />
  )
}
