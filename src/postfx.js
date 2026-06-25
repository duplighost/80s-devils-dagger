// Custom final-pass shader: CRT barrel curve, radial chromatic aberration,
// rolling scanlines, vignette, animated film grain, and a `trauma` uniform the
// game spikes on hits/shakes for extra VHS chroma-tearing.
export const CRTShader = {
  uniforms: {
    tDiffuse:          { value: null },
    uTime:             { value: 0 },
    uResolution:       { value: [1280, 720] },
    uAberration:       { value: 0.0016 },
    uScanline:         { value: 0.18 },
    uScanCount:        { value: 900.0 },
    uVignette:         { value: 1.05 },
    uGrain:            { value: 0.05 },
    uCurvature:        { value: 0.12 },
    uTrauma:           { value: 0.0 },
    uDesat:            { value: 0.0 }, // pushed up near death for a dying-signal look
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uTime, uAberration, uScanline, uScanCount, uVignette, uGrain, uCurvature, uTrauma, uDesat;
    uniform vec2 uResolution;

    // cheap hash noise
    float hash(vec2 p){
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    // CRT barrel distortion
    vec2 curve(vec2 uv){
      uv = uv * 2.0 - 1.0;
      vec2 offset = abs(uv.yx) / vec2(6.0 / uCurvature, 5.0 / uCurvature);
      uv += uv * offset * offset;
      return uv * 0.5 + 0.5;
    }

    void main(){
      vec2 uv = curve(vUv);

      // outside the curved tube -> black bezel
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0){
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      // radial chromatic aberration, stronger toward edges and on trauma
      vec2 dir = uv - 0.5;
      float r2 = dot(dir, dir);
      float ab = uAberration * (1.0 + uTrauma * 9.0) * (0.35 + r2 * 3.0);
      vec2 shift = dir * ab * 6.0;

      float cr = texture2D(tDiffuse, uv + shift).r;
      float cg = texture2D(tDiffuse, uv).g;
      float cb = texture2D(tDiffuse, uv - shift).b;
      vec3 col = vec3(cr, cg, cb);

      // horizontal VHS jitter when traumatized
      if (uTrauma > 0.001){
        float line = hash(vec2(uv.y * 120.0, floor(uTime * 24.0)));
        col += (line - 0.5) * uTrauma * 0.25;
      }

      // scanlines (rolling)
      float scan = sin((uv.y * uScanCount) + uTime * 2.0) * 0.5 + 0.5;
      col *= 1.0 - uScanline * scan;
      // subtle aperture-grille vertical mask
      float grille = 0.94 + 0.06 * sin(uv.x * uResolution.x * 1.5708);
      col *= grille;

      // film grain
      float g = hash(uv * uResolution.xy + fract(uTime) * 91.7);
      col += (g - 0.5) * uGrain;

      // desaturate toward death
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(luma), clamp(uDesat, 0.0, 1.0));

      // vignette
      float vig = smoothstep(0.95, 0.25, r2 * uVignette * 2.4);
      col *= mix(0.35, 1.0, vig);

      // tiny global flicker for CRT life
      col *= 0.97 + 0.03 * sin(uTime * 60.0);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
