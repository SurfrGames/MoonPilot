// The 3D world: Moon, stars, ground detail that follows the rocket, the player's rocket and the AI ghost.
// Scene units are kilometres; physics hands us metres.
const World = (() => {
  const R = 1737.4, KM = 1e-3, OMEGA = 2.6617e-6;
  const V = (x, y, z) => new THREE.Vector3(x, y, z), Z = V(0, 0, 1), Y = V(0, 1, 0);
  const renderer = new THREE.WebGLRenderer({antialias: true, logarithmicDepthBuffer: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1, 0.002, 1e6);
  scene.add(new THREE.AmbientLight(0x9aa8c8, .45));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2); scene.add(sun);

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
  function blob(g, w, h, x, y, r, stops) {                 // drawn 9 times so it wraps across the edges
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      if (x + ox + r < 0 || x + ox - r > w || y + oy + r < 0 || y + oy - r > h) continue;
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      stops.forEach(([p, c]) => gr.addColorStop(p, c));
      g.fillStyle = gr; g.beginPath(); g.arc(x + ox, y + oy, r, 0, 7); g.fill();
    }
  }
  function ground(g, w, h, blobs, craters, rmin, rmax) {
    g.fillStyle = "#8d8d8f"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < blobs; i++) blob(g, w, h, rnd() * w, rnd() * h, (0.03 + 0.12 * rnd()) * h,
      rnd() < .6 ? [[0, "rgba(70,72,78,.35)"], [1, "rgba(128,128,128,0)"]] : [[0, "rgba(190,190,186,.25)"], [1, "rgba(128,128,128,0)"]]);
    for (let i = 0; i < craters; i++) blob(g, w, h, rnd() * w, rnd() * h, rmin + (rmax - rmin) * rnd() ** 3,
      [[0, "rgba(40,40,44,.55)"], [.75, "rgba(60,60,64,.35)"], [.9, "rgba(225,225,220,.5)"], [1, "rgba(150,150,150,0)"]]);
  }

  // ---- Moon and stars ----
  const moon = new THREE.Group(); scene.add(moon);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 128),
    new THREE.MeshLambertMaterial({map: tex(2048, 1024, (g, w, h) => ground(g, w, h, 260, 900, 2, 26))}));
  ball.rotation.x = Math.PI / 2; moon.add(ball);
  {
    const p = new Float32Array(6000);
    for (let i = 0; i < 2000; i++) { const v = V(rnd() - .5, rnd() - .5, rnd() - .5).setLength(4e5); p.set([v.x, v.y, v.z], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({color: 0xffffff, size: 1.4, sizeAttenuation: false})));
  }

  // ---- curved ground discs. Three follow the rocket; their textures scroll so the ground stays put. ----
  function disc(radius, map, lift, order) {
    const NR = 40, NS = 72, pos = [], uv = [], idx = [];
    for (let i = 0; i <= NR; i++) for (let j = 0; j <= NS; j++) {
      const a = (i / NR) * radius / R, p = (j / NS) * 2 * Math.PI;
      pos.push((R + lift) * Math.sin(a) * Math.cos(p), (R + lift) * Math.sin(a) * Math.sin(p), (R + lift) * Math.cos(a) - R);
      uv.push(.5 + .5 * (i / NR) * Math.cos(p), .5 + .5 * (i / NR) * Math.sin(p));
    }
    for (let i = 0; i < NR; i++) for (let j = 0; j < NS; j++) { const a = i * (NS + 1) + j, b = a + NS + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({map, transparent: true, depthWrite: false}));
    m.renderOrder = order; moon.add(m); return m;
  }
  const gridded = (g, w, h) => {
    ground(g, w, h, 60, 240, 3, 34);
    g.strokeStyle = "rgba(255,255,255,.06)"; g.lineWidth = 1;
    for (let i = 0; i < 32; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); }
  };
  // radius (km), and the altitudes (km) between which each disc fades out
  const levels = [[40, 6, 14, .004], [4, 1.5, 3.5, .0043], [.4, .15, .35, .0046]].map(([radius, lo, hi, lift], k) =>
    ({radius, lo, hi, mesh: disc(radius, tex(1024, 1024, gridded, true), lift, k + 1)}));
  const pad = disc(.03, tex(256, 256, (g, w, h) => {
    g.strokeStyle = "rgba(255,180,84,.95)"; g.lineWidth = 6;
    g.beginPath(); g.arc(w / 2, h / 2, w * .3, 0, 7); g.moveTo(w * .1, h / 2); g.lineTo(w * .9, h / 2); g.moveTo(w / 2, h * .1); g.lineTo(w / 2, h * .9); g.stroke();
  }), .0049, 4);

  // ---- rockets (feet at the origin, nose along +Y) ----
  function makeRocket(ghost) {
    const grp = new THREE.Group(), o = ghost ? {transparent: true, opacity: .38, depthWrite: false} : {};
    const mat = c => new THREE.MeshStandardMaterial({color: ghost ? 0x59c2ff : c, metalness: 0, roughness: .7, ...o});
    const part = (geo, m, y) => { const p = new THREE.Mesh(geo, m); p.position.y = y; grp.add(p); return p; };
    part(new THREE.CylinderGeometry(.0017, .0021, .006, 20), mat(0xe8ebf0), .0058);
    part(new THREE.ConeGeometry(.0017, .003, 20), mat(0xffb454), .0103);
    part(new THREE.CylinderGeometry(.0008, .0014, .002, 16, 1, true), mat(0x555b66), .0018);
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(.00016, .00016, .0052), mat(0x9aa3b2)), a = i * Math.PI / 2 + Math.PI / 4;
      leg.position.set(Math.cos(a) * .0027, .0021, Math.sin(a) * .0027); leg.rotation.set(Math.sin(a) * .62, 0, -Math.cos(a) * .62); grp.add(leg);
    }
    grp.flame = part(new THREE.ConeGeometry(.0011, .008, 14, 1, true),
      new THREE.MeshBasicMaterial({color: ghost ? 0x9bdcff : 0xffd9a0, transparent: true, opacity: ghost ? .4 : .85, side: THREE.DoubleSide}), 0);
    grp.flame.rotation.x = Math.PI;
    const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
    grp.dot = new THREE.Points(dg, new THREE.PointsMaterial({color: ghost ? 0x59c2ff : 0xffffff, size: ghost ? 5 : 7, sizeAttenuation: false, depthTest: false}));
    scene.add(grp, grp.dot); return grp;
  }
  const rocket = makeRocket(false), ghost = makeRocket(true);
  function pose(obj, r, d, thr, dist) {
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
  const trail = makeTrail(30000, 0xffb454, .9); let ghostTrail = null, ghostRows = null, lastTrailT = -1e9;
  const put = (line, i, r) => { const a = line.geometry.attributes.position; a.setXYZ(i, r[0] * KM, r[1] * KM, r[2] * KM); a.needsUpdate = true; };

  const cam = {mode: "follow", az: .9, el: .28, zoom: 1, whole: 5200};
  const up = V(), east = V(), north = V(), tgt = V(), dirM = V(), basis = new THREE.Matrix4();

  function setMission(start, rows) {
    const p = V(...start.r).normalize();
    sun.position.copy(p).addScaledVector(V().crossVectors(p, Z).normalize(), .9).addScaledVector(Z, .3);
    pad.visible = start.onPad; pad.position.copy(p).multiplyScalar(R); pad.quaternion.setFromUnitVectors(Z, p);
    trail.count = 0; trail.geometry.setDrawRange(0, 0); lastTrailT = -1e9;
    if (ghostTrail) scene.remove(ghostTrail);
    ghostRows = rows; ghostTrail = makeTrail(rows.length, 0x59c2ff, .45);
    rows.forEach((r, i) => put(ghostTrail, i, [r[1], r[2], r[3]]));
    cam.zoom = 1; cam.mode = "follow";
  }

  // s: physics state, q: derived values, g: ghost pose {r, d, thr, i, visible} or null
  function update(s, q, g) {
    const hk = Math.max(0, q.h) * KM;
    moon.rotation.z = OMEGA * s.t;
    let dist;
    if (cam.mode === "follow") {
      up.set(...q.er); east.crossVectors(Z, up); if (east.lengthSq() < 1e-6) east.set(1, 0, 0); east.normalize();
      north.crossVectors(up, east); dist = cam.zoom * (.06 + .15 * hk);
    } else { up.copy(Z); east.set(1, 0, 0); north.set(0, 1, 0); dist = cam.whole; }
    pose(rocket, s.r, s.d, s.thr, dist);
    rocket.visible = dist < 6; rocket.dot.visible = dist > 1.5;
    if (s.t - lastTrailT >= (hk < 2 ? .5 : 2) && trail.count < 30000) { put(trail, trail.count++, s.r); trail.geometry.setDrawRange(0, trail.count); lastTrailT = s.t; }
    ghost.visible = ghost.dot.visible = !!g && g.visible;
    if (g) { pose(ghost, g.r, g.d, g.thr, dist); ghost.visible = g.visible && dist < 6; ghostTrail.geometry.setDrawRange(0, g.i + 2); }

    // ground detail follows the rocket; texture offset = distance travelled east / north, so craters stay fixed
    dirM.copy(rocket.position).normalize().applyAxisAngle(Z, -OMEGA * s.t);
    const lat = Math.asin(dirM.z), lon = Math.atan2(dirM.y, dirM.x);
    const e = V(-Math.sin(lon), Math.cos(lon), 0), n = V().crossVectors(dirM, e);
    basis.makeBasis(e, n, dirM);
    for (const L of levels) {
      const o = Math.max(0, Math.min(1, (L.hi - hk) / (L.hi - L.lo)));
      L.mesh.visible = o > 0; if (!o) continue;
      L.mesh.material.opacity = o; L.mesh.position.copy(dirM).multiplyScalar(R); L.mesh.quaternion.setFromRotationMatrix(basis);
      L.mesh.material.map.offset.set((lon * R * Math.cos(lat) / (2 * L.radius)) % 1, (lat * R / (2 * L.radius)) % 1);
    }

    if (cam.mode === "follow") tgt.copy(rocket.position).addScaledVector(up, .006); else tgt.set(0, 0, 0);
    camera.position.copy(tgt).addScaledVector(up, Math.sin(cam.el) * dist)
      .addScaledVector(east, Math.cos(cam.el) * Math.cos(cam.az) * dist).addScaledVector(north, Math.cos(cam.el) * Math.sin(cam.az) * dist);
    camera.up.copy(up); camera.lookAt(tgt);
    renderer.render(scene, camera);
  }

  // drag to look around, wheel or pinch-free scroll to zoom
  const el = renderer.domElement; let drag = null;
  el.onpointerdown = ev => { drag = [ev.clientX, ev.clientY]; el.setPointerCapture(ev.pointerId); };
  el.onpointerup = el.onpointercancel = () => { drag = null; };
  el.onpointermove = ev => {
    if (!drag) return;
    cam.az -= (ev.clientX - drag[0]) * .006; cam.el = Math.max(-.15, Math.min(1.5, cam.el + (ev.clientY - drag[1]) * .006));
    drag = [ev.clientX, ev.clientY];
  };
  const zoom = k => { if (cam.mode === "follow") cam.zoom = Math.max(.25, Math.min(400, cam.zoom * k)); else cam.whole = Math.max(2300, Math.min(30000, cam.whole * k)); };
  el.addEventListener("wheel", ev => { ev.preventDefault(); zoom(Math.exp(ev.deltaY * .0012)); }, {passive: false});
  function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  addEventListener("resize", resize); resize();

  return {setMission, update, cam, zoom};
})();
