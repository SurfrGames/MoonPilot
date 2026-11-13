// The 3D world: Moon, Earth, sun, stars, ground detail that follows the rocket, the player's rocket with
// working legs, the AI ghost, and the effects (exhaust, dust, touchdown, explosion, shake).
// Scene units are kilometres; physics hands us metres.
const World = (() => {
  const R = 1737.4, KM = 1e-3, OMEGA = 2.6617e-6;
  const V = (x, y, z) => new THREE.Vector3(x, y, z), Z = V(0, 0, 1), Y = V(0, 1, 0);
  const renderer = new THREE.WebGLRenderer({antialias: true, logarithmicDepthBuffer: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.domElement.id = "gl"; document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1, 0.002, 2e6);
  const mapCam = new THREE.PerspectiveCamera(36, 1, 100, 2e6);
  scene.add(new THREE.AmbientLight(0x8fa0c8, .22));
  const sun = new THREE.DirectionalLight(0xfff3dc, 1.28); scene.add(sun);

  // ---- procedural, tileable textures (no image files to license) ----
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  function tex(w, h, draw, repeat) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    draw(cv.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(cv); t.anisotropy = 8;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  const wrap = (w, h, x, y, r, fn) => {                    // draw 9 times so shapes wrap across the edges
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h])
      if (x + ox + r >= 0 && x + ox - r <= w && y + oy + r >= 0 && y + oy - r <= h) fn(x + ox, y + oy);
  };
  const radial = (g, x, y, r, stops) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); stops.forEach(([p, c]) => gr.addColorStop(p, c)); return gr; };
  function ground(g, w, h, blobs, craters, rmin, rmax) {
    g.fillStyle = "#8a8a8d"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < blobs; i++) {
      const r = (0.03 + 0.13 * rnd()) * h, dark = rnd() < .6;
      wrap(w, h, rnd() * w, rnd() * h, r, (x, y) => {
        g.fillStyle = radial(g, x, y, r, dark ? [[0, "rgba(52,54,62,.5)"], [1, "rgba(128,128,128,0)"]] : [[0, "rgba(205,204,198,.3)"], [1, "rgba(128,128,128,0)"]]);
        g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      });
    }
    for (let i = 0; i < craters; i++) {                    // floor, then a lit rim on one side and a shaded rim on the other
      const r = rmin + (rmax - rmin) * rnd() ** 3;
      wrap(w, h, rnd() * w, rnd() * h, r * 1.2, (x, y) => {
        g.fillStyle = radial(g, x, y, r, [[0, "rgba(38,38,44,.6)"], [.8, "rgba(58,58,64,.4)"], [1, "rgba(120,120,120,0)"]]);
        g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
        g.lineWidth = Math.max(1, r * .17);
        g.strokeStyle = "rgba(238,236,228,.6)"; g.beginPath(); g.arc(x, y, r * .9, .2 * Math.PI, 1.2 * Math.PI); g.stroke();
        g.strokeStyle = "rgba(22,23,30,.5)"; g.beginPath(); g.arc(x, y, r * .9, 1.2 * Math.PI, 2.2 * Math.PI); g.stroke();
      });
    }
  }
  const glowTex = (inner, outer) => tex(128, 128, (g, w) => { g.fillStyle = radial(g, w / 2, w / 2, w / 2, [[0, inner], [1, outer]]); g.fillRect(0, 0, w, w); });

  function sphereGround(g, w, h) {                           // whole-Moon map: shapes widen toward the poles so they look round on the globe
    g.fillStyle = "#87878a"; g.fillRect(0, 0, w, h);
    const at = (x, y, r, fn) => {
      const sx = 1 / Math.max(.12, Math.cos((.5 - y / h) * Math.PI));
      for (const ox of [-w, 0, w]) { if (x + ox + r * sx < 0 || x + ox - r * sx > w) continue; g.save(); g.translate(x + ox, y); g.scale(sx, 1); fn(); g.restore(); }
    };
    for (let i = 0; i < 520; i++) {
      const r = (.012 + .07 * rnd() ** 2) * h, dark = rnd() < .55;
      at(rnd() * w, rnd() * h, r, () => {
        g.fillStyle = radial(g, 0, 0, r, dark ? [[0, "rgba(46,48,56,.5)"], [1, "rgba(128,128,128,0)"]] : [[0, "rgba(206,205,200,.28)"], [1, "rgba(128,128,128,0)"]]);
        g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
      });
    }
    for (let i = 0; i < 3600; i++) {
      const r = 1.4 + 24 * rnd() ** 4;
      at(rnd() * w, h * (.03 + .94 * rnd()), r, () => {
        g.fillStyle = radial(g, 0, 0, r, [[0, "rgba(40,40,46,.55)"], [.8, "rgba(60,60,66,.35)"], [1, "rgba(120,120,120,0)"]]);
        g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
        g.lineWidth = Math.max(.7, r * .13);
        g.strokeStyle = "rgba(232,230,222,.5)"; g.beginPath(); g.arc(0, 0, r * .92, .2 * Math.PI, 1.2 * Math.PI); g.stroke();
        g.strokeStyle = "rgba(24,25,32,.42)"; g.beginPath(); g.arc(0, 0, r * .92, 1.2 * Math.PI, 2.2 * Math.PI); g.stroke();
      });
    }
    for (let i = 0; i < 26000; i++) { g.fillStyle = rnd() < .5 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.07)"; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd()); }
  }

  // ---- Moon, stars, sun glare, Earth ----
  const moon = new THREE.Group(); scene.add(moon);
  const moonTex = tex(8, 4, g => { g.fillStyle = "#77777a"; g.fillRect(0, 0, 8, 4); });   // stand-in until the photo map arrives
  const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 128),
    new THREE.MeshStandardMaterial({map: moonTex, bumpMap: moonTex, bumpScale: 2.2, roughness: 1, metalness: 0}));
  ball.rotation.x = Math.PI / 2; moon.add(ball);
  {                                                          // the real Moon: NASA LRO colour map and height map (public domain)
    const loader = new THREE.TextureLoader(), big = renderer.capabilities.maxTextureSize >= 4096 && Math.max(innerWidth, innerHeight) >= 900;
    loader.load(big ? "img/moon.jpg" : "img/moon-2k.jpg", t => { t.anisotropy = 8; ball.material.map = t; ball.material.color.setScalar(1.75); ball.material.needsUpdate = true; }, undefined,   // the photo map is dark; lift it
      () => { const t = tex(4096, 2048, sphereGround); ball.material.map = ball.material.bumpMap = t; ball.material.bumpScale = 2.2; ball.material.needsUpdate = true; });   // offline fallback: drawn Moon
    loader.load("img/moon-height.jpg", t => { ball.material.bumpMap = t; ball.material.bumpScale = 42; ball.material.needsUpdate = true; });
  }
  for (const [n, size, lo] of [[5000, 1.2, .35], [350, 2.3, .8]]) {
    const p = new Float32Array(n * 3), c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = V(rnd() - .5, rnd() - .5, rnd() - .5).setLength(1.5e6), b = lo + (1 - lo) * rnd(), warm = rnd();
      p.set([v.x, v.y, v.z], i * 3); c.set([b, b * (.86 + .14 * warm), b * (.72 + .28 * (1 - warm))], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3)); g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({vertexColors: true, size, sizeAttenuation: false})));
  }
  const glare = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex("rgba(255,250,235,1)", "rgba(255,220,160,0)"), blending: THREE.AdditiveBlending, depthWrite: false}));
  glare.scale.setScalar(9e4); scene.add(glare);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(6371, 48, 24), new THREE.MeshLambertMaterial({map: tex(512, 256, (g, w, h) => {
    g.fillStyle = "#1d4f9c"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { g.fillStyle = rnd() < .5 ? "#3d7a4a" : "#8a7a52"; g.beginPath(); g.ellipse(rnd() * w, h * (.15 + .7 * rnd()), 12 + 46 * rnd(), 8 + 26 * rnd(), rnd() * 3, 0, 7); g.fill(); }
    g.fillStyle = "rgba(255,255,255,.75)";
    for (let i = 0; i < 60; i++) { g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 14 + 50 * rnd(), 2 + 7 * rnd(), rnd() * .6 - .3, 0, 7); g.fill(); }
    g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
  })}));
  scene.add(earth);

  // ---- curved ground discs. Three follow the rocket; their textures scroll so the ground stays put. ----
  function disc(radius, mat, lift, order) {
    const NR = radius > 100 ? 80 : 40, NS = radius > 100 ? 360 : 72, pos = [], uv = [], idx = [];
    for (let i = 0; i <= NR; i++) for (let j = 0; j <= NS; j++) {
      const a = (i / NR) * radius / R, p = (j / NS) * 2 * Math.PI;
      pos.push((R + lift) * Math.sin(a) * Math.cos(p), (R + lift) * Math.sin(a) * Math.sin(p), (R + lift) * Math.cos(a) - R);
      uv.push(.5 + .5 * (i / NR) * Math.cos(p), .5 + .5 * (i / NR) * Math.sin(p));
    }
    for (let i = 0; i < NR; i++) for (let j = 0; j < NS; j++) { const a = i * (NS + 1) + j, b = a + NS + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.renderOrder = order; moon.add(m); return m;
  }
  const gridded = (g, w, h) => {
    ground(g, w, h, 70, 260, 3, 34);
    g.strokeStyle = "rgba(255,255,255,.05)"; g.lineWidth = 1;
    for (let i = 0; i < 32; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); }
  };
  // radius (km), the altitudes (km) between which each disc fades out, its lift above the sphere, and (for the
  // widest) the altitudes between which it fades in. Lifts are centimetres so the legs stand on the ground.
  const levels = [[400, 35, 70, .004, [4, 8]], [40, 6, 14, .0002], [4, 1.5, 3.5, .00025], [.4, .15, .35, .0003]].map(([radius, lo, hi, lift, fadeIn], k) => {
    const map = tex(1024, 1024, gridded, true);
    return {radius, lo, hi, fadeIn, mesh: disc(radius, new THREE.MeshStandardMaterial({map, bumpMap: map, bumpScale: radius > 1 ? radius * .01 : 0, roughness: 1, metalness: 0, transparent: true, depthWrite: false}), lift, k + 1)};
  });
  const decal = (radius, map, lift, order) => disc(radius, new THREE.MeshBasicMaterial({map, transparent: true, depthWrite: false}), lift, order);
  const pad = decal(.03, tex(256, 256, (g, w, h) => {
    g.strokeStyle = "rgba(255,180,84,.95)"; g.lineWidth = 6;
    g.beginPath(); g.arc(w / 2, h / 2, w * .3, 0, 7); g.moveTo(w * .1, h / 2); g.lineTo(w * .9, h / 2); g.moveTo(w / 2, h * .1); g.lineTo(w / 2, h * .9); g.stroke();
  }), .00035, 5);
  const shadow = decal(.012, glowTex("rgba(0,0,0,.85)", "rgba(0,0,0,0)"), .0004, 6);      // under the rocket: shows height
  const scorch = decal(.035, glowTex("rgba(12,10,10,.92)", "rgba(20,18,16,0)"), .00035, 6);

  // ---- particles: one small shader, used for exhaust (glowing) and dust (opaque) ----
  const pmat = add => new THREE.ShaderMaterial({
    uniforms: {scale: {value: 1}}, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: "#include <common>\n#include <logdepthbuf_pars_vertex>\nattribute float size; attribute vec4 col; varying vec4 vc; uniform float scale;\n" +
      "void main(){ vc = col; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / max(-mv.z, 1e-5); gl_Position = projectionMatrix * mv;\n#include <logdepthbuf_vertex>\n}",
    fragmentShader: "#include <common>\n#include <logdepthbuf_pars_fragment>\nvarying vec4 vc;\nvoid main(){\n#include <logdepthbuf_fragment>\n" +
      "float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(vc.rgb, vc.a * smoothstep(.5, .12, d)); }"});
  const pools = [];
  function Particles(n, parent, add, axis, grav, grow) {      // axis: which local axis is "up" (for gravity and the floor), or -1
    const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * 4), size = new Float32Array(n);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("col", new THREE.BufferAttribute(col, 4)); g.setAttribute("size", new THREE.BufferAttribute(size, 1));
    const pts = new THREE.Points(g, pmat(add)); pts.frustumCulled = false; pts.renderOrder = 8; parent.add(pts);
    const vel = new Float32Array(n * 3), life = new Float32Array(n), ttl = new Float32Array(n), s0 = new Float32Array(n), a0 = new Float32Array(n);
    let next = 0;
    const P = {
      pts,
      emit(p, v, t, rgb, a, s) { const i = next; next = (next + 1) % n; pos.set(p, i * 3); vel.set(v, i * 3); life[i] = ttl[i] = t; col.set(rgb, i * 4); a0[i] = a; s0[i] = s; },
      clear() { life.fill(0); col.fill(0); g.attributes.col.needsUpdate = true; },
      update(dt) {
        for (let i = 0; i < n; i++) {
          if (life[i] <= 0) continue;
          life[i] -= dt; const f = Math.max(life[i] / ttl[i], 0), j = i * 3;
          if (axis >= 0) vel[j + axis] += grav * dt;
          pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
          if (axis >= 0 && pos[j + axis] < 0) { pos[j + axis] = 0; vel[j + axis] = 0; vel[j] *= .9; vel[j + 1] *= .9; vel[j + 2] *= .9; }
          col[i * 4 + 3] = a0[i] * f; size[i] = s0[i] * (1 + grow * (1 - f));
        }
        g.attributes.position.needsUpdate = g.attributes.col.needsUpdate = g.attributes.size.needsUpdate = true;
      }};
    pools.push(P); return P;
  }

  // ---- rockets (feet at the origin, nose along +Y). Legs fold up in flight and swing down to land. ----
  function makeRocket(ghost) {
    const grp = new THREE.Group(), o = ghost ? {transparent: true, opacity: .38, depthWrite: false} : {};
    const mat = c => new THREE.MeshStandardMaterial({color: ghost ? 0x59c2ff : c, metalness: .15, roughness: .55, ...o});
    const part = (geo, m, y, parent = grp) => { const p = new THREE.Mesh(geo, m); p.position.y = y; parent.add(p); return p; };
    part(new THREE.CylinderGeometry(.0017, .0021, .006, 24), mat(0xeef0f4), .0062);
    part(new THREE.CylinderGeometry(.00212, .00212, .0005, 24), mat(0x20242c), .0046);
    part(new THREE.CylinderGeometry(.00176, .00176, .0004, 24), mat(0xffb454), .0086);
    part(new THREE.ConeGeometry(.0017, .003, 24), mat(0xffb454), .0107);
    part(new THREE.CylinderGeometry(.0008, .0014, .002, 16, 1, true), new THREE.MeshStandardMaterial({color: ghost ? 0x59c2ff : 0x4a4f5a, metalness: .6, roughness: .4, side: THREE.DoubleSide, ...o}), .0022);
    grp.legs = [];
    for (let i = 0; i < 4; i++) {
      const hip = new THREE.Group(), swing = new THREE.Group(), a = i * Math.PI / 2 + Math.PI / 4;
      hip.position.set(Math.cos(a) * .0019, .0047, Math.sin(a) * .0019); hip.rotation.y = -a; hip.add(swing); grp.add(hip);
      part(new THREE.CylinderGeometry(.00017, .00017, .0057), mat(0xa9b1bf), -.00285, swing);
      part(new THREE.CylinderGeometry(.00055, .00055, .00016, 12), mat(0x6b7280), -.0057, swing);
      grp.legs.push(swing);
    }
    grp.setLegs = f => grp.legs.forEach(l => { l.rotation.z = 2.72 + (.62 - 2.72) * f; });      // 0 = folded, 1 = down
    grp.setLegs(1);
    grp.flame = part(new THREE.ConeGeometry(.0011, .008, 14, 1, true),
      new THREE.MeshBasicMaterial({color: ghost ? 0x9bdcff : 0xffe2b0, transparent: true, opacity: ghost ? .4 : .9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false}), 0);
    grp.flame.rotation.x = Math.PI;
    const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
    grp.dot = new THREE.Points(dg, new THREE.PointsMaterial({color: ghost ? 0x59c2ff : 0xffffff, size: ghost ? 6 : 7, sizeAttenuation: false, depthTest: false}));
    scene.add(grp, grp.dot); return grp;
  }
  const rocket = makeRocket(false), ghost = makeRocket(true);
  const lamp = new THREE.PointLight(0xffa550, 0, .14, 2); lamp.position.y = -.003; rocket.add(lamp);   // the engine lights the ground
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex("rgba(255,214,150,1)", "rgba(255,120,30,0)"), blending: THREE.AdditiveBlending, depthWrite: false}));
  glow.position.y = .0006; rocket.add(glow);
  const exhaust = Particles(500, rocket, true, -1, 0, 2.4);
  const fx = new THREE.Group(); moon.add(fx);                 // ground-fixed frame for dust and fire: x east, y north, z up
  const dust = Particles(900, fx, false, 2, -.00162, 3.2), fire = Particles(400, fx, true, 2, -.00162, 1.5);
  const flash = new THREE.PointLight(0xffb060, 0, 1.2, 2); flash.position.z = .01; fx.add(flash);
  function pose(obj, r, d, thr) {
    obj.position.set(r[0] * KM, r[1] * KM, r[2] * KM); if (obj.position.length() < R) obj.position.setLength(R);
    obj.quaternion.setFromUnitVectors(Y, V(d[0], d[1], d[2]).normalize()); obj.dot.position.copy(obj.position);
    obj.flame.visible = thr > .01;
    const len = (.35 + thr) * (.9 + .2 * Math.random()); obj.flame.scale.set(1, len, 1); obj.flame.position.y = .001 - .004 * len;
  }

  // ---- trails ----
  function makeTrail(n, color, opacity) {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({color, transparent: true, opacity})); l.frustumCulled = false; l.count = 0;
    g.setDrawRange(0, 0); scene.add(l); return l;
  }
  const trail = makeTrail(30000, 0xffb454, .9); let ghostTrail = null, lastTrailT = -1e9;
  const orbit = makeTrail(129, 0xffd9a0, .5);                // the path the rocket is on if the engine stays off
  function drawOrbit(s) {
    const P = Physics, hv = P.cross(s.r, s.v), hm2 = P.dot(hv, hv), rm = P.len(s.r);
    const ev = P.add(P.mul(P.cross(s.v, hv), 1 / P.MU), s.r, -1 / rm), e = P.len(ev);
    orbit.visible = hm2 > 2e16 && e < .97 && !wrecked;
    if (!orbit.visible) return;
    const sl = hm2 / P.MU, a1 = e > 1e-4 ? P.mul(ev, 1 / e) : P.mul(s.r, 1 / rm), a2 = P.unit(P.cross(hv, a1));
    for (let i = 0; i <= 128; i++) { const th = i / 128 * 6.283185307, r = sl / (1 + e * Math.cos(th)); put(orbit, i, P.add(P.mul(a1, r * Math.cos(th)), a2, r * Math.sin(th))); }
    orbit.geometry.setDrawRange(0, 129);
  }
  // the home screen: a slow fly-around of the Moon with nothing else in the scene
  function attract(t) {
    [rocket, rocket.dot, ghost, ghost.dot, trail, ghostTrail, shadow, pad, scorch, orbit, fx, ...levels.map(L => L.mesh)].forEach(o => { if (o) o.visible = false; });
    const a = t * .03;
    moon.rotation.z = t * .012;
    sun.position.set(Math.cos(a - .55), Math.sin(a - .55), .3).normalize(); glare.position.copy(sun.position).multiplyScalar(1.4e6); earth.position.set(-2.6e5, 2.4e5, 1.3e5);
    camera.position.set(Math.cos(a) * 4300, Math.sin(a) * 4300, 900); camera.up.copy(Z);
    camera.lookAt(tgt.set(Math.sin(a) * 1100, -Math.cos(a) * 1100, 0));      // look to one side so the Moon sits on the right
    renderer.render(scene, camera);
  }
  const put = (line, i, r) => { const a = line.geometry.attributes.position; a.setXYZ(i, r[0] * KM, r[1] * KM, r[2] * KM); a.needsUpdate = true; };

  const cam = {mode: "follow", az: .9, el: .28, zoom: 1, whole: 5200}, map = {on: false, rect: [0, 0, 0, 0]};
  const up = V(), east = V(), north = V(), tgt = V(), dirM = V(), basis = new THREE.Matrix4(), tmp = V(), start = {p: V(1, 0, 0), n: V(0, 0, 1)};
  let anchor = null, shake = 0, squash = 0, wrecked = false;

  function setMission(st, rows) {
    const p = start.p.set(...st.r).normalize(), side = V().crossVectors(p, Z).normalize();
    start.n.set(...st.nrm);
    sun.position.copy(p).addScaledVector(side, .9).addScaledVector(Z, .3).normalize();
    glare.position.copy(sun.position).multiplyScalar(1.4e6);
    earth.position.copy(p).multiplyScalar(.45).addScaledVector(side, -.75).addScaledVector(Z, .48).normalize().multiplyScalar(384400);
    pad.visible = st.onPad; pad.position.copy(p).multiplyScalar(R); pad.quaternion.setFromUnitVectors(Z, p);
    trail.count = 0; trail.geometry.setDrawRange(0, 0); lastTrailT = -1e9;
    if (ghostTrail) scene.remove(ghostTrail);
    ghostTrail = makeTrail(rows.length, 0x59c2ff, .45);
    rows.forEach((r, i) => put(ghostTrail, i, [r[1], r[2], r[3]]));
    pools.forEach(P => P.clear()); anchor = null; shake = squash = 0; wrecked = false; scorch.visible = false; flash.intensity = 0;
    cam.zoom = 1; cam.mode = "follow"; trail.visible = fx.visible = true;
  }

  // s: physics state, q: derived values, g: ghost pose or null, f: {dt, legs 0..1, event: "landed" | "crashed" | null}
  function update(s, q, g, f) {
    const hk = Math.max(0, q.h) * KM, dt = f.dt, thr = wrecked ? 0 : s.thr, rr = Math.random;
    moon.rotation.z = OMEGA * s.t;
    let dist;
    if (cam.mode === "follow") {
      up.set(...q.er); east.crossVectors(Z, up); if (east.lengthSq() < 1e-6) east.set(1, 0, 0); east.normalize();
      north.crossVectors(up, east); dist = Math.max(.03, cam.zoom * (.06 + .15 * hk));
    } else { up.copy(Z); east.set(1, 0, 0); north.set(0, 1, 0); dist = cam.whole; }
    pose(rocket, s.r, s.d, thr);
    rocket.setLegs(f.legs); drawOrbit(s);
    squash = Math.max(0, squash - dt); rocket.scale.y = 1 - .07 * Math.sin(Math.PI * squash / .45);
    rocket.visible = dist < 6 && !wrecked; rocket.dot.visible = dist > 1.5;
    lamp.intensity = thr * (.85 + .25 * rr()); glow.visible = thr > .01; glow.scale.setScalar(.004 + .009 * thr);
    if (s.t - lastTrailT >= (hk < 2 ? .5 : 2) && trail.count < 30000) { put(trail, trail.count++, s.r); trail.geometry.setDrawRange(0, trail.count); lastTrailT = s.t; }
    ghost.dot.visible = !!g && g.visible;
    if (g) { pose(ghost, g.r, g.d, g.thr); ghost.visible = g.visible && dist < 6; ghostTrail.geometry.setDrawRange(0, g.i + 2); } else ghost.visible = false;

    // ground detail follows the rocket; texture offset = distance travelled east / north, so craters stay fixed
    dirM.copy(rocket.position).normalize().applyAxisAngle(Z, -OMEGA * s.t);
    const lat = Math.asin(dirM.z), lon = Math.atan2(dirM.y, dirM.x);
    const e = V(-Math.sin(lon), Math.cos(lon), 0), n = V().crossVectors(dirM, e);
    basis.makeBasis(e, n, dirM);
    const view = hk + dist * .5;                             // roughly the camera height: zooming out fades the detail too
    for (const L of levels) {
      let o = Math.max(0, Math.min(1, (L.hi - view) / (L.hi - L.lo)));
      if (L.fadeIn) o = Math.min(o, Math.max(0, Math.min(1, (hk - L.fadeIn[0]) / (L.fadeIn[1] - L.fadeIn[0]))));
      L.mesh.visible = o > 0; if (!o) continue;
      L.mesh.material.opacity = o; L.mesh.position.copy(dirM).multiplyScalar(R); L.mesh.quaternion.setFromRotationMatrix(basis);
      L.mesh.material.map.offset.set((lon * R * Math.cos(lat) / (2 * L.radius)) % 1, (lat * R / (2 * L.radius)) % 1);
    }
    shadow.visible = hk < .4 && !wrecked;
    if (shadow.visible) {
      shadow.position.copy(dirM).multiplyScalar(R); shadow.quaternion.setFromRotationMatrix(basis);
      shadow.scale.setScalar(1 + hk * 22); shadow.material.opacity = .75 * (1 - hk / .4);
    }

    // effects
    const hot = [1, .62 + .2 * rr(), .25], grey = [.74, .73, .7];
    for (let k = thr > .01 ? Math.min(40, Math.round(thr * dt * 520 + rr())) : 0; k > 0; k--)
      exhaust.emit([(rr() - .5) * .0008, .0008, (rr() - .5) * .0008], [(rr() - .5) * .012, -.045 - rr() * .03, (rr() - .5) * .012],
        Math.min(.22 + rr() * .2, hk / .05 + .03), hot, .55, .0016);
    if (hk < .3) {
      if (!anchor || anchor.d.distanceTo(dirM) * R > .25) {
        anchor = {d: dirM.clone(), e: e.clone(), n: n.clone()}; dust.clear(); fire.clear();
        fx.position.copy(dirM).multiplyScalar(R + .0002);   // dust sits on the true surface fx.quaternion.setFromRotationMatrix(basis);
      }
      tmp.copy(dirM).sub(anchor.d).multiplyScalar(R);
      const lx = tmp.dot(anchor.e), ly = tmp.dot(anchor.n);
      const burst = (P, count, lo, hi, vz, life, rgb, a, size) => {
        for (let k = 0; k < count; k++) {
          const ang = rr() * 6.283, sp = lo + rr() * (hi - lo);
          P.emit([lx + Math.cos(ang) * .002, ly + Math.sin(ang) * .002, 0], [Math.cos(ang) * sp, Math.sin(ang) * sp, vz * (.3 + rr())], life * (.6 + .8 * rr()), rgb, a, size);
        }
      };
      if (thr > .05 && hk < .07) burst(dust, Math.round(thr * dt * 260 * (1 - hk / .07) + rr()), .01, .045 * (.5 + thr), .009, 1.8, grey, .26, .003);
      if (f.event === "landed") { burst(dust, 160, .012, .05, .004, 2.4, grey, .32, .0035); shake = .0007; squash = .45; }
      if (f.event === "crashed") {
        burst(fire, 260, .004, .075, .05, 1.2, [1, .55, .16], .95, .0045); burst(dust, 420, .008, .09, .03, 3.2, grey, .4, .005);
        flash.position.set(lx, ly, .01); flash.intensity = 16; shake = .005; wrecked = true;
        scorch.visible = true; scorch.position.copy(dirM).multiplyScalar(R); scorch.quaternion.setFromRotationMatrix(basis);
      }
      shake = Math.max(shake, thr * (hk < .05 ? .00012 : 0));
    }
    flash.intensity *= Math.exp(-3.5 * dt); shake *= Math.exp(-5 * dt);
    pools.forEach(P => { P.pts.material.uniforms.scale.value = renderer.getPixelRatio() * innerHeight / .9326; P.update(dt); });

    if (cam.mode === "follow") tgt.copy(rocket.position).addScaledVector(up, .006); else tgt.set(0, 0, 0);
    camera.position.copy(tgt).addScaledVector(up, Math.sin(cam.el) * dist)
      .addScaledVector(east, Math.cos(cam.el) * Math.cos(cam.az) * dist).addScaledVector(north, Math.cos(cam.el) * Math.sin(cam.az) * dist);
    if (shake > 1e-6) camera.position.add(tmp.set(rr() - .5, rr() - .5, rr() - .5).multiplyScalar(shake * 2));
    camera.up.copy(up); camera.lookAt(tgt);
    renderer.render(scene, camera);

    if (map.on) {                                             // 3D map: the whole Moon from above the flight plane, in a corner
      const [x, y, w, h] = map.rect, vis = [rocket.visible, ghost.visible];
      mapCam.aspect = w / h; mapCam.updateProjectionMatrix();
      mapCam.position.copy(start.n).multiplyScalar(.82).addScaledVector(start.p, .57).normalize().multiplyScalar(6400);
      mapCam.up.copy(start.p); mapCam.lookAt(0, 0, 0);
      rocket.visible = ghost.visible = false; rocket.dot.visible = true; ghost.dot.visible = !!g && g.visible;
      renderer.setScissorTest(true); renderer.setScissor(x, innerHeight - y - h, w, h); renderer.setViewport(x, innerHeight - y - h, w, h);
      renderer.render(scene, mapCam);
      renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
      [rocket.visible, ghost.visible] = vis;
    }
  }

  // where a point (metres) lands on screen: {x, y, front}
  function project(r) {
    tmp.set(r[0] * KM, r[1] * KM, r[2] * KM);
    const front = tmp.clone().applyMatrix4(camera.matrixWorldInverse).z < 0;
    tmp.project(camera);
    return {x: (tmp.x + 1) / 2 * innerWidth, y: (1 - tmp.y) / 2 * innerHeight, front};
  }

  // drag to look around, wheel to zoom
  const el = renderer.domElement; let drag = null;
  el.onpointerdown = ev => { drag = [ev.clientX, ev.clientY]; el.setPointerCapture(ev.pointerId); };
  el.onpointerup = el.onpointercancel = () => { drag = null; };
  el.onpointermove = ev => {
    if (!drag) return;
    cam.az -= (ev.clientX - drag[0]) * .006; cam.el = Math.max(-.15, Math.min(1.5, cam.el + (ev.clientY - drag[1]) * .006));
    drag = [ev.clientX, ev.clientY];
  };
  const zoom = k => { if (cam.mode === "follow") cam.zoom = Math.max(.004, Math.min(4000, cam.zoom * k)); else cam.whole = Math.max(2300, Math.min(30000, cam.whole * k)); };
  el.addEventListener("wheel", ev => { ev.preventDefault(); zoom(Math.exp(ev.deltaY * .0012)); }, {passive: false});
  function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  addEventListener("resize", resize); resize();

  return {setMission, update, attract, project, cam, map, zoom};
})();
