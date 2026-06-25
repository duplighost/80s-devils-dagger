import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CRTShader } from './postfx.js';
import { HEX } from './palette.js';

// Owns the WebGL renderer, scene, camera and the full post pipeline:
//   scene -> bloom (neon glow) -> tonemap/sRGB -> CRT/VHS final pass.
export class Stage {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(HEX.fog);
    // Exponential fog dissolves the arena edges into the synth haze.
    this.scene.fog = new THREE.FogExp2(HEX.fog, 0.0145);

    this.camera = new THREE.PerspectiveCamera(82, innerWidth / innerHeight, 0.1, 600);
    this.camera.position.set(0, 1.7, 0);

    // ---- post pipeline ----
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.composer.setSize(innerWidth, innerHeight);

    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(innerWidth, innerHeight),
      0.62,  // strength
      0.6,   // radius
      0.32   // threshold — only true neon blooms, midtones stay crisp
    );
    this.composer.addPass(this.bloom);

    this.composer.addPass(new OutputPass());

    this.crt = new ShaderPass(CRTShader);
    this.crt.uniforms.uResolution.value = [innerWidth, innerHeight];
    this.composer.addPass(this.crt);

    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.crt.uniforms.uResolution.value = [w, h];
  }

  render(time) {
    this.crt.uniforms.uTime.value = time;
    this.composer.render();
  }
}
