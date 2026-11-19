'use strict';
// Stylised full-screen backdrops, each rendered by one fragment shader.
//   night: moonlit window for the title screens
//   sea:   underwater light for the menu and submenus
// Both share the same look: cel-banded light, halftone shading, blue grade, grain and vignette.
// Each canvas only renders while its screens are showing; without WebGL the CSS scenes stay.
(function () {
  // one source of truth for the room: templated into the shader and shared with the page
  const G = window.sceneGeo = {
    K: .34, OX: -.2, DEPTH: .982, REV: .955, SILL: -.44, HEAD: .52, FR: .035, GLL: .035, GLR: .6,
    FLOOR: -.82, EYE: -.25, ZW: 4., TANE: 1.5, SHX: .35,
    ROW0: .32, ROWSTEP: .44, COLSTEP: .72, DW: .36, DD: .2, DH: .16, CURTW: .34,
    DESKH: .3, BK_X0: -.6, BK_X1: -.12, BK_D0: .2, BK_D1: .44, BK_H: .066, BK_PULL: .1,
    PB_GAP: .12, PB_W: .95, PB_Y0: -.3, PB_Y1: .42,
  };
  for (const k in G) G[k] = Number(G[k]);
  const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
  const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

  const COMMON = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uScale;
uniform vec4 uCam;      // camera: xy pan, z zoom, w roll in radians (night scene)
uniform vec3 uSpot;     // hover glow in wall-plane coords: x, y, intensity
uniform vec4 uBook;     // book-stack menu: count, selected (0 = top book), pull-out amount, unused
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

// ---- room geometry (constants come from GEO in JS, so the page can align with the shader) ----
// The wall is a plane turned away to the right: a projective map gives true convergence toward VP.
const float K = ${f(G.K)}, OX = ${f(G.OX)}, DEPTH = ${f(G.DEPTH)}, REV = ${f(G.REV)};
const float SILL = ${f(G.SILL)}, HEAD = ${f(G.HEAD)}, FR = ${f(G.FR)}, GLL = ${f(G.GLL)}, GLR = ${f(G.GLR)};
const float FLOORY = ${f(G.FLOOR)}, EYE = ${f(G.EYE)}, ZW = ${f(G.ZW)}, TANE = ${f(G.TANE)}, SHX = ${f(G.SHX)};
const float ROW0 = ${f(G.ROW0)}, ROWSTEP = ${f(G.ROWSTEP)}, COLSTEP = ${f(G.COLSTEP)}, DW = ${f(G.DW)}, DD = ${f(G.DD)}, DH = ${f(G.DH)};
const float CURTW = ${f(G.CURTW)};
vec2 VP(){ return vec2(OX + 1. / K, -.02); }
vec2 winSpace(vec2 p){ float dd = 1. - K * (p.x - OX); return vec2(p.x - OX, p.y) / dd; }
vec2 backSpaceD(vec2 p, float d){ return winSpace(VP() + (p - VP()) / d); }
vec2 backSpace(vec2 p){ return backSpaceD(p, DEPTH); }
// glass x-extent, from the wall coordinates of the screen edges at the home framing
vec2 glassX(){
  float aH = .5 * uRes.x / uRes.y;
  float wl = winSpace(vec2(-aH, 0.)).x, wr = winSpace(vec2(aH, 0.)).x;
  return vec2(mix(wl, wr, GLL), mix(wl, wr, GLR));
}
float xCenter(){ vec2 g = glassX(); return mix(g.x, g.y, .5); }
// 1 inside the glass rect grown by pad (anti-aliased)
float rectM(vec2 w, vec2 g, float pad, float px){
  return smoothstep(g.x - pad - px, g.x - pad, w.x) * (1. - smoothstep(g.y + pad, g.y + pad + px, w.x))
       * smoothstep(SILL - pad - px, SILL - pad, w.y) * (1. - smoothstep(HEAD + pad, HEAD + pad + px, w.y));
}
float barsW(vec2 w, float px, out float edge){
  vec2 g = glassX();
  float hw = .026, hh = .03, m = 0.; edge = 0.;
  float inG = rectM(w, g, 0., px);
  for (int i = 0; i < 2; i++) {
    float xs = mix(g.x, g.y, (float(i) + 1.) / 3.);
    float dx = abs(w.x - xs);
    m = max(m, (1. - smoothstep(hw, hw + px, dx)) * inG);
    edge = max(edge, (1. - smoothstep(0., px * 1.6, abs(dx - hw * .8))) * inG);
  }
  float dy = abs(w.y + .05);
  m = max(m, (1. - smoothstep(hh, hh + px, dy)) * inG);
  edge = max(edge, (1. - smoothstep(0., px * 1.6, abs(dy - hh * .8))) * inG);
  m = max(m, rectM(w, g, FR, px) * (1. - inG));               // outer frame around the glass
  return m;
}
float bars(vec2 p, float px, out float edge){ return barsW(winSpace(p), px, edge); }
// objects in the room: footprint X (lateral) × D (distance in front of the wall), heights H above the floor
float scD(float D){ return ZW / (ZW - D); }
float yAt(float H, float D){ return EYE + (FLOORY + H - EYE) * scD(D); }
float xAt(float X, float D){ return xCenter() + (X - xCenter()) * scD(D); }
float band(float v, float a, float b, float px){ return smoothstep(a - px, a, v) * (1. - smoothstep(b, b + px, v)); }
float rectBand(vec2 w, float x0, float x1, float y0, float y1, float px){ return band(w.x, x0, x1, px) * band(w.y, y0, y1, px); }
// an axis-aligned box: front face + top (top only shows below eye level), moonlit rim on the front-top edge
void box(inout vec3 col, vec2 w, float px, float x0, float x1, float d0, float d1, float h0, float h1, vec3 faceC, vec3 topC, float rimK){
  float xc = xCenter();
  float sF = scD(d1), sB = scD(d0);
  float fx0 = xAt(x0, d1), fx1 = xAt(x1, d1);
  float yb = yAt(h0, d1), yt = yAt(h1, d1), ytb = yAt(h1, d0);
  float face = band(w.x, fx0, fx1, px) * band(w.y, yb, yt, px);
  float tt = clamp((w.y - yt) / (ytb - yt + 1e-5), 0., 1.);
  float st = mix(sF, sB, tt);
  float top = band(w.x, xc + (x0 - xc) * st, xc + (x1 - xc) * st, px) * band(w.y, yt, ytb, px);
  float rim = (1. - smoothstep(0., px * 2., abs(w.y - yt))) * band(w.x, fx0, fx1, px);
  col = mix(col, faceC, face);
  col = mix(col, topC, top);
  col = mix(col, topC * 1.5 + vec3(.12, .22, .45), rim * rimK);
}
// book-stack menu: book i counts up from the desk; small deterministic offsets so it looks hand-stacked
const float DESKH = ${f(G.DESKH)}, BK_X0 = ${f(G.BK_X0)}, BK_X1 = ${f(G.BK_X1)}, BK_D0 = ${f(G.BK_D0)}, BK_D1 = ${f(G.BK_D1)}, BK_H = ${f(G.BK_H)}, BK_PULL = ${f(G.BK_PULL)};
float bookOff(float i){ return .022 * sin(i * 2.7 + 1.); }
float bookTrim(float i){ return .035 * (.5 + .5 * sin(i * 1.9 + .5)); }
// floor: wall-plane coords below the floor line → (lateral X, distance D in front of the wall)
vec2 floorXD(vec2 w){
  float sc = (w.y - EYE) / (FLOORY - EYE);
  return vec2(xCenter() + (w.x - xCenter()) / sc, ZW * (1. - 1. / sc));
}

// camera with parallax: depth 0 = infinitely far (sky), 1 = the window frame
vec2 camP(vec2 q, float depth){
  float a = uCam.w * depth; float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c) * q / mix(1., uCam.z, depth) + uCam.xy * depth;
}

void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 p0 = (fc - .5 * uRes) / uRes.y;
  vec2 p = camP(p0, .25);                   // sky + moon move least
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
  vec2 cpar = camP(p0, .55) + uMouse * .025;
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
  vec2 fpar = camP(p0, 1.) + uMouse * .05;
  vec2 fw = winSpace(fpar);
  vec2 gx = glassX();
  float inGlass = rectM(fw, gx, 0., px);
  float inWin = rectM(fw, gx, FR, px);
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
  col += vec3(.22, .42, 1.) * rays * .32 * (1. - frameHere) * inGlass;

  float sheen = smoothstep(.985, 1., sin((fpar.x + fpar.y * .6) * 9. + 1.3)) * .06 + smoothstep(.993, 1., sin((fpar.x + fpar.y * .6) * 23.)) * .04;
  col += vec3(.6, .8, 1.) * sheen * (1. - frameHere) * inGlass;

  // ---------- window frame (front faces + inner side faces) ----------
  float glowAt = exp(-length(fpar - mc) * 1.3);
  float eb;
  float backHere = barsW(backSpace(fpar), px, eb);
  float side = backHere * (1. - frameHere) * rectM(fw, gx, FR + .02, px);
  vec3 sideCol = mix(vec3(.02, .05, .17), vec3(.12, .26, .62), glowAt * .9);
  sideCol = mix(sideCol, sideCol * .55, halftone(fc, .45, 5.));
  col = mix(col, sideCol, side);
  vec3 fcol = vec3(.012, .03, .1) + vec3(.03, .07, .2) * glowAt;
  float e1;
  bars(fpar, px, e1);
  fcol += vec3(.35, .6, 1.) * e1 * glowAt * .9;
  col = mix(col, fcol, frameHere);

  // ---------- room ----------
  vec2 wc = vec2(mix(gx.x, gx.y, .45), .05);
  float glowW = exp(-length((fw - wc) * vec2(.7, 1.)) * 1.1);    // moonlight spilling from the window
  float onFloor = smoothstep(FLOORY + px, FLOORY - px, fw.y);
  // wall, with a chair rail and halftone deepening away from the light
  vec3 wcol = mix(vec3(.02, .045, .15), vec3(.08, .17, .44), glowW);
  float rail = FLOORY + .24;
  wcol *= mix(.82, 1., smoothstep(rail - px, rail + px, fw.y));
  wcol += vec3(.12, .24, .55) * (1. - smoothstep(0., px * 2.5, abs(fw.y - rail))) * (.25 + .6 * glowW);
  wcol = mix(wcol, wcol * .6, halftone(fc, (1. - glowW) * .65, 6.));
  col = mix(col, wcol, (1. - inWin) * (1. - onFloor));
  // recess: the opening's back edge sits deeper, showing its inner faces
  float reveal = rectM(backSpaceD(fpar, REV), gx, FR, px) * (1. - inWin) * (1. - onFloor);
  vec3 revCol = mix(vec3(.04, .09, .26), vec3(.2, .36, .8), glowW);
  col = mix(col, mix(revCol, revCol * .7, halftone(fc, .4, 5.)), reveal);

  // sill ledge under the frame
  float sx0 = gx.x - FR - .05, sx1 = gx.y + FR + .05, sTop = SILL - FR;
  float inSx = smoothstep(sx0 - px, sx0, fw.x) * (1. - smoothstep(sx1, sx1 + px, fw.x));
  vec2 bwS = backSpaceD(fpar, .955);
  float sillTop = inSx * smoothstep(sTop + px, sTop - px, bwS.y) * smoothstep(sTop - px, sTop + px, fw.y) * (1. - inWin);
  float sillFront = inSx * smoothstep(sTop + px, sTop - px, fw.y) * smoothstep(sTop - .065 - px, sTop - .065 + px, fw.y);
  vec3 topCol = mix(vec3(.05, .11, .3), vec3(.24, .42, .86), glowAt);
  col = mix(col, mix(topCol, topCol * .72, halftone(fc, .35, 5.)), sillTop);
  vec3 sfc = vec3(.01, .024, .08) + vec3(.35, .55, 1.) * (1. - smoothstep(0., px * 2., abs(fw.y - sTop))) * .6 * glowAt;
  col = mix(col, sfc, sillFront);

  // curtains: a wide one hanging right of the window, a narrow one on the left; rod above
  float cTop = HEAD + FR + .12;
  float hang = smoothstep(FLOORY + .03 - px, FLOORY + .03 + px, fw.y) * (1. - smoothstep(cTop, cTop + px, fw.y));
  float cxr = fw.x - (gx.y + FR) - .015 * sin(fw.y * 3. + t * .6);
  float cxl = (gx.x - FR) - fw.x + .012 * sin(fw.y * 3.3 + t * .5);
  float curR = smoothstep(0., px * 2., cxr) * (1. - smoothstep(CURTW, CURTW + px * 2., cxr)) * hang;
  float curL = smoothstep(0., px * 2., cxl) * (1. - smoothstep(CURTW * .45, CURTW * .45 + px * 2., cxl)) * hang;
  float clight = exp(-length(fpar - mc) * 1.2);
  float foldR = pow(.5 + .5 * sin(cxr * 46. + sin(fw.y * 2.2 + t * .45) * 2.2), 1.6);
  float foldL = pow(.5 + .5 * sin(cxl * 52. + sin(fw.y * 2.6 + t * .4) * 2.), 1.6);
  vec3 kR = mix(vec3(.01, .02, .08), vec3(.08, .18, .5), foldR * (.25 + .9 * clight));
  kR += vec3(.3, .5, 1.) * (1. - smoothstep(0., .015, cxr)) * clight * .6;
  vec3 kL = mix(vec3(.01, .02, .08), vec3(.08, .18, .5), foldL * (.25 + .9 * clight));
  kL += vec3(.3, .5, 1.) * (1. - smoothstep(0., .012, cxl)) * clight * .6;
  col = mix(col, kR, curR);
  col = mix(col, kL, curL);
  float rod = (1. - smoothstep(.006, .006 + px, abs(fw.y - cTop))) * smoothstep(gx.x - FR - CURTW * .5, gx.x - FR - CURTW * .45, fw.x) * (1. - smoothstep(gx.y + FR + CURTW + .03, gx.y + FR + CURTW + .05, fw.x));
  col = mix(col, vec3(.1, .2, .5) * (.4 + glowW), rod);

  // floor: planks, moonlight pools cast by the panes, a hover pool, and desks
  if (fw.y < FLOORY + .5) {
    vec2 F = floorXD(fw);                       // X lateral, D distance from the wall
    vec3 flo = mix(vec3(.008, .02, .075), vec3(.03, .07, .2), exp(-F.y * .9) * (.4 + .6 * glowW));
    flo *= .85 + .15 * smoothstep(.0, .06, abs(fract(F.y * 3.5) - .5));       // plank seams
    vec2 wp = vec2(F.x - F.y * SHX, FLOORY + F.y * TANE);                     // window point lighting this spot
    float ep;
    float pool = rectM(wp, gx, 0., .01) * (1. - barsW(wp, .01, ep)) * exp(-F.y * .55);
    flo += vec3(.3, .55, 1.) * pool * .95;
    flo = mix(flo, flo + vec3(.2, .38, .8) * .5, halftone(fc + 2., pool * .8, 6.) * pool);
    flo = mix(flo, flo * .6, halftone(fc, (1. - pool) * .5, 7.));
    col = mix(col, flo, onFloor);

    // rug under the chair
    float rug = smoothstep(1., .96, length((F - vec2(xCenter() - .02, .78)) / vec2(.62, .3)));
    vec3 rugC = mix(vec3(.03, .07, .2), vec3(.06, .13, .34), .5 + .5 * sin(F.x * 30.)) * (.7 + .5 * pool);
    col = mix(col, mix(rugC, rugC * .6, halftone(fc + 4., .45, 5.)), rug * onFloor);
  }

  // ---------- a lived-in desk under the window ----------
  {
    float xc = xCenter();
    float lampX = xc + .5, lampD = .24;
    float dh = .3;                                              // desk height
    // lamp light: a soft cyan pool on the desk and the wall behind it
    vec2 lampW = vec2(xAt(lampX - .12, .3), yAt(dh, .3));
    float lampGlow = exp(-length((fw - lampW) * vec2(1., 1.7)) * 4.2);
    col += vec3(.35, .6, 1.) * lampGlow * .28 * (1. - inGlass);
    vec3 deskTop = vec3(.07, .15, .4) + vec3(.25, .45, .95) * lampGlow * .5;
    vec3 deskFace = vec3(.012, .03, .1);
    // legs, then the top slab
    box(col, fw, px, xc - .62, xc - .58, .12, .5, 0., dh - .03, deskFace, deskFace, 0.);
    box(col, fw, px, xc + .58, xc + .62, .12, .5, 0., dh - .03, deskFace, deskFace, 0.);
    box(col, fw, px, xc - .64, xc + .64, .1, .52, dh - .035, dh, mix(deskFace, deskFace * .6, halftone(fc, .5, 5.)), mix(deskTop, deskTop * .78, halftone(fc, .3, 5.)), .9);
    // drawer unit on the left
    box(col, fw, px, xc - .6, xc - .32, .14, .5, .02, dh - .035, vec3(.02, .045, .14), vec3(.04, .09, .25), .4);
    float dyy = yAt(.17, .5);
    col = mix(col, vec3(.15, .3, .7), (1. - smoothstep(0., px * 1.5, abs(fw.y - dyy))) * band(fw.x, xAt(xc - .6, .5), xAt(xc - .32, .5), px) * .7);
    // loose papers lying on the desk top (found by inverting the desk-top plane)
    {
      float sc = (fw.y - EYE) / (FLOORY + dh - EYE);
      vec2 T = vec2(xc + (fw.x - xc) / sc, ZW * (1. - 1. / sc));      // X, D on the desk top
      float onTop = band(T.y, .1, .52, .002) * band(T.x, xc - .64, xc + .64, .002) * step(fw.y, yAt(dh, .1) + .001);
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        vec2 cen = vec2(xc - .02 + fi * .13, .4 + .035 * sin(fi * 2.1));
        float th = -.35 + fi * .32;
        vec2 q = T - cen;
        q = vec2(q.x * cos(th) - q.y * sin(th), q.x * sin(th) + q.y * cos(th));
        float sheet = band(q.x, -.07, .07, .002) * band(q.y, -.05, .05, .002) * onTop;
        float lines = step(.55, fract(q.y * 90.)) * band(q.x, -.055, .045 - .03 * hash(vec2(floor(q.y * 90.), fi)), .001) * band(q.y, -.04, .035, .001);
        vec3 pc = mix(vec3(.55, .65, .88), vec3(.75, .84, 1.), glowW * .5 + lampGlow * .6) - vec3(.25, .25, .2) * lines;
        col = mix(col, mix(pc, pc * .8, halftone(fc, .25, 4.)), sheet);
      }
    }
    // shut laptop with a small glowing logo
    box(col, fw, px, xc + .02, xc + .34, .14, .34, dh, dh + .022, vec3(.04, .09, .25), vec3(.1, .2, .48), .7);
    vec2 logo = vec2(xAt(xc + .18, .24), yAt(dh + .022, .24));
    col += vec3(.5, .8, 1.) * exp(-length((fw - logo) * vec2(1., 3.)) * 140.) * .8;
    // the menu: a stack of books, spines facing the room; the selected one slides out
    for (int i = 0; i < 8; i++) {
      float fi = float(i);
      if (fi >= uBook.x) break;
      float item = uBook.x - 1. - fi;                        // item 0 is the top book
      float isSel = 1. - step(.5, abs(item - uBook.y));
      float x0 = BK_X0 + bookOff(fi), x1 = BK_X1 + bookOff(fi) - bookTrim(fi);
      float h0 = DESKH + fi * BK_H, h1 = h0 + BK_H * .93;
      float d1 = BK_D1 + isSel * uBook.z * BK_PULL;
      float m4 = mod(fi, 4.);
      vec3 spine = m4 < .5 ? vec3(.05, .12, .36) : m4 < 1.5 ? vec3(.1, .25, .64) : m4 < 2.5 ? vec3(.04, .26, .42) : vec3(.16, .36, .74);
      spine = mix(spine, vec3(.86, .92, 1.), isSel * .9);
      box(col, fw, px, xc + x0, xc + x1, BK_D0, d1, h0, h1, mix(spine, spine * .78, halftone(fc + fi, .3, 5.)), vec3(.7, .78, .95), .5);
      float fx0 = xAt(xc + x0, d1), fx1 = xAt(xc + x1, d1);
      float stripe = band(fw.x, fx0 + (fx1 - fx0) * .03, fx0 + (fx1 - fx0) * .07, px) * band(fw.y, yAt(h0, d1), yAt(h1, d1), px);
      col = mix(col, vec3(.9, .07, .17), stripe * isSel);
    }
    // mug with steam
    box(col, fw, px, xc + .36, xc + .42, .36, .41, dh, dh + .06, vec3(.6, .72, .92), vec3(.75, .85, 1.), .2);
    vec2 mugTop = vec2(xAt(xc + .39, .41), yAt(dh + .06, .41));
    float steamY = fw.y - mugTop.y;
    float steam = (1. - smoothstep(.002, .002 + px, abs(fw.x - mugTop.x - .012 * sin(steamY * 40. - t * 2.)))) * band(steamY, .005, .12, px) * (1. - steamY / .12);
    col += vec3(.5, .7, 1.) * steam * .35;
    // desk lamp: base, stem, shade, bulb
    box(col, fw, px, lampX - .05, lampX + .05, lampD - .03, lampD + .03, dh, dh + .015, vec3(.02, .05, .15), vec3(.12, .25, .55), .4);
    box(col, fw, px, lampX - .008, lampX + .008, lampD - .008, lampD + .008, dh, dh + .26, vec3(.03, .07, .2), vec3(.08, .16, .4), 0.);
    box(col, fw, px, lampX - .16, lampX + .01, lampD - .02, lampD + .02, dh + .245, dh + .275, vec3(.04, .09, .26), vec3(.1, .2, .5), .3);
    vec2 bulb = vec2(xAt(lampX - .1, lampD + .02), yAt(dh + .24, lampD + .02));
    col += vec3(.7, .9, 1.) * exp(-length((fw - bulb) * vec2(1., 2.)) * 60.) * .9;

    // chair, pushed out to the side as if someone just got up
    vec3 chF = vec3(.01, .025, .08), chT = vec3(.05, .11, .3);
    float cx0 = xc + .42;
    box(col, fw, px, cx0 + .1, cx0 + .13, .62, .65, 0., .16, chF, chF, 0.);
    box(col, fw, px, cx0 - .04, cx0 + .27, .55, .72, .015, .028, chF, chT, .2);
    box(col, fw, px, cx0 - .02, cx0 + .25, .52, .74, .16, .195, vec3(.02, .045, .14), vec3(.08, .17, .42), .6);
    box(col, fw, px, cx0 - .01, cx0 + .24, .72, .755, .195, .4, mix(vec3(.02, .05, .16), vec3(.02, .05, .16) * .6, halftone(fc + 3., .5, 5.)), vec3(.1, .2, .5), .8);
  }

  // ---------- plant on the windowsill ----------
  {
    float sx = gx.x + .12, sh0 = SILL - FR - FLOORY;               // sill height above the floor
    box(col, fw, px, sx - .045, sx + .045, .0, .06, sh0, sh0 + .07, vec3(.15, .3, .7), vec3(.2, .38, .8), .3);
    vec2 pl = vec2(xAt(sx, .03), yAt(sh0 + .07, .03));
    for (int i = 0; i < 6; i++) {
      float ang = -1.2 + float(i) * .48 + .05 * sin(t * .7 + float(i));
      vec2 dir = vec2(sin(ang), cos(ang));
      vec2 q = fw - pl - dir * .055;
      vec2 lq = vec2(dot(q, vec2(dir.y, -dir.x)), dot(q, dir));
      float leaf = smoothstep(1., .88, length(lq / vec2(.017, .06)));
      col = mix(col, mix(vec3(.04, .2, .3), vec3(.2, .6, .65), .35 + .6 * glowAt), leaf);
    }
  }

  // ---------- pinboard on the wall right of the window (the facts are pinned here) ----------
  {
    float px0 = gx.y + FR + CURTW + ${f(G.PB_GAP)}, px1 = px0 + ${f(G.PB_W)}, py0 = ${f(G.PB_Y0)}, py1 = ${f(G.PB_Y1)};
    float frameB = rectBand(fw, px0, px1, py0, py1, px);
    float inner = rectBand(fw, px0 + .025, px1 - .025, py0 + .025, py1 - .025, px);
    vec3 cork = mix(vec3(.03, .07, .2), vec3(.06, .13, .34), noise(fw * 60.) * .6 + glowW * .4);
    cork = mix(cork, cork * .65, halftone(fc + 5., .5, 4.));
    col = mix(col, vec3(.08, .17, .42) + vec3(.1, .2, .45) * glowW, frameB * (1. - inner));
    col = mix(col, cork, inner);
  }

  // hover glow from the page (wall-plane coords)
  col += vec3(.3, .55, 1.) * uSpot.z * exp(-length(fw - uSpot.xy) * 9.) * .35;

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
      mouse: gl.getUniformLocation(prog, 'uMouse'), scale: gl.getUniformLocation(prog, 'uScale'), cam: gl.getUniformLocation(prog, 'uCam'), spot: gl.getUniformLocation(prog, 'uSpot'), book: gl.getUniformLocation(prog, 'uBook') };

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
      const c = window.sceneCam || { x: 0, y: 0, z: 1 };
      gl.uniform4f(U.cam, c.x, c.y, c.z, c.r || 0);
      const sp = window.sceneSpot || { x: 0, y: 0, z: 0 };
      gl.uniform3f(U.spot, sp.x, sp.y, sp.z);
      const bk = window.sceneBooks || { n: 0, sel: -1, pull: 0 };
      gl.uniform4f(U.book, bk.n, bk.sel, bk.pull, 0);
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
  window.sceneMouse = mouse;   // shared so page elements can follow the same parallax
  (function ease() { mouse.x += (target.x - mouse.x) * .05; mouse.y += (target.y - mouse.y) * .05; requestAnimationFrame(ease); })();
  const t0 = performance.now();

  const has = (...c) => c.some((x) => document.body.classList.contains(x));
  makeScene('night-gl', NIGHT, () => has('st-home', 'st-press', 'st-intro'));
  makeScene('sea-gl', SEA, () => has('st-menu', 'st-out', 'st-sub', 'st-leave'));
})();
