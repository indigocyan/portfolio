// Small shared helpers: DOM building, animation, dates, moon phase, settings.

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === '') continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstChild;
}

export const filled = (o) => !!o && Object.values(o).some((v) => String(v ?? '').trim());
export const range = (a, b) => [a, b].filter(Boolean).join(' – ');
export const pretty = (u) => String(u || '').replace(/^(https?:\/\/(www\.)?|mailto:|tel:)/, '').replace(/\/$/, '');
export function safeUrl(u) {
  u = String(u || '').trim();
  if (!u) return null;
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(u)) return 'https://' + u;
  return null;
}
const ROMAN = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function roman(n) {
  if (n <= 0 || n > 39) return String(n);
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}

// ---------------- settings (per visitor, best effort) ----------------
const KEY = 'portfolio-settings';
const defaults = () => ({
  motion: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full',
  font: 'sofia',
  effects: (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || navigator.connection?.saveData ? 'low' : 'high',
});
export const settings = (() => {
  let s = defaults();
  try { Object.assign(s, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
  return s;
})();
export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {} }
export const reduced = () => settings.motion === 'reduced';

// ---------------- animation ----------------
export const EASE_OUT = 'cubic-bezier(.16,.9,.3,1)';
export const EASE_IN = 'cubic-bezier(.7,0,.84,0)';
export const EASE_POP = 'cubic-bezier(.2,1.6,.4,1)';

// Web Animations wrapper. In reduced-motion mode every move collapses to a short fade that keeps
// only the opacity end-points, so choreography code never has to branch.
export function anim(el, frames, opts = {}) {
  if (!el) return Promise.resolve();
  const o = { duration: 400, easing: EASE_OUT, fill: 'both', ...opts };
  if (reduced()) {
    const op = frames.map((f) => ('opacity' in f ? { opacity: f.opacity } : {}));
    const from = op[0].opacity ?? 1, to = op[op.length - 1].opacity ?? 1;
    o.duration = from === to ? 1 : 150; o.delay = Math.min(o.delay || 0, 60); o.easing = 'linear';
    frames = [{ opacity: from }, { opacity: to }];
  }
  const a = el.animate(frames, o);
  return a.finished.catch(() => {});
}
// clear WAAPI fills so CSS takes over again
export function settle(...els) { els.flat().forEach((el) => el?.getAnimations().forEach((a) => a.cancel())); }

// ---------------- dates ----------------
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "2024", "Jun 2024", "June 2024", "06/2024", "2024-06", "2024-06-15" → {y, m, d, key, label}; blanks/"Present" → null
export function parseDate(s) {
  s = String(s || '').trim();
  const y = s.match(/\b(19|20)\d{2}\b/);
  if (!y) return null;
  const year = +y[0];
  let m = 0, d = 0;
  const name = s.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
  if (name) {
    m = MONTHS.findIndex((x) => x.toLowerCase() === name[1]) + 1;
    const dd = s.replace(y[0], '').match(/\b([0-3]?\d)\b/);
    if (dd && +dd[1] >= 1 && +dd[1] <= 31) d = +dd[1];
  } else {
    const iso = s.match(/\b(?:19|20)\d{2}[\/.-](\d{1,2})(?:[\/.-](\d{1,2}))?\b/);
    const us = s.match(/\b(\d{1,2})[\/.-](19|20)\d{2}\b/);
    if (iso && +iso[1] >= 1 && +iso[1] <= 12) { m = +iso[1]; if (iso[2]) d = +iso[2]; }
    else if (us && +us[1] >= 1 && +us[1] <= 12) m = +us[1];
  }
  return { y: year, m, d, key: year * 10000 + m * 100 + d, label: (m ? MONTHS[m - 1] + ' ' : '') + year };
}
export const isPresent = (s) => /present|now|current/i.test(String(s || ''));
export function years(start, end) {
  const a = parseDate(start); if (!a) return 0;
  const now = new Date();
  const b = isPresent(end) || !end ? { y: now.getFullYear(), m: now.getMonth() + 1 } : parseDate(end);
  if (!b) return 0;
  return Math.max(0, Math.round(((b.y - a.y) * 12 + ((b.m || 6) - (a.m || 6))) / 12));
}

// ---------------- moon ----------------
const SYNODIC = 29.530588853;
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
export function moonPhase(date = new Date()) {
  const days = (date.getTime() - NEW_MOON) / 86400000;
  return ((days / SYNODIC) % 1 + 1) % 1;   // 0 new → .5 full → 1 new
}
const PHASES = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
export const phaseName = (p) => PHASES[Math.round(p * 8) % 8];
// SVG path of the lit part of a moon of radius r centred on 0,0
export function moonLitPath(p, r) {
  const k = Math.cos(p * 2 * Math.PI), rx = Math.abs(k) * r;
  const waxing = p < .5;
  const outer = waxing ? 1 : 0;
  const term = waxing ? (k > 0 ? 0 : 1) : (k > 0 ? 1 : 0);
  return `M0,${-r}A${r},${r} 0 0 ${outer} 0,${r}A${rx.toFixed(2)},${r} 0 0 ${term} 0,${-r}Z`;
}
export function timeOfDay(d = new Date()) {
  const hr = d.getHours();
  if (hr < 5) return 'Late Night';
  if (hr < 7) return 'Early Morning';
  if (hr < 11) return 'Morning';
  if (hr < 12) return 'Lunchtime';
  if (hr < 16) return 'Afternoon';
  if (hr < 18) return 'After School';
  if (hr < 23) return 'Evening';
  return 'Late Night';
}

// ---------------- display typefaces ----------------
// Display faces: condensed heavy italics from Google Fonts, in the spirit of the game's menu lettering.
// `q` is the Google Fonts css2 family query; `stretch` pins a width axis where the font has one.
export const FONTS = {
  sofia:   { name: 'Sofia Sans Extra Condensed', family: "'Sofia Sans Extra Condensed'", q: 'Sofia+Sans+Extra+Condensed:ital,wght@0,800;0,900;1,800;1,900', note: 'Very tall, sharp cuts, true italic' },
  fira:    { name: 'Fira Sans Extra Condensed', family: "'Fira Sans Extra Condensed'", q: 'Fira+Sans+Extra+Condensed:ital,wght@0,800;0,900;1,800;1,900', note: 'Crisp and technical, true italic' },
  pathway: { name: 'Pathway Extreme', family: "'Pathway Extreme'", q: 'Pathway+Extreme:ital,wdth,wght@0,75..100,800..900;1,75..100,800..900', stretch: '75%', note: 'Punchy grotesque, true italic' },
  mohave:  { name: 'Mohave', family: "'Mohave'", q: 'Mohave:ital,wght@0,700;1,700', note: 'Clean display caps, true italic' },
  kanit:   { name: 'Kanit', family: "'Kanit'", q: 'Kanit:ital,wght@0,900;1,800;1,900', note: 'Sporty and heavy, wide, true italic' },
  teko:    { name: 'Teko', family: "'Teko'", q: 'Teko:wght@600;700', note: 'Squared sci-fi, slanted by the browser' },
  archivo: { name: 'Archivo Extra Condensed', family: "'Archivo'", q: 'Archivo:ital,wdth,wght@0,62..125,700..900;1,62..125,700..900', stretch: '62.5%', note: 'Tall, tight, true italic' },
  barlow:  { name: 'Barlow Condensed', family: "'Barlow Condensed'", q: 'Barlow+Condensed:ital,wght@0,800;1,700;1,800;1,900', note: 'Friendly, rounded, true italic' },
  roboto:  { name: 'Roboto Condensed', family: "'Roboto Condensed'", q: 'Roboto+Condensed:ital,wght@0,800;1,700;1,800;1,900', note: 'Neutral, true italic' },
  saira:   { name: 'Saira Extra Condensed', family: "'Saira Extra Condensed'", q: 'Saira+Extra+Condensed:wght@700;800;900', note: 'Squared, techy, slanted by the browser' },
  anton:   { name: 'Anton', family: "'Anton'", q: 'Anton', note: 'Poster-heavy, slanted by the browser' },
  oswald:  { name: 'Oswald', family: "'Oswald'", q: 'Oswald:wght@600;700', note: 'Classic condensed, slanted by the browser' },
  bigshoulders: { name: 'Big Shoulders Display', family: "'Big Shoulders Display'", q: 'Big+Shoulders+Display:wght@800;900', note: 'Narrow, angular, slanted by the browser' },
  antonio: { name: 'Antonio', family: "'Antonio'", q: 'Antonio:wght@600;700', note: 'Very narrow, slanted by the browser' },
};
export const DEFAULT_FONT = 'sofia';
// small labels (tabs, dates, prompts, tags) always use this face, paired with the display face
export const LABEL_FONT = { name: 'Fira Sans Extra Condensed', family: "'Fira Sans Extra Condensed'" };
export const fontUrl = (keys) => 'https://fonts.googleapis.com/css2?' + keys.map((k) => 'family=' + FONTS[k].q).join('&') + '&display=swap';
export function applyFont(key) {
  const f = FONTS[key] || FONTS[DEFAULT_FONT];
  key = FONTS[key] ? key : DEFAULT_FONT;
  if (!document.querySelector(`link[data-font="${key}"]`)) {
    document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: fontUrl([key]) }));
    document.head.lastChild.dataset.font = key;
  }
  const root = document.documentElement.style;
  root.setProperty('--display', `${f.family}, 'Arial Narrow', sans-serif`);
  root.setProperty('--stretch', f.stretch || '100%');
  document.documentElement.dataset.font = key;
  return document.fonts?.load(`italic 900 40px ${f.family}`).catch(() => {});
}
