// The persistent underwater backdrop: one fragment shader on a full-screen canvas.
// It never unmounts. Screens call setMood() and the camera, depth and light-ray angle ease toward
// the new values, so the world is still moving while the UI swaps over it.
import { settings, reduced } from './util.js';

const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uCam;
uniform float uDepth;
uniform float uRay;
uniform float uScale;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

// bright, thin, wandering lines like light focused through a moving surface
float caustic(vec2 p, float t){
  p *= 6.2831;
  vec2 i = p; float c = 0.;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1. - 3.5 / float(n + 1));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1. / length(vec2(p.x / (sin(i.x + tt) / .005), p.y / (cos(i.y + tt) / .005)));
  }
  c /= 4.;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.);
}

void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 suv = fc / uRes;                 // 0..1, y up
  vec2 p = fc / uRes.y + uCam;          // aspect-correct world coords
  float t = uTime * .32;

  vec3 abyss = vec3(.008, .035, .2);
  vec3 deep  = vec3(.035, .15, .6);
  vec3 sea   = vec3(.085, .28, .88);
  float y = suv.y + uCam.y * .35;
  vec3 col = mix(abyss, deep, smoothstep(-.15, .55, y));
  col = mix(col, sea, smoothstep(.5, 1., y));
  col = mix(col, abyss * 1.3, uDepth * .7);

  // caustics, two layers drifting against each other, banded into cel steps
  vec2 cuv = vec2(p.x * 1.05, p.y * 1.5);
  float c1 = caustic(cuv * .5 + vec2(t * .05, 0.), t);
  float c2 = caustic(cuv * .85 + vec2(-t * .04, t * .03) + 3.1, t * 1.2);
  float cc = clamp(c1 * .65 + c2 * .45, 0., 1.);
  float band = smoothstep(.3, .34, cc) * .5 + smoothstep(.6, .64, cc) * .5;
  col += vec3(.33, .74, 1.) * band * (.2 + .38 * smoothstep(.1, 1., y)) * (1. - uDepth * .65);

  // light rays slanting down from the surface
  float rx = suv.x + (1. - suv.y) * uRay + uCam.x * .2;
  float r = (sin(rx * 17. + t * .8) * .5 + .5) * (sin(rx * 6.7 - t * .5) * .5 + .5);
  r = smoothstep(.5, .85, r);
  col += vec3(.5, .86, 1.) * r * .15 * smoothstep(.05, 1., suv.y) * (1. - uDepth * .55);

  // shimmer along the surface
  float sh = caustic(vec2(p.x * 1.6, p.y * .5 + t * .1), t * 1.4);
  col += vec3(.75, .95, 1.) * smoothstep(.45, .55, sh) * smoothstep(.84, 1., suv.y) * .3 * (1. - uDepth * .5);

  // halftone screen in the lower dark
  float tone = (1. - smoothstep(0., .5, suv.y)) * .75 + uDepth * .2;
  float a = .785; mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 cell = fract(rot * fc / (7. * uScale)) - .5;
  float dotm = 1. - smoothstep(tone * .55 - .05, tone * .55, length(cell));
  col = mix(col, abyss * .55, dotm * .4);

  vec2 q = suv - .5;
  col *= 1. - dot(q, q) * .85;
  col += (hash(fc + fract(uTime) * 91.) - .5) * .03;
  gl_FragColor = vec4(col, 1.);
}`;

// per-screen moods: camera offset, depth (0 bright → 1 abyss), ray slant
export const MOODS = {
  boot:    { cam: [0, -.4],  depth: 1,   ray: .25 },
  title:   { cam: [0, -.25], depth: .78, ray: .18 },
  menu:    { cam: [.05, 0],  depth: .08, ray: .42 },
  section: { cam: [.35, .08], depth: .3, ray: .3 },
  system:  { cam: [-.25, .15], depth: .2, ray: .55 },
};

const state = { cam: [...MOODS.boot.cam], depth: 1, ray: .25, target: MOODS.boot, mouse: [0, 0], extra: [0, 0] };

export function setMood(name, nudge = 0) {
  state.target = MOODS[name] || MOODS.section;
  state.extra = [nudge * .18, 0];       // sections drift sideways a little per index
  document.body.dataset.mood = name;
}

export function initSea() {
  const canvas = document.getElementById('sea');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) { document.body.classList.add('no-gl'); return; }

  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { document.body.classList.add('no-gl'); return; }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = Object.fromEntries(['uRes', 'uTime', 'uCam', 'uDepth', 'uRay', 'uScale'].map((n) => [n, gl.getUniformLocation(prog, n)]));

  let scale = 1, slow = 0;
  function resize() {
    const cap = settings.effects === 'low' ? .6 : 1.25;
    const dpr = Math.min(devicePixelRatio || 1, cap) * scale;
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(U.uScale, dpr);
  }
  resize();
  addEventListener('resize', resize);
  addEventListener('pointermove', (e) => {
    state.mouse = [(e.clientX / innerWidth - .5), (e.clientY / innerHeight - .5)];
  }, { passive: true });
  initSea.resize = resize;

  let last = performance.now(), t = 0, raf = 0;
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    const speed = reduced() ? .35 : 1;
    t += dt * speed;
    const k = 1 - Math.exp(-dt * (reduced() ? 6 : 2.6));
    const tg = state.target, par = reduced() ? 0 : .04;
    state.cam[0] += (tg.cam[0] + state.extra[0] + state.mouse[0] * par - state.cam[0]) * k;
    state.cam[1] += (tg.cam[1] + state.extra[1] - state.mouse[1] * par - state.cam[1]) * k;
    state.depth += (tg.depth - state.depth) * k;
    state.ray += (tg.ray - state.ray) * k;
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, t);
    gl.uniform2f(U.uCam, state.cam[0], state.cam[1]);
    gl.uniform1f(U.uDepth, state.depth);
    gl.uniform1f(U.uRay, state.ray);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // adapt: if frames are consistently slow, render at a lower resolution
    if (dt > .024) { if (++slow > 50 && scale > .5) { scale -= .2; slow = 0; resize(); } } else slow = Math.max(0, slow - 1);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });
  document.body.classList.add('gl-on');
}
