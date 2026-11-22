'use strict';

// ================= config =================
// each menu entry is a submenu that pulls rows from one or more data groups
const SECTIONS = [
  { id: 'profile',      label: 'Profile',      groups: ['profile', 'contact'],          guide: 'About me & contact',       ask: 'What would you like to know?' },
  { id: 'education',    label: 'Education',    groups: ['education', 'certifications'], guide: 'Schools & certifications', ask: 'Which entry do you want to view?' },
  { id: 'experience',   label: 'Experience',   groups: ['experience', 'projects'],      guide: 'Work & projects',          ask: 'Which entry do you want to view?' },
  { id: 'skills',       label: 'Skills',       groups: ['skills'],                      guide: 'Skills',                   ask: 'Which skill do you want to view?' },
  { id: 'achievements', label: 'Achievements', groups: ['achievements'],                guide: 'Awards & milestones',      ask: 'Which achievement do you want to view?' },
  { id: 'timeline',     label: 'Timeline',     groups: ['timeline'],                    guide: 'Milestones by date',       ask: 'Which milestone do you want to view?' },
  { id: 'socials',      label: 'Socials',      groups: ['socials'],                     guide: 'Find me online',           ask: 'Where do you want to find me?' },
];
const GROUP_LABELS = { profile: 'Details', contact: 'Contact', education: 'Education', certifications: 'Certifications', experience: 'Work',
  projects: 'Projects', skills: 'Skills', achievements: 'Achievements', socials: 'Social links', timeline: 'Your own milestones' };
// irregular zig-zag of the menu lines (in em)
const X_OFFSETS = [0, .62, .36, .04, .7, .3, .24, -.04, .36];

const LIST_FIELDS = {
  skills:         [['name', 'Skill'], ['level', 'Level (1-10)', 'number']],
  experience:     [['title', 'Title'], ['company', 'Company'], ['start', 'Start'], ['end', 'End'], ['location', 'Location'], ['description', 'Description', 'textarea']],
  education:      [['school', 'School'], ['degree', 'Degree'], ['field', 'Field of study'], ['start', 'Start'], ['end', 'End'], ['description', 'Description', 'textarea']],
  projects:       [['name', 'Name'], ['link', 'Link (https://…)'], ['description', 'Description', 'textarea']],
  certifications: [['name', 'Name'], ['issuer', 'Issuer'], ['date', 'Date'], ['link', 'Credential link']],
  achievements:   [['title', 'Title'], ['event', 'Event / awarded by'], ['date', 'Date'], ['description', 'Description', 'textarea'], ['link', 'Link (optional)']],
  socials:        [['platform', 'Platform', 'platform'], ['handle', 'Handle / display name'], ['url', 'Profile URL']],
  timeline:       [['date', 'Date (e.g. Jun 2024)'], ['title', 'Milestone'], ['description', 'Description', 'textarea']],
};
const OBJECT_FIELDS = {
  profile: { key: 'profile', fields: [['name', 'Name'], ['headline', 'Headline'], ['location', 'Location'], ['pronouns', 'Pronouns'], ['about', 'About', 'textarea']] },
  contact: { key: 'contact', fields: [['email', 'Email'], ['phone', 'Phone (optional)']] },
};
const MONO = { linkedin: 'in', github: 'GH', instagram: 'IG', x: 'X', twitter: 'X', youtube: 'YT', behance: 'Bē', dribbble: 'Dr',
  medium: 'M', leetcode: 'LC', discord: 'DC', website: 'WWW' };

// ================= state =================
let data = null, draft = null;
let canEdit = false, editing = false;
let visible = [], sel = 0;
let rows = [], rowSel = 0;
let state = 'intro';
let busy = false;

const $ = (s) => document.querySelector(s);
const body = document.body;
const menuEl = $('#menu');
const listEl = $('#sub-list');

// ================= helpers =================
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false || kid === '') continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
function svg(markup) { const t = document.createElement('template'); t.innerHTML = markup.trim(); return t.content.firstChild; }
function safeUrl(u) {
  u = String(u || '').trim();
  if (!u) return null;
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(u)) return 'https://' + u;
  return null;
}
const pretty = (u) => String(u || '').replace(/^(https?:\/\/(www\.)?|mailto:|tel:)/, '').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const range = (a, b) => [a, b].filter(Boolean).join(' – ');
const filled = (o) => o && Object.values(o).some((v) => String(v ?? '').trim());
const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
const breakable = (s) => String(s).replace(/([/.@])/g, '$1​');
const mono = (p) => MONO[String(p || '').toLowerCase()] || String(p || '?').slice(0, 2).toUpperCase();
const sectionIndex = (id) => visible.findIndex((s) => s.id === id);

// ================= timeline =================
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// accepts "2024", "Jun 2024", "June 2024", "06/2024", "2024-06"; returns null for blanks and "Present"
function parseDate(s) {
  s = String(s || '').trim();
  const y = s.match(/\b(19|20)\d{2}\b/);
  if (!y) return null;
  const year = +y[0];
  let m = 0;
  const name = s.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
  if (name) m = MONTHS.findIndex((x) => x.toLowerCase() === name[1]) + 1;
  else { const num = s.match(/\b(\d{1,2})[\/.-](19|20)\d{2}\b/) || s.match(/\b(?:19|20)\d{2}[\/.-](\d{1,2})\b/); if (num && +num[1] >= 1 && +num[1] <= 12) m = +num[1]; }
  return { y: year, m, key: year * 100 + m, label: m ? `${MONTHS[m - 1]} ${year}` : String(year) };
}

// everything dated across the profile, plus hand-added milestones, newest first
function timelineItems(d) {
  const out = [];
  const add = (date, title, kind, detail) => { const p = parseDate(date); if (p && title) out.push({ ...p, title, kind, detail }); };
  (d.education || []).filter(filled).forEach((e) => {
    add(e.start, `Started ${e.degree || 'at'} ${e.degree ? '· ' + e.school : e.school}`, 'Education', [e.field, e.description].filter(Boolean).join('\n'));
    if (!/present|now|current/i.test(e.end || '')) add(e.end, `Graduated · ${e.school}`, 'Education', [e.degree, e.field].filter(Boolean).join(', '));
  });
  (d.experience || []).filter(filled).forEach((e) => add(e.start, [e.title, e.company].filter(Boolean).join(' · '), 'Work', e.description));
  (d.achievements || []).filter(filled).forEach((e) => add(e.date, e.title, 'Award', [e.event, e.description].filter(Boolean).join('\n')));
  (d.certifications || []).filter(filled).forEach((e) => add(e.date, `Certified · ${e.name}`, 'Certification', e.issuer));
  (d.timeline || []).filter(filled).forEach((e) => add(e.date, e.title, 'Milestone', e.description));
  return out.sort((a, b) => b.key - a.key);
}

// true only for an actual mouse movement, and not right after a selection change reflowed the layout
let lastPick = 0;
function realMove(e) {
  if (e.pointerType !== 'mouse' || !(e.movementX || e.movementY)) return false;
  const now = performance.now();
  if (now - lastPick < 90) return false;
  lastPick = now;
  return true;
}

function setState(s) {
  state = s;
  body.classList.remove('st-intro', 'st-press', 'st-home', 'st-menu', 'st-out', 'st-sub', 'st-leave');
  body.classList.add('st-' + s);
}
const setHash = (id) => { try { history.replaceState(null, '', id ? '#' + id : location.pathname + location.search); } catch {} };

function groupHasContent(g, d) {
  if (g === 'profile') return true;
  if (g === 'contact') return filled(d.contact);
  if (g === 'timeline') return timelineItems(d).length > 0;
  return (d[g] || []).some(filled);
}
const hasContent = (id, d) => SECTIONS.find((s) => s.id === id).groups.some((g) => groupHasContent(g, d));
function refreshVisible() {
  const src = editing ? draft : data;
  visible = SECTIONS.filter((s) => editing || hasContent(s.id, src));
  sel = Math.max(0, Math.min(sel, visible.length - 1));
}

// ================= background fx =================
function spawnFx() {
  const fx = $('#fx');
  const small = innerWidth < 860 || body.classList.contains('lite');
  for (let i = 0; i < (small ? 24 : 46); i++) {
    const s = Math.random() < .15 ? 26 + Math.random() * 22 : 5 + Math.random() * 18;
    fx.append(h('i', { class: 'bub', style:
      `left:${Math.random() * 100}%;width:${s}px;height:${s}px;animation-duration:${8 + Math.random() * 12}s;` +
      `animation-delay:${-Math.random() * 20}s;--sway:${(Math.random() * 70 - 35).toFixed(0)}px` }));
  }
  for (let i = 0; i < (small ? 12 : 26); i++) {
    fx.append(h('i', { class: 'shard' + (Math.random() < .35 ? ' dark' : ''), style:
      `left:${Math.random() * 100}%;top:${Math.random() * 100}%;--s:${8 + Math.random() * 18}px;--r:${Math.random() * 360}deg;` +
      `--dx:${(Math.random() * 60 - 30).toFixed(0)}px;--dy:${(Math.random() * 60 - 30).toFixed(0)}px;` +
      `animation-duration:${5 + Math.random() * 6}s;animation-delay:${-Math.random() * 6}s` }));
  }
}

// ================= bubble transition =================
// A column of water surges up through the screen: pale foam cap and trailing foam fingers on its
// leading edge, cel-shaded bubbles rising around it and lingering after it passes. `mid` swaps the
// scene while the column fully covers the screen.
const rnd = (a, b) => a + Math.random() * (b - a);
const SURGE_MID = 660;   // ms into the sweep when the tilted column covers the screen (checked by sampling)
async function bubbles(mid) {
  const sp = $('#splash');
  const lite = body.classList.contains('lite');
  sp.classList.remove('go');
  const surge = h('div', { class: 'surge' }, h('div', { class: 'surge-body' }));
  // foam cap: overlapping pale blobs riding the leading edge
  for (let x = 40; x < 260; x += lite ? 14 : 8) {
    const w = rnd(12, 26);
    surge.append(h('i', { class: 'foam', style: `left:${x + rnd(-3, 3)}vmax;width:${w}vmax;height:${w * rnd(.55, .8)}vmax` }));
  }
  // foam fingers trailing down from the edge
  for (let i = 0; i < (lite ? 8 : 20); i++) {
    surge.append(h('i', { class: 'finger', style: `left:${rnd(70, 205)}vmax;width:${rnd(2.5, 7)}vmax;height:${rnd(28, 75)}vh` }));
  }
  // scalloped trailing edge
  for (let x = 40; x < 260; x += lite ? 16 : 10) {
    const w = rnd(14, 24);
    surge.append(h('i', { class: 'tail', style: `left:${x + rnd(-3, 3)}vmax;width:${w}vmax;height:${w * .7}vmax` }));
  }
  const kids = [surge];
  for (let i = 0; i < (lite ? 14 : 46); i++) {
    const s = Math.random() < .2 ? rnd(40, 110) : rnd(8, 40);
    kids.push(h('i', { class: 'bub2' + (Math.random() < .45 ? ' ring' : ''), style:
      `left:${rnd(-45, 90)}vw;width:${s}px;height:${s}px;--dur:${rnd(1.1, 2.1).toFixed(2)}s;--d:${rnd(0, .75).toFixed(2)}s;` +
      `--rise:${-rnd(115, 175).toFixed(0)}vh;--drift:${rnd(30, 70).toFixed(0)}vh;--sway:${rnd(-40, 40).toFixed(0)}px` }));
  }
  sp.replaceChildren(...kids);
  void sp.offsetWidth;
  sp.classList.add('go');
  await sleep(SURGE_MID);               // column now covers the whole screen
  await mid();
  clearTimeout(bubbles.t);
  bubbles.t = setTimeout(() => { sp.classList.remove('go'); sp.replaceChildren(); }, 2500);
}

// ================= ring transition (first load only) =================
// Concentric discs bloom from the centre until they cover the screen, `mid` swaps the scene, then an
// iris opens from the centre (an animated mask) with outline ripples riding its edge.
const RING_MID = 900;     // ms: the last disc has landed and the screen is covered
async function rings(mid) {
  const sp = $('#splash');
  const lite = body.classList.contains('lite');
  const R = Math.hypot(innerWidth, innerHeight) / 2 + 4;          // centre to corner
  const n = lite ? 5 : 7;
  // inner → outer; every other band gets a halftone screen or a pale outline
  const palette = ['#030a2c', '#1636d6', '#071650', '#2f62e6', '#0b2196', '#3cd0ff', '#06175e'];
  const wrap = h('div', { class: 'rings' });
  for (let i = 0; i < n; i++) {
    const kind = i % 3 === 2 ? ' dotted' : i % 2 === 1 ? ' lined' : '';
    wrap.append(h('i', { class: 'disc' + (lite ? '' : kind), style:
      `--f:${((i + 1) / n * (i === n - 1 ? 1.02 : 1)).toFixed(3)};--i:${i};--d:${i * (lite ? 90 : 70)}ms;background-color:${palette[i % palette.length]}` }));
  }
  if (!lite) {
    wrap.append(h('i', { class: 'spin', style: '--f:.62' }), h('i', { class: 'spin rev', style: '--f:.34' }));
  }
  const edges = (lite ? [0] : [0, 90, 200]).map((d) => h('i', { class: 'ring-edge', style: `--d:${d}ms` }));
  sp.style.setProperty('--R', R.toFixed(0) + 'px');
  sp.replaceChildren(wrap, ...edges);
  sp.classList.add('rings-mode');
  void sp.offsetWidth;
  sp.classList.add('go');
  await sleep(RING_MID);
  await mid();
  clearTimeout(bubbles.t);
  bubbles.t = setTimeout(() => { sp.classList.remove('go', 'rings-mode'); sp.replaceChildren(); }, 1000);
}

// ================= lite mode =================
// fewer effects, no WebGL: chosen automatically on modest hardware, togglable by anyone
const LITE_KEY = 'portfolio-lite';
function autoLite() {
  const n = navigator;
  return !!((n.deviceMemory && n.deviceMemory <= 4) || (n.hardwareConcurrency && n.hardwareConcurrency <= 4) ||
    n.connection?.saveData || matchMedia('(prefers-reduced-motion: reduce)').matches);
}
function setLite(on, remember) {
  body.classList.toggle('lite', on);
  const b = $('#lite-toggle');
  b.setAttribute('aria-pressed', String(on));
  b.querySelector('b').textContent = on ? 'ON' : 'OFF';
  if (remember) { try { localStorage.setItem(LITE_KEY, on ? '1' : '0'); } catch {} }
}
(function initLite() {
  let saved = null;
  try { saved = localStorage.getItem(LITE_KEY); } catch {}
  setLite(saved === null ? autoLite() : saved === '1', false);
  $('#lite-toggle').addEventListener('click', () => { setLite(!body.classList.contains('lite'), true); if (state === 'press') setTimeout(updatePressMask, 30); toast(body.classList.contains('lite') ? 'Lite mode on: fewer effects' : 'Lite mode off: full effects'); });
})();

async function goHome() {
  if (busy || state === 'home') return;
  busy = true;
  await bubbles(() => { renderHome(); setState('home'); setHash(''); });
  setTimeout(() => $('#title-menu .tm.sel')?.focus({ preventScroll: true }), 300);
  busy = false;
}

async function goMenu() {
  if (busy || state !== 'home') return;
  busy = true;
  await bubbles(() => { setState('menu'); buildMenu(true); });
  busy = false;
}

// jump from Home straight into a submenu (the bubbles cover the swap)
async function goSection(id) {
  if (busy) return;
  busy = true;
  await bubbles(() => {
    refreshVisible();
    const i = sectionIndex(id);
    sel = i >= 0 ? i : 0;
    buildMenu(false);
    $('#sub').classList.remove('swap-in', 'swap-out');
    renderSub();
    setState('sub');
    setGuide(visible[sel].ask);
    setHash(visible[sel].id);
  });
  (listEl.querySelector('.row.sel') || listEl).focus({ preventScroll: true });
  busy = false;
}

function setGuide(text) {
  const g = $('#guide-text');
  if (g.textContent === text) return;
  g.textContent = text;
  restart(g, 'swap');
}

// ================= home (title screen) =================
let homeItems = [], homeSel = 0;

function renderHome() {
  refreshVisible();
  const d = data, p = d.profile || {};
  const words = String(p.name || '').trim().split(/\s+/);
  $('#logo-top').textContent = words[0] || '';
  $('#logo-bot').textContent = words.slice(1).join(' ');
  $('#logo-bot').parentElement.hidden = words.length < 2;
  $('#logo-sub').textContent = p.headline || '';

  // compact facts, bottom left
  const list = (k) => (d[k] || []).filter(filled);
  const edu = list('education')[0], job = list('experience')[0], socials = list('socials');
  const items = [
    edu && ['Studying', [edu.degree, edu.field].filter(Boolean).join(' · ') || edu.school, edu.degree || edu.field ? edu.school : '', 'education'],
    job && ['Working', job.title, job.company, 'experience'],
    p.location && ['Based in', p.location, '', 'profile'],
    d.contact?.email && ['Email', breakable(d.contact.email), '', null, 'mailto:' + d.contact.email],
  ].filter(Boolean);
  const rowsEl = items.map(([k, v, sub, sectionId, href], i) => {
    const inner = [h('span', { class: 'gl-k' }, k), h('span', { class: 'gl-v' }, v, sub ? h('small', null, sub) : null)];
    if (href) return h('a', { class: 'gl-row', href, style: `--i:${i}` }, ...inner);
    return h('button', { class: 'gl-row', type: 'button', style: `--i:${i}`, onclick: () => goSection(sectionId) }, ...inner);
  });
  if (socials.length) rowsEl.push(h('div', { class: 'gl-row gl-socials', style: `--i:${rowsEl.length}` }, h('span', { class: 'gl-k' }, 'Socials'),
    h('span', { class: 'gl-chips' }, socials.map((s) => { const href = safeUrl(s.url); return href ? h('a', { class: 'chip', href, target: '_blank', rel: 'noopener noreferrer', title: s.platform, 'aria-label': s.platform }, mono(s.platform)) : null; }))));
  $('#glance-list').replaceChildren(...rowsEl);

  // title menu, bottom right
  homeItems = [{ label: 'Start', act: goMenu }, ...visible.map((s) => ({ label: s.label, act: () => goSection(s.id) }))];
  homeSel = Math.min(homeSel, homeItems.length - 1);
  $('#title-menu').replaceChildren(...homeItems.map((it, i) => h('button', { class: 'tm', type: 'button', style: `--i:${i}`,
    onpointermove: (e) => { if (state === 'home' && homeSel !== i && realMove(e)) selectHome(i); },
    onclick: () => { if (state !== 'home') return; selectHome(i); it.act(); } }, h('span', null, it.label))));
  selectHome(homeSel, true);
}

function selectHome(i, quiet) {
  homeSel = (i + homeItems.length) % homeItems.length;
  $('#title-menu').querySelectorAll('.tm').forEach((b, j) => { b.classList.toggle('sel', j === homeSel); b.setAttribute('aria-current', j === homeSel ? 'true' : 'false'); });
  if (!quiet) $('#title-menu').querySelectorAll('.tm')[homeSel]?.focus({ preventScroll: true });
}

// first screen of a visit: "press any key" over the night window
// The moon sits where the night shader draws it (same constants as scene.js), or where the CSS moon is
// in Lite mode / without WebGL. The blue outline copy is shown only inside that disc.
function moonDisc() {
  const gl = !body.classList.contains('lite') && $('.night').classList.contains('gl-on');
  if (!gl) { const m = $('.moon').getBoundingClientRect(); return { x: m.left + m.width / 2, y: m.top + m.height / 2, r: m.width / 2 }; }
  const W = innerWidth, H = innerHeight, portrait = W < H;
  const mc = portrait ? [-.05, .2] : [-.2, .19], R = portrait ? .2 : .25;
  return { x: W / 2 + mc[0] * H, y: H / 2 - mc[1] * H, r: R * H };
}
function updatePressMask() {
  const big = $('#press-big'), blue = $('#press-blue');
  if (!big.childNodes.length) return;
  blue.replaceChildren(...[...big.childNodes].map((n) => n.cloneNode(true)));
  blue.style.top = big.offsetTop + 'px';
  const m = moonDisc(), b = blue.getBoundingClientRect();
  const r = m.r * 1.03;   // include the bright rim of the glow
  const mask = `radial-gradient(circle at ${(m.x - b.left).toFixed(1)}px ${(m.y - b.top).toFixed(1)}px, #000 ${r.toFixed(1)}px, transparent ${(r + 6).toFixed(1)}px)`;
  blue.style.webkitMaskImage = blue.style.maskImage = mask;
}
addEventListener('resize', () => { if (state === 'press') updatePressMask(); });

function showPress() {
  const touch = matchMedia('(hover: none)').matches;
  $('#press-small').textContent = data.profile?.name ? `${data.profile.name} · Portfolio` : 'Portfolio';
  $('#press-big').replaceChildren(...(touch ? ['TAP', 'TO', 'START'] : ['PRESS', 'ANY', 'KEY']).flatMap((w, i) => i ? [h('br'), w] : [w]));
  setState('press');
  // re-measure once the scene (and fonts) have settled: the shader starts lazily
  requestAnimationFrame(updatePressMask);
  setTimeout(updatePressMask, 400);
  setTimeout(updatePressMask, 1200);
}
async function leavePress() {
  if (state !== 'press' || busy) return;
  busy = true;
  try { sessionStorage.setItem('seenPress', '1'); } catch {}
  await bubbles(() => { renderHome(); setState('home'); setHash(''); });
  setTimeout(() => $('#title-menu .tm.sel')?.focus({ preventScroll: true }), 300);
  busy = false;
}
['keydown', 'pointerdown'].forEach((ev) => document.addEventListener(ev, (e) => {
  if (state !== 'press' || e.target.closest?.('.owner')) return;
  if (ev === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
  e.preventDefault();
  leavePress();
}));

// ================= main menu =================
function buildMenu(cascade) {
  refreshVisible();
  menuEl.replaceChildren(...visible.map((s, i) => h('button', {
    class: 'mi', type: 'button', style: `--i:${i};--x:${X_OFFSETS[i % X_OFFSETS.length]}`,
    onpointermove: (e) => { if (state === 'menu' && sel !== i && realMove(e)) select(i); },
    onclick: () => { if (state !== 'menu') return; if (sel !== i) select(i); confirm(); },
  },
    h('span', { class: 'mi-red' }),
    h('span', { class: 'mi-white' }),
    h('span', { class: 'mi-tip' }, svg('<svg viewBox="0 0 10 14" preserveAspectRatio="none"><polygon points="1,13 9,1 7,13" fill="none" stroke="#ff5fae" stroke-width="1.1" vector-effect="non-scaling-stroke"/></svg>')),
    h('span', { class: 'mi-t' }, s.label))));
  if (cascade) { menuEl.classList.add('cascade'); setTimeout(() => menuEl.classList.remove('cascade'), visible.length * 28 + 400); }
  select(sel, true);
}

function select(i, quiet) {
  sel = (i + visible.length) % visible.length;
  menuEl.querySelectorAll('.mi').forEach((b, j) => {
    b.classList.toggle('sel', j === sel);
    b.setAttribute('aria-current', j === sel ? 'true' : 'false');
  });
  const g = $('#guide-text');
  g.textContent = visible[sel].guide;
  if (!quiet) restart(g, 'swap');
}

async function confirm() {
  if (state !== 'menu' || busy) return;
  busy = true;
  $('#sub').classList.remove('swap-in', 'swap-out');
  renderSub();
  setState('out');           // menu rushes at the camera, dark panel sweeps
  await sleep(330);
  setState('sub');           // white panel, giant title, rows slide in
  setGuide(visible[sel].ask);
  setHash(visible[sel].id);
  await sleep(380);
  (listEl.querySelector('.row.sel') || listEl).focus({ preventScroll: true });
  busy = false;
}

async function back() {
  if (state !== 'sub' || switching || busy) return;
  busy = true;
  setState('leave');         // rows/title/white panel exit left
  await sleep(260);
  buildMenu(false);
  setState('menu');
  restart(body, 'st-back');  // menu settles back from slightly large
  setTimeout(() => body.classList.remove('st-back'), 360);
  menuEl.querySelectorAll('.mi')[sel]?.focus({ preventScroll: true });
  setHash('menu');
  busy = false;
}

// switch sections from inside a submenu (tabs / arrow keys): content slides out one way, in from the other
let switching = false;
async function switchSection(dir) {
  if (state !== 'sub' || switching || busy || visible.length < 2) return;
  switching = true;
  const sub = $('#sub');
  sub.style.setProperty('--dir', dir);
  sub.classList.remove('swap-in');
  sub.classList.add('swap-out');
  await sleep(180);
  select(sel + dir, true);
  renderSub();
  setGuide(visible[sel].ask);
  sub.classList.remove('swap-out');
  restart(sub, 'swap-in');
  (listEl.querySelector('.row.sel') || listEl).focus({ preventScroll: true });
  setHash(visible[sel].id);
  switching = false;
}

// ================= submenu =================
const rowsFor = (id, d) => SECTIONS.find((s) => s.id === id).groups.flatMap((g) => groupRows(g, d));

function groupRows(id, d) {
  const p = d.profile || {};
  const list = (k) => (d[k] || []).filter(filled);
  switch (id) {
    case 'profile':
      return [['Name', p.name], ['Headline', p.headline], ['Location', p.location], ['Pronouns', p.pronouns], ['About', p.about]]
        .filter((r) => r[1]).map(([k, v]) => ({ tag: k, main: v, detail: v }));
    case 'contact': {
      const c = d.contact || {};
      return [['Email', c.email, c.email && 'mailto:' + c.email], ['Phone', c.phone, c.phone && 'tel:' + c.phone.replace(/[^\d+]/g, '')]]
        .filter((r) => r[1]).map(([k, v, href]) => ({ tag: k, main: v, href, link: true }));
    }
    case 'education':
      return list('education').map((e) => ({ tag: e.degree || 'School', main: e.school, side: range(e.start, e.end),
        detail: [[e.degree, e.field].filter(Boolean).join(', '), range(e.start, e.end), e.description].filter(Boolean).join('\n') }));
    case 'certifications':
      return list('certifications').map((e) => ({ tag: e.issuer || 'Certification', main: e.name, side: e.date, href: safeUrl(e.link),
        detail: [e.issuer, e.date].filter(Boolean).join(' · ') }));
    case 'experience':
      return list('experience').map((e) => ({ tag: e.company || 'Role', main: e.title, side: range(e.start, e.end),
        detail: [e.company, [e.location, range(e.start, e.end)].filter(Boolean).join(' · '), e.description].filter(Boolean).join('\n') }));
    case 'projects':
      return list('projects').map((e) => ({ tag: 'Project', main: e.name, side: pretty(e.link), href: safeUrl(e.link), detail: e.description || '' }));
    case 'skills':
      return list('skills').map((s) => ({ tag: 'Skill', main: s.name, side: s.level ? `${s.level} / 10` : '', detail: s.level ? `Proficiency ${s.level} / 10` : '' }));
    case 'achievements':
      return list('achievements').map((e) => ({ tag: e.event || 'Achievement', main: e.title, side: e.date, href: safeUrl(e.link),
        detail: [e.event, e.date].filter(Boolean).join(' · ') + (e.description ? '\n' + e.description : '') }));
    case 'timeline':
      return timelineItems(d).map((t) => ({ tag: t.label, main: t.title, side: t.kind, detail: t.detail || '', cal: { y: t.y, m: t.m } }));
    case 'socials':
      return list('socials').map((s) => ({ tag: s.platform || 'Link', main: s.handle || pretty(s.url), side: mono(s.platform), href: safeUrl(s.url), link: true }));
  }
  return [];
}

function renderSub() {
  const s = visible[sel];
  const title = $('#sub-title');
  title.textContent = s.label;
  title.style.fontSize = `min(28vh, ${(112 / (s.label.length * 0.5)).toFixed(1)}vw)`;
  const n = visible.length;
  const prev = visible[(sel - 1 + n) % n], next = visible[(sel + 1) % n];
  $('#sub-head').replaceChildren(...[
    n > 2 ? h('button', { class: 'tab', type: 'button', 'aria-label': 'Previous section: ' + prev.label, onclick: () => switchSection(-1) }, '◀ ' + prev.label) : null,
    h('span', { class: 'h-a' }, s.label.toUpperCase()),
    n > 1 ? h('button', { class: 'tab', type: 'button', 'aria-label': 'Next section: ' + next.label, onclick: () => switchSection(1) }, next.label + ' ▶') : null].filter(Boolean));
  body.classList.toggle('editing', editing);
  if (editing) {
    rows = [];
    listEl.replaceChildren(...editorFor(s.id), editorActions());
    return;
  }
  rows = rowsFor(s.id, data);
  rowSel = 0;
  if (!rows.length) rows = [{ tag: '', main: 'Nothing here yet', detail: '' }];
  listEl.replaceChildren(...rows.map((r, i) => h('div', { class: 'row-wrap', style: `--i:${i}` },
    r.tag ? h('span', { class: 'row-tag' }, r.tag) : null,
    h('button', { class: 'row', type: 'button', role: 'option',
      onpointermove: (e) => { if (rowSel !== i && realMove(e)) selectRow(i); },
      onclick: () => { if (rowSel !== i) selectRow(i); else activateRow(); },
    }, h('span', { class: 'row-ico' }), h('span', { class: 'row-main' }, r.link ? breakable(r.main) : r.main), r.side ? h('span', { class: 'row-side' }, r.side) : null))));
  selectRow(0, true);
  document.documentElement.style.setProperty('--list-h', Math.min(listEl.scrollHeight, listEl.clientHeight || listEl.scrollHeight) + 'px');
}

function selectRow(i, quiet) {
  if (!rows.length) return;
  rowSel = (i + rows.length) % rows.length;
  const btns = listEl.querySelectorAll('.row');
  btns.forEach((b, j) => { b.classList.toggle('sel', j === rowSel); b.setAttribute('aria-selected', j === rowSel ? 'true' : 'false'); });
  btns[rowSel]?.scrollIntoView({ block: 'nearest' });
  const r = rows[rowSel];
  const t = $('#sub-detail-text');
  if (r.link && r.href) {
    // link rows: just the link itself, in the plain font
    t.replaceChildren(...[r.tag ? h('span', { class: 'd-tag' }, r.tag) : null,
      h('a', { class: 'd-link', href: r.href, target: r.href.startsWith('http') ? '_blank' : null, rel: 'noopener noreferrer' }, breakable(pretty(r.href)))].filter(Boolean));
  } else {
    const bodyText = h('div', { class: 'd-body' }, r.detail && r.detail !== r.main ? r.detail : '');
    if (r.href) bodyText.append(h('a', { class: 'd-btn', href: r.href, target: '_blank', rel: 'noopener noreferrer' }, 'Open link →'));
    const cal = r.cal ? h('div', { class: 'cal', 'aria-label': r.tag },
      h('span', { class: 'cal-y' }, r.cal.y),
      h('span', { class: 'cal-m' }, MONTHS.map((mm, k) => h('i', { class: !r.cal.m ? 'yr' : k + 1 === r.cal.m ? 'on' : '' }, mm[0])))) : null;
    t.replaceChildren(...[h('div', { class: 'd-head' }, r.main), r.tag ? h('span', { class: 'd-tag' }, r.tag) : null, cal, bodyText].filter(Boolean));
  }
  if (!quiet) restart(t, 'swap');
}

function activateRow() {
  const r = rows[rowSel];
  if (!r?.href) return;
  if (r.href.startsWith('http')) window.open(r.href, '_blank', 'noopener');
  else location.href = r.href;
}

// ================= editor (only when the local server says this is the owner's PC) =================
function fieldInput(obj, [key, label, type]) {
  const onInput = (e) => { obj[key] = type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value; };
  const input = type === 'textarea'
    ? h('textarea', { oninput: onInput })
    : h('input', { type: type === 'number' ? 'number' : 'text', oninput: onInput, list: type === 'platform' ? 'platforms' : null,
        min: type === 'number' ? 0 : null, max: type === 'number' ? 10 : null });
  input.value = obj[key] ?? '';
  return h('label', { class: 'field' }, h('span', null, label), input);
}

function editorFor(sectionId) {
  const groups = SECTIONS.find((s) => s.id === sectionId).groups;
  const note = sectionId === 'timeline' ? h('p', { class: 'ed-note' }, 'Dated entries from Education, Experience, Achievements and Certifications appear here automatically. Add anything else below.') : null;
  return [note, ...groups.flatMap((g) => [groups.length > 1 || sectionId === 'timeline' ? h('h4', { class: 'ed-group' }, GROUP_LABELS[g]) : null, ...groupEditor(g)])].filter(Boolean);
}

function groupEditor(id) {
  if (OBJECT_FIELDS[id]) {
    const { key, fields } = OBJECT_FIELDS[id];
    draft[key] = draft[key] || {};
    return [h('div', { class: 'form-item' }, fields.map((f) => fieldInput(draft[key], f)))];
  }
  const fields = LIST_FIELDS[id];
  const list = draft[id] = draft[id] || [];
  const items = list.map((item, i) => h('div', { class: 'form-item' },
    fields.map((f) => fieldInput(item, f)),
    h('div', { class: 'item-tools' },
      h('button', { class: 'btn', type: 'button', disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; renderSub(); } }, '▲ Up'),
      h('button', { class: 'btn', type: 'button', disabled: i === list.length - 1, onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; renderSub(); } }, '▼ Down'),
      h('button', { class: 'btn danger', type: 'button', onclick: () => { list.splice(i, 1); renderSub(); } }, '✕ Delete'))));
  items.push(h('div', null, h('button', { class: 'btn', type: 'button', onclick: () => {
    list.push(Object.fromEntries(fields.map(([k, , t]) => [k, t === 'number' ? 5 : '']))); renderSub();
  } }, '+ Add ' + (id === 'socials' ? 'social link' : 'entry'))));
  return items;
}

function editorActions() {
  return h('div', { class: 'form-actions' },
    h('button', { class: 'btn big save', type: 'button', onclick: save }, 'SAVE'),
    h('button', { class: 'btn big', type: 'button', onclick: () => { draft = structuredClone(data); renderSub(); toast('Changes discarded'); } }, 'DISCARD'),
    h('button', { class: 'btn big', type: 'button', onclick: exportJson }, 'EXPORT JSON'));
}

async function save() {
  try {
    const r = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
    data = structuredClone(draft);
    applyIdentity();
    toast('Saved on this PC');
  } catch (e) { toast('Save failed: ' + e.message); }
}

async function publish() {
  try {
    const r = await fetch('/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.status);
    toast(j.message || 'Published');
  } catch (e) { toast('Publish failed: ' + e.message); }
}

function setEditing(on, withDraft) {
  editing = on;
  if (on) draft = withDraft || structuredClone(data);
  const t = $('#edit-toggle');
  t.classList.toggle('on', on);
  t.textContent = on ? 'DONE' : 'EDIT';
  $('#save-btn').hidden = !on;
  if (state === 'sub') renderSub();
  else if (state === 'menu') buildMenu(false);
  else if (state === 'home') renderHome();
}

// import a LinkedIn data export (.zip or its .csv files) or a JSON backup into the draft
async function runImport(files) {
  if (!files?.length) return;
  try {
    const { data: next, summary } = await window.PortfolioImport.importFiles(files, editing ? draft : data);
    setEditing(true, next);
    const parts = Object.entries(summary).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
    toast(parts.length ? `Imported ${parts.join(' · ')}. Review, then SAVE` : 'Nothing new found in that file');
  } catch (e) { toast('Import failed: ' + e.message); }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(editing ? draft : data, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'portfolio-backup.json' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function applyIdentity() {
  const p = data.profile || {};
  document.title = p.name || 'Portfolio';
  const run = `${(p.name || '').toUpperCase()}  ✦  `;
  $('#strip-text').replaceChildren(h('span', { class: 'marq' }, run.repeat(4)));
  $('#tag-name').textContent = p.name || '';
  $('#tag-sub').textContent = p.location || 'Portfolio';
}

// ================= input =================
document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  const k = e.key;
  if (state === 'home') {
    if (k === 'ArrowDown' || k === 's') { e.preventDefault(); selectHome(homeSel + 1); }
    else if (k === 'ArrowUp' || k === 'w') { e.preventDefault(); selectHome(homeSel - 1); }
    else if ((k === 'Enter' || k === ' ') && !e.target.closest?.('a, .owner, .gl-row')) { e.preventDefault(); homeItems[homeSel]?.act(); }
  } else if (state === 'menu') {
    if (k === 'ArrowDown' || k === 's') { e.preventDefault(); select(sel + 1); }
    else if (k === 'ArrowUp' || k === 'w') { e.preventDefault(); select(sel - 1); }
    else if ((k === 'Enter' || k === ' ') && !e.target.closest?.('.owner, .tagbox')) { e.preventDefault(); confirm(); }
    else if (k === 'Escape' || k === 'Backspace') { e.preventDefault(); goHome(); }
  } else if (state === 'sub') {
    if (k === 'Escape' || k === 'Backspace') { e.preventDefault(); back(); }
    else if (k === 'ArrowRight' || k === 'e' || k === 'E') { e.preventDefault(); switchSection(1); }
    else if (k === 'ArrowLeft' || k === 'q' || k === 'Q') { e.preventDefault(); switchSection(-1); }
    else if (!editing && (k === 'ArrowDown' || k === 's')) { e.preventDefault(); selectRow(rowSel + 1); }
    else if (!editing && (k === 'ArrowUp' || k === 'w')) { e.preventDefault(); selectRow(rowSel - 1); }
    else if (!editing && k === 'Enter' && !e.target.closest?.('a, .owner, .sub-back, .tab')) { e.preventDefault(); activateRow(); }
  }
});
let wheelAt = 0;
document.addEventListener('wheel', (e) => {
  if (state !== 'menu' || Math.abs(e.deltaY) < 8) return;
  if (Date.now() - wheelAt < 130) return;
  wheelAt = Date.now();
  select(sel + Math.sign(e.deltaY));
}, { passive: true });
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('input, textarea, a')) return;
  if (state === 'sub') { e.preventDefault(); back(); }
  else if (state === 'menu') { e.preventDefault(); goHome(); }
});
$('#sub-back').addEventListener('click', back);
$('#tagbox').addEventListener('click', () => { if (state === 'menu') goHome(); });

// ================= boot =================
(async function init() {
  spawnFx();
  try { data = await fetch('profile.json', { cache: 'no-store' }).then((r) => r.json()); }
  catch { data = { profile: { name: 'Offline' } }; }
  try {
    // Only the local server on the owner's PC answers this; a static host returns 404.
    const w = await fetch('/api/whoami', { cache: 'no-store' });
    canEdit = w.ok && !!(await w.json()).canEdit;
  } catch { canEdit = false; }

  applyIdentity();
  if (canEdit) {
    $('#owner').hidden = false;
    body.classList.add('is-owner');
    $('#edit-toggle').onclick = () => setEditing(!editing);
    $('#publish').onclick = publish;
    $('#save-btn').onclick = save;
    $('#import-btn').onclick = () => $('#import-file').click();
    $('#import-file').onchange = (e) => { runImport(e.target.files); e.target.value = ''; };
  }
  await document.fonts?.ready;

  // the intro splash lands on Home, the menu, or a section named in the URL
  const hash = location.hash.slice(1);
  refreshVisible();
  const start = sectionIndex(hash);
  busy = true;
  await rings(() => {
    if (start >= 0) {
      sel = start; buildMenu(false); renderSub(); setState('sub'); setGuide(visible[sel].ask);
    } else if (hash === 'menu') {
      setState('menu'); buildMenu(true);
    } else {
      let seen = false;
      try { seen = sessionStorage.getItem('seenPress') === '1'; } catch {}
      if (seen) { renderHome(); setState('home'); } else showPress();
    }
  });
  busy = false;
})();
