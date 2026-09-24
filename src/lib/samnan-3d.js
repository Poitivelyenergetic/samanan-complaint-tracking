/*!
 * samnan-3d - a live 3D, drag-to-rotate view of a Samnan product.
 *
 * The same interaction as samnan-spinner (drag sideways to turn, drag up and down to
 * tilt it all the way over, flick to spin, idle spin, eases home after a pause) - but
 * drawn live from the Blender model exported as .glb, instead of from pre-rendered
 * photos. So every angle is available, not just the ones that were rendered, and the
 * tilt is as smooth as the spin.
 *
 * Double-click pulls the product apart (exploded view); double-click again puts it
 * back together.
 *
 *   import { mount } from './samnan-3d.js';
 *   mount(el, { model: 'pump.glb' });
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const DEFAULTS = {
  model: 'pump.glb',
  secondsPerTurn: 8,       // idle spin, same as the photo spinner
  dragTurns: 0.9,          // turns per drag across the element's width
  tiltRange: 150,          // degrees per drag down the element's height
  homeElev: 12,            // the resting camera elevation, as in the renders
  homeAfter: 10000,        // ms a tilt is held before easing home
  resumeAfter: 1500,       // ms before the idle spin resumes
  explode: 0.55,           // how far parts travel, as a fraction of the model's size;
                           // 0 turns the double-click pull-apart off
  exposure: 1.0,
  lazy: true,              // do not download the model until it is near the viewport
  // false = display only: it spins, but takes no pointer or keyboard input and draws no
  // label, and clicks go straight through to the host element. For thumbnails - e.g.
  // the small products stacked beside the main one, where a click should select them.
  interactive: true,
  maxPixelRatio: 3,        // thumbnails can use less; native up to 3x otherwise
  // GPU budget. Both default by role: a display-only thumbnail gets no shadow pass at all
  // and draws at 30 fps; the interactive view gets a 2048 shadow map at full rate. The
  // first version gave every instance a 4096 map - about 64 MB of GPU memory EACH, a
  // quarter of a gigabyte for a main plus three thumbnails - and drew all four at 60 fps.
  shadowMapSize: null,     // null = by role (2048 interactive, 0 = off otherwise)
  maxFps: null,            // null = by role (60 interactive, 30 otherwise)
  poster: null,            // still image shown if the browser cannot do WebGL at all
};

function webglOK() {
  try {
    const c = document.createElement('canvas');
    const gl = (window.WebGL2RenderingContext && c.getContext('webgl2')) ||
               (window.WebGLRenderingContext && c.getContext('webgl'));
    // The probe's context counts toward the browser's live-context limit until the
    // canvas is collected, and every mount probes - let it go now.
    if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch (_) { return false; }
}

const TAU = Math.PI * 2;
const wrapPi = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function mount(el, opts = {}) {
  const o = Object.assign({}, DEFAULTS, opts);
  if (o.shadowMapSize == null) o.shadowMapSize = o.interactive ? 2048 : 0;
  if (o.maxFps == null) o.maxFps = o.interactive ? 60 : 30;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // No WebGL (very old devices, some locked-down corporate browsers, GPU blocklists):
  // show the poster still instead of a blank box, and say so to the host page.
  if (!webglOK()) {
    if (o.poster) {
      const img = document.createElement('img');
      img.src = o.poster; img.alt = el.getAttribute('aria-label') || '';
      img.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain';
      el.appendChild(img);
    }
    el.dispatchEvent(new CustomEvent('samnan-3d:fallback'));
    return { el, state: () => ({ fallback: true }), setPose() {}, toggleExplode() {},
             destroy() { el.innerHTML = ''; } };
  }

  // ------------------------------------------------------------------ renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  // Native pixel density up to 3x. A cap of 2 looked safe but a 4K laptop panel runs
  // at 2.5-3x, so the canvas was drawn below native and stretched - visibly soft.
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, o.maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // AgX, to match the Blender renders' view transform, so the live model and the
  // photos agree on how bright a white is and how a highlight rolls off.
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = o.exposure;
  renderer.shadowMap.enabled = o.shadowMapSize > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const cv = renderer.domElement;
  cv.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;' +
    'cursor:grab;user-select:none;-webkit-user-select:none;' +
    '-webkit-tap-highlight-color:transparent';
  if (o.interactive) el.style.touchAction = 'none';
  else cv.style.pointerEvents = 'none';           // let clicks reach the host
  el.appendChild(cv);
  el.setAttribute('role', 'img');
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);

  // A key light for self-shadowing - the environment alone gives reflections but no
  // contact shadows, and without them parts read as floating near each other rather
  // than bolted together. Fixed to the camera's world, like a studio light: the product
  // turns under it.
  const key = new THREE.DirectionalLight(0xfff6ec, 1.6);
  key.castShadow = o.shadowMapSize > 0;
  // 2048 across a product well under a metre is under half a millimetre per texel,
  // which PCF softening makes indistinguishable from 4096 even on a 4K panel.
  if (key.castShadow) key.shadow.mapSize.set(o.shadowMapSize, o.shadowMapSize);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);

  // yaw -> pitch -> the model. Pitch turns about the SCREEN's horizontal axis, so
  // dragging down always tips the product toward you, whichever way it is facing.
  const pitchG = new THREE.Group(), yawG = new THREE.Group(), center = new THREE.Group();
  scene.add(pitchG); pitchG.add(yawG); yawG.add(center);

  // ------------------------------------------------------------------ state
  let yaw = 0, pitch = 0, vel = 0, dragging = false;
  let lastX = 0, lastY = 0, lastT = 0, idleUntil = 0, levelUntil = 0;
  let parts = [], exploded = false, xT = 0, xFrom = 0, xTo = 0, xStart = 0;
  let radius = 1, radiusX = 1, dead = false, raf = 0, ready = false;

  let xk = 0;                        // explode progress, 0 together .. 1 apart
  function size() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    frame();
  }
  // Camera distance for the current explode progress. Together, the product fills the
  // view; as it comes apart the camera eases back with it, so the pieces never leave
  // the frame and the resting view is not shrunk to make room for a state it is
  // rarely in.
  function frame() {
    // Fit the bounding SPHERE, not the box: a sphere is the same size at every angle,
    // so nothing clips at any point of a full flip - the check the photo renders needed
    // a separate script for is automatic here.
    const vf = THREE.MathUtils.degToRad(camera.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const f = Math.min(vf, hf);
    // Open, the camera backs off to fit the pieces; focused on one part (which is
    // enlarged to about the product's own size) it comes back in.
    const open = radius + (radiusX - radius) * xk;
    const reach = open + (radius - open) * (typeof fk === 'number' ? fk : 0);
    const dist = reach / Math.sin(f / 2) * 1.02;
    const e = THREE.MathUtils.degToRad(o.homeElev);
    camera.position.set(0, Math.sin(e) * dist, Math.cos(e) * dist);
    camera.lookAt(0, 0, 0);
    camera.near = dist / 50; camera.far = dist * 4;
    camera.updateProjectionMatrix();
    key.position.set(-dist * 0.7, dist * 0.9, dist * 0.8);
    const s = key.shadow.camera;
    s.left = s.bottom = -reach * 1.1; s.right = s.top = reach * 1.1;
    s.near = dist * 0.1; s.far = dist * 3;
    s.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ load
  // A "group" is one part as a person thinks of it - a filter, not its body, caps, ribs,
  // stems and label separately. Products built for the exploded view say which nodes
  // belong together (the "part" custom property) and what the part is called ("label").
  let groups = [], focus = null, fT = 1, fFrom = 0, fTo = 0, fStart = 0, fk = 0;
  let modelC = new THREE.Vector3();          // the model's middle, in root space
  let rootRef = null;
  let loading = false;
  function load() {
  if (loading || dead) return;
  loading = true;
  new GLTFLoader().load(o.model, (gltf) => {
    if (dead) return;
    const root = gltf.scene;
    rootRef = root;
    const box = new THREE.Box3().setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    modelC.copy(c);
    radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    root.position.sub(c);                    // turn about the model's own middle
    center.add(root);
    root.updateMatrixWorld(true);
    root.traverse((n) => {
      if (!n.isMesh) return;
      n.castShadow = n.receiveShadow = true;
      // Own copies of the materials, so one part can fade without fading every other
      // part that happens to share its material.
      const cl = (m) => { const k = m.clone();
        k.userData.base = { opacity: m.opacity, transparent: m.transparent,
                            depthWrite: m.depthWrite };
        return k; };
      n.material = Array.isArray(n.material) ? n.material.map(cl) : cl(n.material);
    });
    // Exploded view. A product built for it carries a designed offset on every part
    // (the "explode" custom property from Blender, arriving as glTF extras in
    // userData) - the shell comes apart face by face and the insides spread just enough
    // to read as separate. Anything without one falls back to moving straight out from
    // the middle, further the further out it already is.
    const designed = root.children.some((n) => Array.isArray(n.userData.explode));
    const xbox = new THREE.Box3();
    const byKey = new Map();
    root.children.forEach((n) => {
      const b = new THREE.Box3().setFromObject(n);
      if (b.isEmpty()) return;
      let off;
      const e = n.userData.explode;
      if (designed) {
        // Blender is Z-up, glTF is Y-up: (x, y, z) -> (x, z, -y).
        off = Array.isArray(e) ? new THREE.Vector3(e[0], e[2], -e[1]) : new THREE.Vector3();
      } else {
        const d = b.getCenter(new THREE.Vector3());   // relative to the centred model
        const len = d.length();
        const dir = len > 1e-6 ? d.divideScalar(len) : new THREE.Vector3(0, 1, 0);
        off = dir.multiplyScalar(radius * o.explode * (0.35 + len / radius));
      }
      const p = { n, home: n.position.clone(), scale0: n.scale.clone(), off };
      parts.push(p);
      xbox.union(b.clone().translate(off));
      const key = n.userData.part || n.name || ('part' + parts.length);
      if (!byKey.has(key)) {
        byKey.set(key, { key, label: n.userData.label || pretty(n.name || key),
                         parts: [], user: new THREE.Vector3(), userStart: null });
      }
      byKey.get(key).parts.push(p);
      n.traverse((m) => { if (m.isMesh) m.userData.group = byKey.get(key); });
    });
    groups = [...byKey.values()];
    // How big the whole thing gets fully apart, so the camera can back off to exactly
    // that - no more - as it opens.
    radiusX = Math.max(radius, xbox.isEmpty() ? radius
      : xbox.getBoundingSphere(new THREE.Sphere()).radius +
        xbox.getCenter(new THREE.Vector3()).length());
    size();
    ready = true;
    el.dispatchEvent(new CustomEvent('samnan-3d:ready'));
  }, undefined, (err) => console.error('[samnan-3d] load failed', err));
  }

  function pretty(s) {
    return String(s).replace(/^(in|shell)_/, '').replace(/[._]\d+$/, '')
      .replace(/[_\-.]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()).trim();
  }

  // ------------------------------------------------------------------ overlay
  // The part's name, and in the opened view a one-line hint. Plain DOM over the canvas,
  // styled to read on a light or a dark host page.
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  const tip = document.createElement('div');
  tip.style.cssText = 'position:absolute;left:50%;bottom:12px;transform:translateX(-50%);' +
    'max-width:calc(100% - 24px);padding:6px 12px;border-radius:999px;' +
    'background:rgba(20,24,33,.76);color:#fff;font:600 13px/1.3 system-ui,sans-serif;' +
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;' +
    'opacity:0;transition:opacity .2s';
  if (o.interactive) el.appendChild(tip);
  let tipText = '';
  function setTip(t) {
    if (t === tipText) return;
    tipText = t;
    if (t) tip.textContent = t;
    tip.style.opacity = t ? '1' : '0';
  }

  // ------------------------------------------------------------------ poses
  const _b = new THREE.Box3(), _v = new THREE.Vector3();
  function groupCentre(g, out) {                 // in root space, current pose
    _b.makeEmpty();
    for (const p of g.parts) { p.n.updateMatrixWorld(true); _b.expandByObject(p.n); }
    // expandByObject works in world space; bring the centre back into root space
    _b.getCenter(out);
    return rootRef.worldToLocal(out);
  }
  function groupRadius(g) {
    _b.makeEmpty();
    for (const p of g.parts) _b.expandByObject(p.n);
    return Math.max(1e-4, _b.getBoundingSphere(new THREE.Sphere()).radius /
                          Math.max(1e-6, rootRef.matrixWorld.getMaxScaleOnAxis()));
  }
  // Every part's position is recomputed from scratch each frame: home, plus its explode
  // offset and wherever it has been dragged, scaled by how open the product is; then,
  // for the focused part only, blended toward "centred and enlarged".
  let focusC = new THREE.Vector3(), focusS = 1;
  function pose() {
    for (const g of groups) {
      for (const p of g.parts) {
        p.n.position.copy(p.home).addScaledVector(p.off, xk).addScaledVector(g.user, xk);
        p.n.scale.copy(p.scale0);
      }
    }
    if (focus && fk > 0) {
      // centre of the focused part at its exploded pose, then scale it up about that
      // centre and slide it to the middle of the model
      for (const p of focus.parts) {
        const px = p.n.position.clone();
        const target = modelC.clone().add(px.sub(focusC).multiplyScalar(focusS));
        p.n.position.lerp(target, fk);
        p.n.scale.copy(p.scale0).multiplyScalar(1 + (focusS - 1) * fk);
      }
    }
    // fade everything that is not in focus
    // Almost gone rather than ghosted: at 10% the faded parts, now close to the
    // camera, filled the view with grey shapes around the one being looked at.
    const dim = 1 - 0.975 * fk;
    for (const g of groups) {
      const a = focus && g !== focus ? dim : 1;
      for (const p of g.parts) p.n.traverse((m) => {
        if (!m.isMesh) return;
        for (const mt of Array.isArray(m.material) ? m.material : [m.material]) {
          const b = mt.userData.base; if (!b) continue;
          const t = b.transparent || a < 0.999;
          if (t !== mt.transparent) { mt.transparent = t; mt.needsUpdate = true; }
          mt.opacity = b.opacity * a;
          mt.depthWrite = a > 0.5 ? b.depthWrite : false;
        }
      });
    }
  }

  function setFocus(g) {
    if (g === focus && fTo === 1) return;
    const now = performance.now();
    if (g) {
      focus = g;
      // measured at the exploded pose without any focus applied
      const keep = fk; fk = 0; pose(); fk = keep;
      groupCentre(g, focusC);
      focusS = Math.min(6, Math.max(1, (radius * 0.85) / groupRadius(g)));
      fFrom = fk; fTo = 1;
    } else {
      fFrom = fk; fTo = 0;
    }
    fStart = now; fT = 0;
    idleUntil = now + o.resumeAfter;
  }

  // ------------------------------------------------------------------ motion
  const homePitch = 0;
  let prev = 0, onScreen = !o.lazy, lastDraw = -1e9;
  function tick(t) {
    if (dead) return;
    // Off screen, stop drawing entirely - a 60 fps WebGL loop nobody can see is a
    // battery drain on phones. The loop restarts from the observer below.
    if (!onScreen) { raf = 0; prev = 0; return; }
    raf = requestAnimationFrame(tick);
    const dt = prev ? Math.min((t - prev) / 1000, 0.1) : 0; prev = t;
    if (!dragging && mode !== 'move') {
      const toHome = wrapPi(homePitch - pitch);
      if (Math.abs(toHome) > 1e-3 && t > levelUntil) {
        pitch += toHome * (1 - Math.pow(0.004, dt));      // the short way round
      }
      if (Math.abs(vel) > 0.004) {
        yaw += vel * TAU * dt;
        vel *= Math.pow(0.12, dt);
      } else {
        vel = 0;
        if (!reduce && Math.abs(toHome) < 0.01 && t > idleUntil) {
          yaw += TAU * dt / o.secondsPerTurn;
        }
      }
    }
    let moved = false;
    if (xT < 1) {
      xT = Math.min(1, (t - xStart) / 900);
      xk = xFrom + (xTo - xFrom) * ease(xT);
      if (xT >= 1 && xTo === 0) for (const g of groups) g.user.set(0, 0, 0);
      moved = true;
    }
    if (fT < 1) {
      fT = Math.min(1, (t - fStart) / 650);
      fk = fFrom + (fTo - fFrom) * ease(fT);
      if (fT >= 1 && fTo === 0) focus = null;
      moved = true;
    }
    if (moved || mode === 'move') { pose(); frame(); }
    yawG.rotation.y = yaw;
    pitchG.rotation.x = pitch;
    // Animation state advances every frame; the draw itself is capped at maxFps. A
    // thumbnail turning slowly at 72 px loses nothing at 30.
    if (ready && t - lastDraw >= 1000 / o.maxFps - 2) { renderer.render(scene, camera); lastDraw = t; }
    // the name under the pointer, or of the part in focus, or the hint
    if (focus && fk > 0.5) setTip(focus.label);
    else if (hovered && xk > 0.95) setTip(hovered.label);
    else if (xk > 0.95) setTip('Click a part to look at it · drag a part to move it');
    else setTip('');
  }
  function wake() { if (!raf && !dead) raf = requestAnimationFrame(tick); }
  let io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver((es) => {
      onScreen = es.some((e) => e.isIntersecting);
      if (onScreen) { load(); wake(); }
    }, { rootMargin: '200px' });
    io.observe(el);
  } else {
    onScreen = true;
  }
  if (!o.lazy || !io) { onScreen = true; load(); wake(); }

  // ------------------------------------------------------------------ picking
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e) {
    if (!ready || xk < 0.95) return null;         // parts are only handled when open
    const r = cv.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObject(center, true);
    for (const h of hits) {
      const g = h.object.userData.group;
      if (!g) continue;
      if (focus && fk > 0.5 && g !== focus) continue;   // faded parts are not clickable
      return g;
    }
    return null;
  }

  // ------------------------------------------------------------------ input
  // One gesture, three meanings, decided by where it starts and whether it moves:
  //   on a part, moves      -> drag that part around
  //   on a part, no move    -> focus that part
  //   anywhere else         -> turn the whole view (and a still click there unfocuses)
  let mode = null, downX = 0, downY = 0, downG = null, hovered = null, clickTimer = 0;
  const plane = new THREE.Plane(), hitP = new THREE.Vector3(), startP = new THREE.Vector3();
  function planeHit(e, out) {
    const r = cv.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, out);
  }
  function onDown(e) {
    if (e.button != null && e.button !== 0) return;
    downX = e.clientX; downY = e.clientY;
    lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
    vel = 0;
    downG = pick(e);
    mode = downG && !(focus && fk > 0.5) ? 'part' : 'rotate';
    dragging = mode === 'rotate';
    cv.style.cursor = 'grabbing';
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function onMove(e) {
    if (!mode) {                                     // hovering
      const g = pick(e);
      if (g !== hovered) { hovered = g; cv.style.cursor = g ? 'pointer' : 'grab'; }
      return;
    }
    const far = Math.hypot(e.clientX - downX, e.clientY - downY) > 5;
    if (mode === 'part' && far) {
      // Start moving the part: in the plane facing the camera, through the part.
      mode = 'move';
      const wc = new THREE.Vector3();
      groupCentre(downG, wc); rootRef.localToWorld(wc);
      plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), wc);
      planeHit(e, startP);
      downG.userStart = downG.user.clone();
    }
    if (mode === 'move') {
      if (planeHit(e, hitP)) {
        const a = rootRef.worldToLocal(startP.clone()), b = rootRef.worldToLocal(hitP.clone());
        downG.user.copy(downG.userStart).add(b.sub(a).divideScalar(Math.max(xk, 1e-3)));
      }
      return;
    }
    if (mode !== 'rotate') return;
    const w = el.clientWidth || 1, h = el.clientHeight || 1, now = performance.now();
    const da = ((e.clientX - lastX) / w) * o.dragTurns;
    yaw += da * TAU;
    // Drag DOWN shows the underside, exactly as the photo spinner does: it lowers the
    // camera there, which is the product's bottom tipping toward you here.
    pitch -= THREE.MathUtils.degToRad(((e.clientY - lastY) / h) * o.tiltRange);
    pitch = wrapPi(pitch);
    const dt = (now - lastT) / 1000;
    if (dt > 0.004) { vel = da / dt; lastT = now; }
    lastX = e.clientX; lastY = e.clientY;
  }
  function release(e) {
    if (!mode) return;
    const still = Math.hypot((e ? e.clientX : downX) - downX, (e ? e.clientY : downY) - downY) <= 5;
    const was = mode, g = downG;
    mode = null; dragging = false; downG = null;
    cv.style.cursor = hovered ? 'pointer' : 'grab';
    vel = was === 'rotate' ? Math.max(-4, Math.min(4, vel)) : 0;
    const now = performance.now();
    idleUntil = now + o.resumeAfter;
    levelUntil = now + o.homeAfter;
    if (!still || e.type === 'pointercancel') return;
    // A still click. Wait a moment before acting on it, because the first click of a
    // double-click lands here too, and the double-click (open/close) must win.
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      if (was === 'part' && g) setFocus(g);
      // a still click on the part already in focus keeps it; anywhere else lets go
      else if (focus && g !== focus) setFocus(null);
    }, 240);
  }
  function onDbl(e) {
    e.preventDefault();
    clearTimeout(clickTimer);
    if (!o.explode || !parts.length) return;
    exploded = !exploded;
    if (!exploded && focus) setFocus(null);
    const now = performance.now();
    const cur = xk;
    xFrom = cur; xTo = exploded ? 1 : 0; xStart = now; xT = 0;
    idleUntil = now + o.resumeAfter;
  }
  function onKey(e) {
    const k = e.key, now = performance.now();
    if (k === 'ArrowLeft' || k === 'ArrowRight') yaw += (k === 'ArrowRight' ? 1 : -1) * TAU * 0.02;
    else if (k === 'ArrowUp' || k === 'ArrowDown') pitch = wrapPi(pitch + THREE.MathUtils.degToRad(k === 'ArrowUp' ? 15 : -15));
    else if (k === 'Enter' || k === ' ') { onDbl(e); return; }
    else if (k === 'Escape') {
      if (focus) setFocus(null); else if (exploded) onDbl(e);
      e.preventDefault(); return;
    }
    else return;
    idleUntil = now + o.resumeAfter; levelUntil = now + o.homeAfter;
    e.preventDefault();
  }
  function onLeave() { if (!mode && hovered) { hovered = null; cv.style.cursor = 'grab'; } }
  const BOUND = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', release],
                 ['pointercancel', release], ['pointerleave', onLeave],
                 ['dblclick', onDbl], ['keydown', onKey]];
  if (o.interactive) BOUND.forEach(([t, f]) => el.addEventListener(t, f));
  const ro = new ResizeObserver(size); ro.observe(el);

  return {
    el,
    state: () => ({ yaw, pitch, dragging, exploded, ready, parts: parts.length,
                    groups: groups.length, focus: focus ? focus.label : null,
                    hovered: hovered ? hovered.label : null }),
    // For demos and tests: turn to an exact pose without a pointer.
    setPose(y, p) { yaw = y; pitch = wrapPi(p); const n = performance.now();
                    idleUntil = n + o.resumeAfter; levelUntil = n + o.homeAfter; },
    toggleExplode() { onDbl({ preventDefault() {} }); },
    // Focus a part by its label (or null to go back), as a click on it would.
    focusPart(label) {
      if (!label) return setFocus(null);
      const g = groups.find((x) => x.label === label || x.key === label);
      if (g) setFocus(g);
      return !!g;
    },
    parts: () => groups.map((g) => g.label),
    destroy() {
      dead = true; cancelAnimationFrame(raf); ro.disconnect(); if (io) io.disconnect();
      clearTimeout(clickTimer);
      BOUND.forEach(([t, f]) => el.removeEventListener(t, f));
      // Free the GPU side now, not whenever the canvas happens to be collected. The host
      // swaps the main product every 30 s and remounts a thumbnail each time, so leaked
      // contexts would pile up past the browser's limit on a page left open.
      scene.traverse((n) => {
        if (n.geometry) n.geometry.dispose();
        const ms = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : [];
        for (const m of ms) {
          for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
          m.dispose();
        }
      });
      if (scene.environment) scene.environment.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (cv.parentNode === el) el.removeChild(cv);
      if (tip.parentNode === el) el.removeChild(tip);
    },
  };
}
