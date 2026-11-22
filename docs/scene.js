'use strict';
// Stylised full-screen backdrops, each rendered by one fragment shader.
//   night: moonlit window for the title screens
//   sea:   underwater light for the menu and submenus
// Both share the same look: cel-banded light, halftone shading, blue grade, grain and vignette.
// Each canvas only renders while its screens are showing; without WebGL the CSS scenes stay.
(function () {
  const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

  const COMMON = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uScale;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0., a = .5; mat2 r = mat2(.8, .6, -.6, .8);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.02; a *= .5; }
  return v;
}
// halftone dot coverage for a tone in 0..1 on a 45-degree screen of the given cell size (css px)
float halftone(vec2 fc, float tone, float cell){
  float a = .785; mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 hp = rot * fc / (cell * uScale);
  float r = clamp(tone, 0., 1.) * .62;
  return 1. - smoothstep(r - .08, r, length(fract(hp) - .5));
}
vec3 grade(vec3 col, vec2 fc){
  float lum = dot(col, vec3(.3, .5, .2));
  vec3 g = mix(vec3(.008, .022, .1), vec3(.12, .3, .9), smoothstep(0., .45, lum));
  g = mix(g, vec3(.86, .94, 1.), smoothstep(.45, 1., lum));
  col = mix(col, g, .4);
  vec2 uv = fc / uRes;
  col *= .3 + .7 * pow(16. * uv.x * uv.y * (1. - uv.x) * (1. - uv.y), .3);
  col += (hash(fc + fract(uTime) * 91.) - .5) * .035;
  return col;
}
`;

  const SEA = COMMON + `
// classic iterated-warp water caustic; returns bright vein lines
float caustic(vec2 p, float t){
  vec2 i = p; float c = 1.; float inten = .005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1. - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1. / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.);
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc / uRes;
  vec2 p = (fc - .5 * uRes) / uRes.y;
  float t = uTime;
  float depth = 1. - uv.y;                      // 0 at the surface (top), 1 at the bottom

  // water body: lit near the surface, falling to deep navy
  vec3 col = mix(vec3(.12, .34, .92), vec3(.012, .04, .19), smoothstep(0., .95, depth));
  col += vec3(.15, .35, .8) * exp(-length(p - vec2(.25 + uMouse.x * .03, .7)) * 1.6) * .6;

  // surface caustics, foreshortened toward the top, drawn as cel-banded lines
  vec2 sp = p + uMouse * .02;
  // fewer, broader, slower shapes than before, confined to the top third
  vec2 cp = vec2(sp.x * (1.25 - uv.y * .55), uv.y * uv.y * 1.6) * .62;
  float cv = caustic(mod(cp * 6.2832, 6.2832) - 250., t * .28 + 23.);
  float lines = smoothstep(.34, .52, cv) * .42;
  col += vec3(.55, .86, 1.) * lines * smoothstep(.6, 1., uv.y);

  // light shafts from the surface, rendered as halftone dots
  float rd = sp.x + sp.y * .38;
  float ray = noise(vec2(rd * 6.5, t * .12)) * noise(vec2(rd * 15. + 3., t * .09 + 7.));
  ray = smoothstep(.25, .65, ray) * smoothstep(-.6, .5, sp.y);
  col += vec3(.3, .55, 1.) * ray * .14;
  col = mix(col, col + vec3(.25, .45, .9) * .4, halftone(fc, ray * .8, 7.) * ray);

  // halftone tint deepening the lower water
  float deep = smoothstep(.45, 1., depth);
  col = mix(col, col + vec3(.03, .08, .22), halftone(fc + 3., deep * .55, 8.) * .6);

  // marine snow drifting upward
  vec2 sg = fc / (16. * uScale) + vec2(0., t * .35);
  vec2 si = floor(sg);
  float sh = hash(si);
  float speck = step(.972, sh) * (1. - smoothstep(.05, .16, length(fract(sg) - .5 - (vec2(hash(si + 3.), hash(si + 9.)) - .5) * .5)));
  col += vec3(.6, .85, 1.) * speck * (.25 + .25 * sin(t * 2. + sh * 30.)) * (.35 + .65 * smoothstep(1., .2, depth));

  gl_FragColor = vec4(grade(col, fc), 1.);
}`;

  const NIGHT = COMMON + `
// crater field: dark bowls with bright rims, scattered on a jittered grid
float craters(vec2 p){
  vec2 i = floor(p), f = fract(p); float c = 0.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = vec2(hash(i + g), hash(i + g + 17.));
    float on = step(.42, hash(i + g + 7.));
    float r = .16 + .22 * hash(i + g + 31.);
    float d = length(g + o - f);
    float bowl = 1. - smoothstep(r * .55, r, d);
    float rim = smoothstep(r * .7, r, d) * (1. - smoothstep(r, r * 1.3, d));
    c += on * (-.55 * bowl + .4 * rim);
  }
  return c;
}

// The window is a plane turned away to the right: a projective map gives true convergence
// toward a vanishing point VP. The frame has depth: its back edges are the same shapes
// pulled toward VP, so the strip between front and back silhouettes is the inner side face.
const float K = .34;          // strength of the perspective
const float OX = -.2;         // where the plane faces the viewer squarely
const float DEPTH = .982;     // < 1: how far back the frame's rear edges sit (subtle)
vec2 VP(){ return vec2(OX + 1. / K, -.02); }
vec2 winSpace(vec2 p){ float dd = 1. - K * (p.x - OX); return vec2(p.x - OX, p.y) / dd; }
vec2 backSpace(vec2 p){ return winSpace(VP() + (p - VP()) / DEPTH); }
float barsW(vec2 w, float px, out float edge){
  float hw = .028, hh = .032, m = 0.; edge = 0.;
  // place the frame relative to what is visible, so any aspect ratio frames the moon
  float aH = .5 * uRes.x / uRes.y;
  float wl = winSpace(vec2(-aH, 0.)).x, wr = winSpace(vec2(aH, 0.)).x;
  for (int i = 0; i < 3; i++) {
    float xs = mix(wl, wr, .2 + .3 * float(i));
    float dx = abs(w.x - xs);
    m = max(m, 1. - smoothstep(hw, hw + px, dx));
    edge = max(edge, 1. - smoothstep(0., px * 1.6, abs(dx - hw * .8)));
  }
  float dy = abs(w.y + .05);
  m = max(m, 1. - smoothstep(hh, hh + px, dy));
  edge = max(edge, 1. - smoothstep(0., px * 1.6, abs(dy - hh * .8)));
  m = max(m, smoothstep(.52 - px, .52, w.y));                 // head of the frame
  float jamb = mix(wl, wr, .035);
  m = max(m, 1. - smoothstep(jamb, jamb + px, w.x));           // wall/jamb on the near side
  return m;
}
float bars(vec2 p, float px, out float edge){ return barsW(winSpace(p), px, edge); }

void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 p = (fc - .5 * uRes) / uRes.y;
  float px = 1.5 / uRes.y;
  float aspectHalf = .5 * uRes.x / uRes.y;
  float t = uTime;
  bool portrait = uRes.x < uRes.y;

  // ---------- sky ----------
  vec2 mc = (portrait ? vec2(-.05, .2) : vec2(-.2, .19)) + uMouse * .012;
  float R = portrait ? .2 : .25;
  float dm = length(p - mc);
  vec3 col = mix(vec3(.004, .012, .06), vec3(.03, .09, .32), smoothstep(-.7, .55, p.y));
  col += vec3(.05, .13, .4) * exp(-dm * 2.6);

  // stars (hidden near the moon)
  vec2 sg = fc / (14. * uScale);
  vec2 si = floor(sg);
  float sh = hash(si);
  float star = step(.955, sh) * (1. - smoothstep(.04, .14, length(fract(sg) - .5 - (vec2(hash(si + 3.), hash(si + 9.)) - .5) * .6)));
  star *= .55 + .45 * sin(t * (1. + 3. * hash(si + 5.)) + sh * 40.);
  col += vec3(1., 1.05, 1.2) * star * smoothstep(.32, .75, dm) * smoothstep(-.25, .25, p.y);

  // ---------- moon ----------
  vec2 d = (p - mc) / R;
  float r2 = dot(d, d);
  float edgeAA = 1. - smoothstep(1. - px / R * 1.5, 1., sqrt(r2));
  if (r2 < 1.) {
    vec3 n = vec3(d, sqrt(1. - r2));
    vec3 L = normalize(vec3(-.42, .5, .76));
    float lam = max(dot(n, L), 0.);
    vec2 tp = d / (.55 + .45 * n.z);
    float maria = smoothstep(.44, .6, fbm(tp * 2.1 + 3.7));
    float cr = craters(tp * 4.2) + .5 * craters(tp * 8.5 + 5.);
    float alb = .95 - .42 * maria + .3 * cr + .08 * (fbm(tp * 14.) - .5);
    float s = lam * alb;
    // soft cel banding
    float band = floor(s * 4. + .5) / 4.;
    s = mix(s, band, .55);
    vec3 lit = vec3(.88, .93, 1.), shade = vec3(.14, .22, .5);
    vec3 mcol = mix(shade, lit, smoothstep(.05, .95, s));
    // halftone dots grow into the shadow side
    float a = .785; mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
    vec2 hp = rot * fc / (5.5 * uScale);
    float dr = clamp((.72 - s) * .85, 0., .62);
    float dotm = 1. - smoothstep(dr - .08, dr, length(fract(hp) - .5));
    mcol = mix(mcol, vec3(.1, .17, .45), dotm * .85);
    // limb light
    mcol += vec3(.3, .5, .9) * pow(1. - n.z, 3.) * .35;
    col = mix(col, mcol, edgeAA);
  }
  // glow halo (two falloffs) with a slow breath
  float halo = max(dm - R, 0.);
  float breath = .92 + .08 * sin(t * .5);
  col += vec3(.3, .5, 1.) * (exp(-halo * 9.) * .38 + exp(-halo * 2.6) * .1) * breath;

  // ---------- clouds ----------
  vec2 cpar = p + uMouse * .025;
  vec2 cp = cpar * vec2(1.5, 3.4) + vec2(t * .018, 0.);
  float warp = fbm(cp * .6 + vec2(0., t * .01));
  float c1 = fbm(cp + warp * 1.4);
  float band2 = smoothstep(.15, -.35, cpar.y) + .95 * smoothstep(-.12, .04, cpar.y - mc.y + R * .9) * smoothstep(.2, .02, cpar.y - mc.y + R * .5);
  float dens = smoothstep(.46, .66, c1) * clamp(band2 * 1.3, 0., 1.);
  vec2 toMoon = normalize(mc - cpar);
  float c2 = fbm(cp + toMoon * vec2(.12, .24) + warp * 1.4);
  float rim = clamp((c1 - c2) * 7., 0., 1.);
  float near = exp(-length(cpar - mc) * 1.6);
  float cl = mix(.18, 1., rim) * (.35 + .65 * near);
  cl = mix(cl, floor(cl * 3. + .5) / 3., .5);
  vec3 ccol = mix(vec3(.02, .05, .2), vec3(.7, .83, 1.), cl);
  col = mix(col, ccol, dens * .88);

  // ---------- light shafts through the glass ----------
  vec2 fpar = p + uMouse * .05;
  float e0;
  float frameHere = bars(fpar, px, e0);
  vec2 toM = (mc + uMouse * .05) - fpar;
  float rays = 0.;
  for (int i = 0; i < 22; i++) {
    float k = float(i) / 22.;
    vec2 q = fpar + toM * k * .92;
    float e;
    float occ = bars(q, px * 4., e);
    rays += exp(-length(q - mc - uMouse * .05) * 3.2) * (1. - occ);
  }
  rays /= 22.;
  rays *= .8 + .2 * noise(fpar * 35. + t * .3);
  col += vec3(.22, .42, 1.) * rays * .32 * (1. - frameHere);

  // glass sheen: faint diagonal streaks
  float sheen = smoothstep(.985, 1., sin((fpar.x + fpar.y * .6) * 9. + 1.3)) * .06 + smoothstep(.993, 1., sin((fpar.x + fpar.y * .6) * 23.)) * .04;
  col += vec3(.6, .8, 1.) * sheen * (1. - frameHere);

  // ---------- window frame (front faces + inner side faces) ----------
  float glowAt = exp(-length(fpar - mc) * 1.3);
  float eb;
  float backHere = barsW(backSpace(fpar), px, eb);
  float side = backHere * (1. - frameHere);
  vec3 sideCol = mix(vec3(.02, .05, .17), vec3(.12, .26, .62), glowAt * .9);
  sideCol = mix(sideCol, sideCol * .55, halftone(fc, .45, 5.));
  col = mix(col, sideCol, side);
  vec3 fcol = vec3(.012, .03, .1) + vec3(.03, .07, .2) * glowAt;
  float e1;
  bars(fpar, px, e1);
  fcol += vec3(.35, .6, 1.) * e1 * glowAt * .9;
  col = mix(col, fcol, frameHere);

  // ---------- curtain (right) ----------
  float cx = fpar.x - (aspectHalf - (portrait ? .12 : .3) + .025 * sin(fpar.y * 3. + t * .6));
  float curtain = smoothstep(0., px * 2., cx);
  float folds = .5 + .5 * sin(cx * 58. + sin(fpar.y * 2.2 + t * .45) * 2.4);
  folds = pow(folds, 1.6);
  float clight = exp(-length(fpar - mc) * 1.2);
  vec3 kcol = mix(vec3(.01, .02, .08), vec3(.08, .18, .5), folds * (.25 + .9 * clight));
  kcol += vec3(.3, .5, 1.) * (1. - smoothstep(0., .015, cx)) * clight * .6;   // lit leading edge
  col = mix(col, kcol, curtain);

  // ---------- sill / foreground ----------
  const float SILL = -.44;
  vec2 fw = winSpace(fpar), bw = backSpace(fpar);
  float sillFront = smoothstep(SILL + px, SILL - px, fw.y);
  float sillTop = smoothstep(SILL + px, SILL - px, bw.y) * (1. - sillFront);
  vec3 topCol = mix(vec3(.04, .09, .26), vec3(.2, .36, .78), glowAt);
  topCol = mix(topCol, topCol * .7, halftone(fc, .35, 5.));
  col = mix(col, topCol, sillTop);
  vec3 scol = mix(vec3(.008, .018, .06), vec3(.03, .06, .18), smoothstep(-.6, SILL, fw.y));
  scol += vec3(.35, .55, 1.) * (1. - smoothstep(0., px * 2., abs(fw.y - SILL))) * .6 * glowAt;
  col = mix(col, scol, sillFront);

  // ---------- grade ----------
  float lum = dot(col, vec3(.3, .5, .2));
  vec3 graded = mix(vec3(.008, .022, .1), vec3(.12, .3, .9), smoothstep(0., .45, lum));
  graded = mix(graded, vec3(.86, .94, 1.), smoothstep(.45, 1., lum));
  col = mix(col, graded, .4);
  vec2 uv = fc / uRes;
  col *= .3 + .7 * pow(16. * uv.x * uv.y * (1. - uv.x) * (1. - uv.y), .3);
  col += (hash(fc + fract(t) * 91.) - .5) * .035;
  gl_FragColor = vec4(col, 1.);
}`;

  // contexts are created lazily, the first time a scene is needed outside Lite mode
  function makeScene(canvasId, frag, isActive) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const lite = () => document.body.classList.contains('lite');
    (function wait() {
      if (isActive() && !lite()) init(); else requestAnimationFrame(wait);
    })();
    function init() {
    const host = canvas.parentElement;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!gl) { host.classList.add('no-gl'); return; }
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(canvasId, gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) { host.classList.add('no-gl'); return; }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(canvasId, gl.getProgramInfoLog(prog)); host.classList.add('no-gl'); return; }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = { res: gl.getUniformLocation(prog, 'uRes'), time: gl.getUniformLocation(prog, 'uTime'),
      mouse: gl.getUniformLocation(prog, 'uMouse'), scale: gl.getUniformLocation(prog, 'uScale') };

    // below native resolution: the art is soft and stylised, and this keeps it cheap
    let scale = 1;
    const resize = () => {
      scale = Math.min(window.devicePixelRatio || 1, 1.5) * (innerWidth * innerHeight > 1.6e6 ? .55 : .7);
      canvas.width = Math.max(2, Math.round(innerWidth * scale));
      canvas.height = Math.max(2, Math.round(innerHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    addEventListener('resize', resize);
    host.classList.add('gl-on');

    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let drewStill = false;
    function frame(now) {
      requestAnimationFrame(frame);
      if (document.hidden || !isActive() || lite()) { drewStill = false; return; }
      if (still && drewStill) return;
      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniform1f(U.time, still ? 12 : (now - t0) / 1000);
      gl.uniform2f(U.mouse, mouse.x, mouse.y);
      gl.uniform1f(U.scale, scale);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      drewStill = true;
    }
    requestAnimationFrame(frame);
    }
  }

  // shared, eased mouse parallax
  const target = { x: 0, y: 0 }, mouse = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    target.x = (e.clientX / innerWidth - .5) * 2;
    target.y = -(e.clientY / innerHeight - .5) * 2;
  });
  (function ease() { mouse.x += (target.x - mouse.x) * .05; mouse.y += (target.y - mouse.y) * .05; requestAnimationFrame(ease); })();
  const t0 = performance.now();

  const has = (...c) => c.some((x) => document.body.classList.contains(x));
  makeScene('night-gl', NIGHT, () => has('st-home', 'st-press', 'st-intro'));
  makeScene('sea-gl', SEA, () => has('st-menu', 'st-out', 'st-sub', 'st-leave'));
})();
