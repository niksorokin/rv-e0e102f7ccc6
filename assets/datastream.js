/* Vanilla port of the landing hero DataStreamGL (React + THREE) — conveyor of desktop
   captures dissolving into a glyph particle ocean at a bright seam. Same shaders, same look. */
import * as THREE from './three.module.min.js'

const GLYPHS = '0123456789ABCDEF#%$&<>/*+=?:;01'.slice(0, 25)
const CELLS = 5

function buildAtlas() {
  const S = 320
  const cell = S / CELLS
  const cv = document.createElement('canvas')
  cv.width = S
  cv.height = S
  const c = cv.getContext('2d')
  c.clearRect(0, 0, S, S)
  c.fillStyle = '#fff'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.font = `bold ${Math.floor(cell * 0.7)}px "JetBrains Mono", ui-monospace, monospace`
  for (let i = 0; i < GLYPHS.length; i++) {
    c.fillText(GLYPHS[i], (i % CELLS) * cell + cell / 2, ((i / CELLS) | 0) * cell + cell / 2)
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.flipY = false
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  return tex
}

/* ---------- crisp screen layer ---------- */
const SCREEN_VERT = `
  uniform float uTime, uSpeed, uStep, uSW, uKstep, uCardY, uCardH, uTileCount;
  uniform vec2 uRes;
  attribute float aLane;
  varying vec2 vUv;
  varying float vWorldX;
  varying float vCardX;
  varying float vTile;
  void main() {
    float phase = aLane * uStep + uTime * uSpeed;
    float cardX = mod(phase, uKstep) - uSW;
    float lx = position.x;
    float ly = position.y;
    float worldX = cardX + lx * uSW;
    float worldY = uCardY + ly * uCardH;
    vUv = vec2(lx, ly);
    vWorldX = worldX;
    vCardX = cardX;
    float wrap = floor(phase / uKstep);
    float laneCount = floor(uKstep / uStep + 0.5);
    vTile = mod(aLane + laneCount * wrap, uTileCount);
    vec2 clip = vec2(worldX / uRes.x * 2.0 - 1.0, 1.0 - worldY / uRes.y * 2.0);
    gl_Position = vec4(clip, 0.0, 1.0);
  }
`
const SCREEN_FRAG = `
  precision highp float;
  uniform sampler2D uTex;
  uniform float uImgW, uImgH, uCardW, uCardH, uSeam, uPre, uZone, uSW, uTileCols;
  uniform vec2 uTileScale;
  uniform vec3 uBlue;
  varying vec2 vUv;
  varying float vWorldX;
  varying float vCardX;
  varying float vTile;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float cardAspect = uCardW / uCardH;
    float imgAspect = uImgW / uImgH;
    vec2 uv = vUv;
    if (imgAspect > cardAspect) { uv.x = 0.5 + (vUv.x - 0.5) * (cardAspect / imgAspect); }
    else { uv.y = vUv.y * (imgAspect / cardAspect); }
    float tc = mod(vTile, uTileCols);
    float tr = floor(vTile / uTileCols + 0.0001);
    vec2 tuv = (vec2(tc, tr) + clamp(uv, 0.0, 1.0)) * uTileScale;
    vec3 rgb = texture2D(uTex, tuv).rgb;
    float ragged = (hash(floor(vUv * vec2(160.0, 110.0))) - 0.5) * 24.0;
    float d = (vWorldX + ragged - (uSeam - uPre)) / (uPre + uZone * 0.55);
    float a = 1.0 - smoothstep(0.0, 1.0, d);
    float erase = a;
    float leftFade = smoothstep(-uSW, -uSW + 40.0, vCardX);
    vec2 q = abs(vUv - 0.5);
    float frameX = smoothstep(0.502, 0.49, q.x);
    float frameY = smoothstep(0.502, 0.49, q.y);
    float aFill = erase * frameX * frameY * leftFade;
    float edgePx = min((0.5 - q.x) * uCardW, (0.5 - q.y) * uCardH);
    float border = 1.0 - smoothstep(0.0, 1.25, edgePx);
    float aBorder = erase * leftFade * border;
    float aOut = max(aFill, aBorder);
    if (aOut < 0.01) discard;
    vec3 col = mix(rgb, uBlue, border * 0.9);
    gl_FragColor = vec4(col, aOut);
  }
`

/* ---------- particle layer ---------- */
const POINT_VERT = `
  uniform float uTime, uSeam, uPre, uZone, uSize, uPixelRatio, uSpeed, uStep, uSW, uCardY, uKstep, uCells;
  uniform vec2 uRes;
  attribute vec3 aColor;
  attribute vec2 aLocal;
  attribute float aSeed;
  attribute float aLane;
  varying vec3 vColor;
  varying float vMix;
  varying float vAlpha;
  varying vec2 vCell;
  float hash(float n){ return fract(sin(n) * 43758.5453123); }
  void main() {
    float cardX = mod(aLane * uStep + uTime * uSpeed, uKstep) - uSW;
    float worldX = cardX + aLocal.x;
    float worldY = uCardY + aLocal.y;
    float ragged = (hash(aSeed * 91.7) - 0.5) * 0.5;
    float d = (worldX - (uSeam - uPre)) / (uPre + uZone) + ragged;
    float p = clamp(d, 0.0, 1.0);
    p = p * p * (3.0 - 2.0 * p);
    float past = max(0.0, worldX - uSeam);
    float spread = (aSeed - 0.5) * (50.0 + past * 1.05) * p;
    float drift = sin(uTime * 1.3 + aSeed * 40.0) * 12.0 * p;
    vec2 pos = vec2(worldX, worldY + spread + drift);
    vec2 clip = vec2(pos.x / uRes.x * 2.0 - 1.0, 1.0 - pos.y / uRes.y * 2.0);
    gl_Position = vec4(clip, 0.0, 1.0);
    gl_PointSize = uSize * (1.0 + p * 0.55) * uPixelRatio;
    vColor = aColor;
    vMix = p;
    float rightEdge = 1.0 - smoothstep(uRes.x - 170.0, uRes.x, pos.x);
    float leftEdge = smoothstep(-uSW, -uSW + 40.0, cardX);
    float appear = smoothstep(0.05, 0.22, p);
    vAlpha = rightEdge * leftEdge * appear;
    float gi = floor(hash(aSeed * 13.1 + floor(uTime * 7.0) * 0.37) * 24.99);
    vCell = vec2(mod(gi, uCells), floor(gi / uCells)) / uCells;
  }
`
const POINT_FRAG = `
  precision highp float;
  uniform sampler2D uAtlas;
  uniform float uCells;
  uniform vec3 uBlue;
  varying vec3 vColor;
  varying float vMix;
  varying float vAlpha;
  varying vec2 vCell;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float pixel = smoothstep(0.5, 0.16, d);
    vec2 guv = vCell + gl_PointCoord / uCells;
    float glyph = texture2D(uAtlas, guv).a;
    float m = smoothstep(0.2, 0.62, vMix);
    float shape = mix(pixel, glyph, m);
    vec3 col = mix(vColor, uBlue, clamp(vMix * 1.25, 0.0, 1.0)) + uBlue * vMix * 0.28;
    float a = shape * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
  }
`

/* ---------- beam layer ---------- */
const BEAM_VERT = `
  uniform vec2 uRes;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec2 clip = vec2(position.x / uRes.x * 2.0 - 1.0, 1.0 - position.y / uRes.y * 2.0);
    gl_Position = vec4(clip, 0.0, 1.0);
  }
`
const BEAM_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uActivity;
  uniform vec3 uBlue;
  void main() {
    float ax = abs(vUv.x - 0.5);
    float act = uActivity;
    float bloomPow = mix(7.8, 4.4, act);
    float coreMul = mix(92.0, 50.0, act);
    float hotMul = mix(220.0, 135.0, act);
    float bloom = pow(clamp(1.0 - ax * 2.9, 0.0, 1.0), bloomPow);
    float core = pow(clamp(1.0 - ax * coreMul, 0.0, 1.0), 1.3);
    float hot = pow(clamp(1.0 - ax * hotMul, 0.0, 1.0), 1.2);
    float by = smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
    float vCenter = pow(clamp(1.0 - abs(vUv.y - 0.5) * 1.7, 0.0, 1.0), 1.5);
    float pulse = 0.85 + 0.15 * sin(uTime * 2.2);
    float intensity = mix(0.16, 0.7, act);
    float a = (bloom * 0.5 + core * 1.3 + hot * (1.7 + vCenter * 1.7)) * by * pulse * intensity;
    vec3 col = mix(uBlue, vec3(0.36, 0.66, 1.0), clamp(hot * 0.9 + core * 0.4, 0.0, 1.0));
    gl_FragColor = vec4(col, a);
  }
`

export function initDataStream(canvas, src) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const BLUE = new THREE.Color(0.30, 0.5, 1.0)
  const SPEED = reduce ? 0 : 132
  const atlas = buildAtlas()

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setClearAlpha(0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const camera = new THREE.Camera()
  const scene = new THREE.Scene()

  const SRCS = Array.isArray(src) ? src : [src]
  const N_IMG = SRCS.length
  const TCOLS = Math.min(2, N_IMG)
  const TROWS = Math.ceil(N_IMG / TCOLS)
  const images = SRCS.map(() => new Image())
  let imgReady = false

  const atlasCanvas = document.createElement('canvas')
  const actx = atlasCanvas.getContext('2d')
  const tex = new THREE.CanvasTexture(atlasCanvas)
  tex.flipY = false
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter

  const off = document.createElement('canvas')
  const octx = off.getContext('2d', { willReadFrequently: true })

  let nLoaded = 0
  const onAllLoaded = () => {
    const ref0 = images.find((im) => im.naturalWidth) || images[0]
    const tw = ref0.naturalWidth || 1, th = ref0.naturalHeight || 1
    atlasCanvas.width = tw * TCOLS
    atlasCanvas.height = th * TROWS
    actx.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height)
    images.forEach((im, i) => {
      if (!im.naturalWidth) return
      const col = i % TCOLS, row = (i / TCOLS) | 0
      actx.drawImage(im, col * tw, row * th, tw, th)
    })
    tex.needsUpdate = true
    imgReady = true
    layout()
  }
  images.forEach((im, i) => {
    im.onload = () => { if (++nLoaded === N_IMG) onAllLoaded() }
    im.onerror = () => { if (++nLoaded === N_IMG) onAllLoaded() }
    im.src = SRCS[i]
  })

  const screenMat = new THREE.ShaderMaterial({
    vertexShader: SCREEN_VERT,
    fragmentShader: SCREEN_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 }, uSeam: { value: 0 }, uPre: { value: 10 }, uZone: { value: 42 },
      uSpeed: { value: SPEED }, uStep: { value: 1 }, uSW: { value: 1 }, uKstep: { value: 1 },
      uCardY: { value: 0 }, uCardH: { value: 1 }, uCardW: { value: 1 },
      uImgW: { value: 1 }, uImgH: { value: 1 },
      uTileScale: { value: new THREE.Vector2(1 / TCOLS, 1 / TROWS) },
      uTileCols: { value: TCOLS }, uTileCount: { value: N_IMG },
      uRes: { value: new THREE.Vector2(1, 1) }, uTex: { value: tex },
      uBlue: { value: new THREE.Color(0.66, 0.66, 0.64) },
    },
  })
  const RES = screenMat.uniforms.uRes.value

  const pointsMat = new THREE.ShaderMaterial({
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 }, uSeam: { value: 0 }, uPre: { value: 10 }, uZone: { value: 42 },
      uSize: { value: 8 }, uPixelRatio: { value: 1 }, uSpeed: { value: SPEED },
      uStep: { value: 1 }, uSW: { value: 1 }, uCardY: { value: 0 }, uKstep: { value: 1 },
      uCells: { value: CELLS }, uRes: { value: RES }, uAtlas: { value: atlas }, uBlue: { value: BLUE },
    },
  })
  const beamMat = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: { uTime: { value: 0 }, uActivity: { value: 0 }, uRes: { value: RES }, uBlue: { value: BLUE } },
  })

  let screens = null, points = null, beam = null
  let w = 0, h = 0, dpr = 1
  let gSeam = 0, gStep = 1, gSW = 1, gKstep = 1, gK = 1

  function buildGeometry() {
    if (!imgReady || w === 0) return
    const cardH = Math.min(h * 0.94, 360)
    const SW = Math.min(cardH * 1.5, w * 0.92)
    const seam = Math.round(w * 0.5)
    const cardY = (h - cardH) / 2
    const step = 5
    const COLS = Math.max(2, Math.floor(SW / step))
    const ROWS = Math.max(2, Math.floor(cardH / step))
    const GAP = SW * 0.5
    const STEP = SW + GAP
    const K = Math.max(3, Math.round((w + SW) / STEP))
    const Kstep = K * STEP
    gSeam = seam; gStep = STEP; gSW = SW; gKstep = Kstep; gK = K

    off.width = COLS
    off.height = ROWS
    const ref0 = images.find((im) => im.naturalWidth) || images[0]
    const iw = ref0.naturalWidth, ih = ref0.naturalHeight
    const tileData = images.map((im) => {
      const sim = im.naturalWidth ? im : ref0
      const scale = Math.max(COLS / sim.naturalWidth, ROWS / sim.naturalHeight)
      const sw = COLS / scale, sh = ROWS / scale
      octx.clearRect(0, 0, COLS, ROWS)
      octx.drawImage(sim, (sim.naturalWidth - sw) / 2, 0, sw, sh, 0, 0, COLS, ROWS)
      return octx.getImageData(0, 0, COLS, ROWS).data
    })

    const N = K * COLS * ROWS
    const local = new Float32Array(N * 2)
    const color = new Float32Array(N * 3)
    const seed = new Float32Array(N)
    const lane = new Float32Array(N)
    let k = 0
    for (let L = 0; L < K; L++) {
      const data = tileData[L % N_IMG]
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const i = (r * COLS + c) * 4
          local[k * 2] = c * step + step / 2
          local[k * 2 + 1] = r * step + step / 2
          color[k * 3] = data[i] / 255
          color[k * 3 + 1] = data[i + 1] / 255
          color[k * 3 + 2] = data[i + 2] / 255
          seed[k] = Math.random()
          lane[k] = L
          k++
        }
      }
    }
    const pgeo = new THREE.BufferGeometry()
    pgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    pgeo.setAttribute('aLocal', new THREE.BufferAttribute(local, 2))
    pgeo.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
    pgeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    pgeo.setAttribute('aLane', new THREE.BufferAttribute(lane, 1))
    if (points) { scene.remove(points); points.geometry.dispose() }
    points = new THREE.Points(pgeo, pointsMat)
    points.frustumCulled = false
    points.renderOrder = 1
    scene.add(points)

    const sv = K * 6
    const spos = new Float32Array(sv * 3)
    const slane = new Float32Array(sv)
    const corners = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]
    let si = 0
    for (let L = 0; L < K; L++) {
      for (const [cx, cy] of corners) {
        spos[si * 3] = cx
        spos[si * 3 + 1] = cy
        spos[si * 3 + 2] = 0
        slane[si] = L
        si++
      }
    }
    const sgeo = new THREE.BufferGeometry()
    sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3))
    sgeo.setAttribute('aLane', new THREE.BufferAttribute(slane, 1))
    if (screens) { scene.remove(screens); screens.geometry.dispose() }
    screens = new THREE.Mesh(sgeo, screenMat)
    screens.frustumCulled = false
    screens.renderOrder = 0
    scene.add(screens)

    const BW = 120
    const bpos = new Float32Array([
      seam - BW, 0, 0, seam + BW, 0, 0, seam + BW, h, 0,
      seam - BW, 0, 0, seam + BW, h, 0, seam - BW, h, 0,
    ])
    const buv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1])
    const bgeo = new THREE.BufferGeometry()
    bgeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3))
    bgeo.setAttribute('uv', new THREE.BufferAttribute(buv, 2))
    if (beam) { scene.remove(beam); beam.geometry.dispose() }
    beam = new THREE.Mesh(bgeo, beamMat)
    beam.frustumCulled = false
    beam.renderOrder = 2
    scene.add(beam)

    for (const m of [screenMat, pointsMat]) {
      m.uniforms.uSeam.value = seam
      m.uniforms.uStep.value = STEP
      m.uniforms.uSW.value = SW
      m.uniforms.uCardY.value = cardY
      m.uniforms.uKstep.value = Kstep
    }
    screenMat.uniforms.uCardH.value = cardH
    screenMat.uniforms.uCardW.value = SW
    screenMat.uniforms.uImgW.value = iw
    screenMat.uniforms.uImgH.value = ih
    pointsMat.uniforms.uSize.value = step * 1.7
  }

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    const r = canvas.getBoundingClientRect()
    w = Math.max(1, Math.round(r.width))
    h = Math.max(1, Math.round(r.height))
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    RES.set(w, h)
    pointsMat.uniforms.uPixelRatio.value = dpr
    buildGeometry()
  }
  layout()
  const ro = new ResizeObserver(layout)
  ro.observe(canvas)

  function frame(ts) {
    requestAnimationFrame(frame)
    const t = ts / 1000
    screenMat.uniforms.uTime.value = t
    pointsMat.uniforms.uTime.value = t
    beamMat.uniforms.uTime.value = t

    let act = 0
    for (let L = 0; L < gK; L++) {
      const cx = (((L * gStep + t * SPEED) % gKstep) + gKstep) % gKstep - gSW
      let cov
      if (gSeam >= cx && gSeam <= cx + gSW) cov = 1
      else {
        const dist = gSeam < cx ? cx - gSeam : gSeam - (cx + gSW)
        cov = Math.max(0, 1 - dist / 90)
      }
      if (cov > act) act = cov
    }
    beamMat.uniforms.uActivity.value = act

    if (screens) renderer.render(scene, camera)
  }
  requestAnimationFrame(frame)
}
