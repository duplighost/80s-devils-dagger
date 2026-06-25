import * as THREE from 'three';
import { HEX, COL } from './palette.js';

// ============================================================================
// The synthwave world: infinite neon grid, banded retro sun, star sky,
// wireframe mountains and the floating arena pad the player fights on.
// Everything distant is fog-exempt so the sun/sky stay vivid; gameplay objects
// and the grid get the FogExp2 haze for depth.
// ============================================================================

export const ARENA_RADIUS = 17.5;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.mats = [];           // shader materials needing uTime
    this.beat = 0;            // 0..1 pulse driven by audio
    this.intensity = 0;       // 0..1 escalation, brightens the world

    this._buildLights();
    this._buildSky();
    this._buildSun();
    this._buildMountains();
    this._buildGrid();
    this._buildArena();
    this._buildAtmosphere();
  }

  // --------------------------------------------------------------- lights
  _buildLights() {
    // Low hemisphere fill tinted purple/cyan so non-emissive geometry reads.
    const hemi = new THREE.HemisphereLight(HEX.violet, HEX.hot, 0.55);
    this.scene.add(hemi);
    const amb = new THREE.AmbientLight(0x2a0a4a, 0.6);
    this.scene.add(amb);
    // Key light from the sun direction for subtle form on enemies.
    const key = new THREE.DirectionalLight(HEX.pink, 0.8);
    key.position.set(0, 20, -120);
    this.scene.add(key);
    // A travelling magenta rim light opposite the sun.
    const rim = new THREE.DirectionalLight(HEX.cyan, 0.5);
    rim.position.set(40, 14, 60);
    this.scene.add(rim);
    // Pulsing pad glow under the player.
    this.padLight = new THREE.PointLight(HEX.pink, 6, 50, 2.0);
    this.padLight.position.set(0, 2.4, 0);
    this.scene.add(this.padLight);
  }

  // --------------------------------------------------------------- sky dome
  _buildSky() {
    const geo = new THREE.SphereGeometry(480, 48, 24);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uTop: { value: new THREE.Color(0x12002e) },
        uMid: { value: new THREE.Color(0x52007a) },
        uHorizon: { value: new THREE.Color(HEX.hot) },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec3 vDir;
        uniform vec3 uTop, uMid, uHorizon;
        uniform float uTime;
        float hash(vec2 p){ p=fract(p*vec2(443.8975,397.2973)); p+=dot(p,p+19.19); return fract(p.x*p.y); }
        void main(){
          float h = clamp(vDir.y, -0.1, 1.0);
          vec3 col = mix(uMid, uTop, smoothstep(0.0, 0.7, h));
          // horizon afterglow
          float glow = smoothstep(0.32, 0.0, abs(h - 0.02));
          col += uHorizon * pow(glow, 1.8) * 0.4;
          // stars in the upper hemisphere
          if (h > 0.04){
            vec2 sp = vec2(atan(vDir.z, vDir.x)*12.0, h*40.0);
            vec2 cell = floor(sp);
            float n = hash(cell);
            float star = step(0.984, n);
            float tw = 0.6 + 0.4*sin(uTime*3.0 + n*40.0);
            float d = length(fract(sp)-0.5);
            col += star * smoothstep(0.12,0.0,d) * tw * vec3(0.8,0.9,1.0) * h;
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.scene.add(new THREE.Mesh(geo, mat));
    this.mats.push(mat);
  }

  // --------------------------------------------------------------- retro sun
  _buildSun() {
    const geo = new THREE.PlaneGeometry(220, 220);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uTop: { value: new THREE.Color(HEX.amber) },
        uMid: { value: new THREE.Color(HEX.orange) },
        uBot: { value: new THREE.Color(HEX.hot) },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec2 vUv;
        uniform vec3 uTop, uMid, uBot;
        uniform float uTime;
        void main(){
          vec2 p = vUv*2.0 - 1.0;
          float r = length(p);
          float disc = smoothstep(1.0, 0.985, r);
          if (disc <= 0.0) discard;
          float y = vUv.y;                       // 0 bottom .. 1 top
          vec3 col = mix(uBot, uMid, smoothstep(0.0,0.5,y));
          col = mix(col, uTop, smoothstep(0.45,1.0,y));
          // retro horizontal bands across the lower half
          if (y < 0.52){
            float f = (0.52 - y)/0.52;            // 0 at midline .. 1 at bottom
            float duty = mix(0.92, 0.18, f);      // bands thin out downward
            float band = step(1.0 - duty, fract((y)*26.0 + 0.5));
            col *= band;
          }
          gl_FragColor = vec4(col, disc);
        }`,
    });
    const sun = new THREE.Mesh(geo, mat);
    sun.position.set(0, 60, -360);
    this.scene.add(sun);
    this.mats.push(mat);

    // faint halo plane behind for extra bloom bleed
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(360, 360),
      new THREE.MeshBasicMaterial({
        color: HEX.hot, transparent: true, opacity: 0.06,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        map: this._radialTex(),
      })
    );
    halo.position.set(0, 60, -362);
    this.scene.add(halo);
  }

  _radialTex() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,120,200,0.5)');
    g.addColorStop(1, 'rgba(255,120,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // --------------------------------------------------------------- mountains
  _buildMountains() {
    // Two concentric wireframe ridge rings — classic synthwave terrain.
    const make = (radius, height, color, segs, seed) => {
      const geo = new THREE.CylinderGeometry(radius, radius, height, segs, 4, true);
      const pos = geo.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const ang = Math.atan2(v.z, v.x);
        const yt = (v.y + height / 2) / height; // 0 base .. 1 top
        // layered sine ridges -> jagged peaks, only push the upper rows up/in
        const ridge =
          Math.sin(ang * 7 + seed) * 0.5 +
          Math.sin(ang * 13 + seed * 2.1) * 0.3 +
          Math.sin(ang * 23 + seed * 4.7) * 0.2;
        const peak = Math.max(0, ridge) * height * 0.5 * yt;
        v.y = -10 + (v.y + height / 2) + peak * yt;
        const rr = radius + peak * 0.4;
        const a = Math.atan2(v.z, v.x);
        v.x = Math.cos(a) * rr;
        v.z = Math.sin(a) * rr;
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      const mat = new THREE.MeshBasicMaterial({ color, wireframe: true, fog: true, transparent: true, opacity: 0.85 });
      return new THREE.Mesh(geo, mat);
    };
    this.scene.add(make(230, 70, HEX.violet, 70, 1.3));
    this.scene.add(make(180, 52, HEX.cyan, 80, 4.9));
  }

  // --------------------------------------------------------------- grid floor
  _buildGrid() {
    const geo = new THREE.PlaneGeometry(1200, 1200, 1, 1);
    this.gridMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false, // does its own exponential distance fade
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColA: { value: new THREE.Color(HEX.cyan) },
        uColB: { value: new THREE.Color(HEX.pink) },
        uIntensity: { value: 0 },
        fogColor: { value: new THREE.Color(HEX.fog) },
        fogDensity: { value: 0.0 },
      },
      vertexShader: /* glsl */`
        varying vec3 vWorld;
        void main(){
          vec4 wp = modelMatrix * vec4(position,1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec3 vWorld;
        uniform float uTime, uIntensity;
        uniform vec3 uColA, uColB;
        float gridLine(vec2 coord, float cell){
          vec2 c = coord / cell;
          vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
          return 1.0 - min(min(g.x, g.y), 1.0);
        }
        void main(){
          vec2 p = vWorld.xz;
          p.y += uTime * 6.0;                 // scroll toward the horizon
          float fine = gridLine(p, 4.0);
          float coarse = gridLine(p, 16.0);
          vec3 col = uColA * fine * 0.8 + uColB * coarse * 1.1;
          // distance fade
          float d = length(vWorld.xz);
          float fade = exp(-d * 0.0045);
          // brighten with escalation
          col *= (0.7 + uIntensity * 0.9);
          float a = (fine*0.8 + coarse) * fade;
          if (a < 0.003) discard;
          gl_FragColor = vec4(col * fade, a);
        }`,
      extensions: { derivatives: true },
    });
    const grid = new THREE.Mesh(geo, this.gridMat);
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = -10;
    this.scene.add(grid);
    this.mats.push(this.gridMat);
  }

  // --------------------------------------------------------------- arena pad
  _buildArena() {
    // Floating disc the player fights on: dark polar-grid surface + neon rim.
    const geo = new THREE.CircleGeometry(ARENA_RADIUS, 96);
    this.arenaMat = new THREE.ShaderMaterial({
      transparent: true,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uBeat: { value: 0 },
        uColA: { value: new THREE.Color(HEX.cyan) },
        uColB: { value: new THREE.Color(HEX.hot) },
        fogColor: { value: new THREE.Color(HEX.fog) },
        fogDensity: { value: 0.0 },
      },
      vertexShader: /* glsl */`
        varying vec2 vP;
        void main(){
          vP = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec2 vP;
        uniform float uTime, uBeat;
        uniform vec3 uColA, uColB;
        void main(){
          float R = ${ARENA_RADIUS.toFixed(1)};
          float r = length(vP);
          float ang = atan(vP.y, vP.x);
          // concentric rings
          float rings = abs(fract(r * 0.5 - uTime * 0.15) - 0.5);
          rings = 1.0 - smoothstep(0.0, 0.06, rings);
          // radial spokes
          float spokes = abs(fract(ang / 6.2831853 * 24.0) - 0.5);
          spokes = 1.0 - smoothstep(0.0, 0.08, spokes);
          float lines = max(rings * 0.6, spokes * 0.35);
          vec3 base = vec3(0.04, 0.0, 0.09);
          vec3 col = base + uColA * lines * (0.5 + r / R * 0.5);
          // bright pulsing rim
          float rim = smoothstep(R - 0.9, R - 0.1, r);
          col += uColB * rim * (1.6 + uBeat * 1.4);
          // central glow
          col += uColB * smoothstep(2.5, 0.0, r) * 0.25;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const disc = new THREE.Mesh(geo, this.arenaMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.0;
    this.scene.add(disc);
    this.mats.push(this.arenaMat);

    // glowing rim torus for a crisp emissive edge
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(ARENA_RADIUS, 0.16, 8, 120),
      new THREE.MeshBasicMaterial({ color: HEX.hot, fog: true })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.05;
    this.scene.add(rim);
    this.rim = rim;

    // thin under-glow skirt so the pad reads as floating
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS * 0.82, 1.6, 96, 1, true),
      new THREE.MeshBasicMaterial({
        color: HEX.violet, transparent: true, opacity: 0.3,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      })
    );
    skirt.position.y = -0.8;
    this.scene.add(skirt);
  }

  // --------------------------------------------------------------- atmosphere
  _buildAtmosphere() {
    // Drifting embers/dust motes around the arena for depth + motion.
    const N = 220;
    const pos = new Float32Array(N * 3);
    const spd = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 40;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.random() * 30 - 6;
      pos[i * 3 + 2] = Math.sin(a) * r;
      spd[i] = 0.4 + Math.random() * 1.2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSpd', new THREE.BufferAttribute(spd, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(HEX.ice) } },
      vertexShader: /* glsl */`
        attribute float aSpd;
        uniform float uTime;
        varying float vA;
        void main(){
          vec3 p = position;
          p.y = mod(p.y + uTime * aSpd + 10.0, 36.0) - 6.0;
          vA = 0.4 + 0.6 * sin(uTime * aSpd * 2.0 + p.x);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (2.0 + aSpd) * (60.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        precision mediump float;
        uniform vec3 uColor;
        varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * vA * 0.6;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.mats.push(mat);
    this.motes = mat;
  }

  // --------------------------------------------------------------- update
  update(dt, time, intensity = 0, beat = 0) {
    this.intensity = intensity;
    this.beat = beat;
    for (const m of this.mats) if (m.uniforms.uTime) m.uniforms.uTime.value = time;
    if (this.gridMat) this.gridMat.uniforms.uIntensity.value = intensity;
    if (this.arenaMat) this.arenaMat.uniforms.uBeat.value = beat;
    // pad light + rim pulse to the beat and escalation
    const pulse = 0.6 + beat * 0.9 + intensity * 0.5;
    this.padLight.intensity = 5 * pulse;
    this.padLight.color.set(intensity > 0.6 ? HEX.hot : HEX.pink);
    if (this.rim) this.rim.material.color.setHSL(0.92 - intensity * 0.06, 1.0, 0.5 + beat * 0.18);
  }
}
