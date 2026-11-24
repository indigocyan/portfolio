// Boot, screens, router and input.
//   startup()  the opening: a line of light splits the dark, the camera pulls back from the moon
//   home       moonlit window with the name, the section options and social links
//   surge()    the dive: water floods out from the point you chose, jets and bubbles branching out; the scene swaps
//              while the water covers it (home <-> sections)
//   switchTo() section <-> section: overlapping slides, a heavier slash on long jumps
import { $, $$, h, sleep, anim, settle, settings, saveSettings, reduced, applyFont, FONTS, safeUrl, pretty, EASE_OUT, EASE_POP, moonPhase, phaseName, moonLitPath, timeOfDay } from './util.js';
import { initSea, setMood, updateSea } from './sea.js';
import { makeList } from './list.js';
import { SECTIONS } from './screens/sections.js';

const body = document.body;
let data, sections = [];
let screen = 'boot';      // 'boot' | 'title' (home) | 'section'
let secIndex = 0;          // index into `sections`
let page = null;           // current section page { el, list, id }
let menu = null;           // the home option list controller
let busy = false;
let device = matchMedia('(hover: none)').matches ? 'touch' : 'keys';
const rnd = (a, b) => a + Math.random() * (b - a);

// ================================================================ chrome: drift, date, guide
function spawnDrift() {
  const box = $('#drift');
  const n = settings.effects === 'low' ? [8, 0] : innerWidth < 760 ? [10, 6] : [20, 12];
  const kids = [];
  for (let i = 0; i < n[0]; i++) {
    const s = Math.random() < .15 ? 22 + Math.random() * 20 : 4 + Math.random() * 14;
    kids.push(h('i', { class: 'bub', style: `left:${Math.random() * 100}%;width:${s}px;height:${s}px;animation-duration:${9 + Math.random() * 12}s;animation-delay:${-Math.random() * 20}s;--sway:${(Math.random() * 60 - 30).toFixed(0)}px` }));
  }
  for (let i = 0; i < n[1]; i++) {
    kids.push(h('i', { class: 'shard' + (Math.random() < .35 ? ' dim' : ''), style: `left:${Math.random() * 100}%;top:${Math.random() * 100}%;--s:${8 + Math.random() * 16}px;--r:${Math.random() * 360}deg;--dx:${(Math.random() * 60 - 30).toFixed(0)}px;--dy:${(Math.random() * 60 - 30).toFixed(0)}px;animation-duration:${6 + Math.random() * 6}s;animation-delay:${-Math.random() * 6}s` }));
  }
  box.replaceChildren(...kids);
}

function drawDate() {
  const now = new Date(), p = moonPhase(now);
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
  $('#datepanel').replaceChildren(
    h('div', { class: 'dp-date' }, h('b', null, `${now.getMonth() + 1}/${now.getDate()}`), h('span', { class: 'dp-day' + (now.getDay() === 0 ? ' sun' : now.getDay() === 6 ? ' sat' : '') }, day)),
    h('div', { class: 'dp-time' }, timeOfDay(now)),
    h('div', { class: 'dp-moon', title: phaseName(p) },
      h('span', { class: 'dp-moon-ico' }, moonSvg(p)),
      h('span', { class: 'dp-moon-name' }, phaseName(p))));
}
function moonSvg(p) {
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  t.setAttribute('viewBox', '-12 -12 24 24');
  t.innerHTML = `<circle r="10" fill="#071a6a" stroke="#9fe8ff" stroke-width="1"/><path d="${moonLitPath(p, 10)}" fill="#e8fbff"/>`;
  return t;
}

const jumpKey = () => `1–${Math.min(9, sections.length)}`;
const PROMPTS = {
  title:   { keys: () => [['↑↓', 'Select'], ['Enter', 'Open'], [jumpKey(), 'Jump']], touch: () => [['Tap', 'Open']] },
  section: { keys: () => [['Q E', 'Switch'], [jumpKey(), 'Jump'], ['Esc', 'Home']], touch: () => [['Swipe', 'Switch'], ['Tap', 'Details']] },
};
function setGuide(text, kind = screen) {
  const g = $('#guide-text');
  if (g.textContent !== text) {
    g.textContent = text;
    anim(g, [{ opacity: 0, transform: 'translateX(18px) skewX(-8deg)' }, { opacity: 1, transform: 'none' }], { duration: 300 });
  }
  const set = PROMPTS[kind]?.[device]?.() || [];
  $('#prompts').replaceChildren(...set.map(([k, v]) => h('span', { class: 'pr' }, h('kbd', null, k), v)));
}
function noteDevice(d) {
  if (d === device) return;
  device = d;
  body.dataset.device = d;
  if (screen !== 'boot') setGuide($('#guide-text').textContent);
}

// ================================================================ transition effects
// a diagonal slash of bands crossing the screen (long jumps between sections)
function wipe(dir = 1) {
  if (reduced()) return;
  const w = $('#wipe');
  const bands = [['#05060c', 34, 0], ['#43d3ff', 10, 40], ['#ffffff', 4, 80], ['#ff1f3d', 2, 110]];
  w.replaceChildren(...bands.map(([c, wd]) => h('i', { style: `background:${c};width:${wd}vw` })));
  [...w.children].forEach((b, i) => {
    anim(b, [{ transform: `translateX(${dir > 0 ? -60 : 160}vw) skewX(-24deg)` }, { transform: `translateX(${dir > 0 ? 160 : -60}vw) skewX(-24deg)` }],
      { duration: 620, delay: bands[i][2], easing: 'cubic-bezier(.55,.05,.35,1)', fill: 'none' });
  });
}

// glass-like shards burst from a point
const SHARD_COLORS = ['#ffffff', '#43d3ff', '#ff1f3d', '#05060c', '#d8f6ff', '#ff6fb5'];
function shatter(x, y, n = 16) {
  if (reduced()) return;
  const box = $('#shatter');
  const count = settings.effects === 'low' ? Math.round(n / 2) : n;
  for (let i = 0; i < count; i++) {
    const s = rnd(18, 64);
    const pts = Array.from({ length: 3 }, () => `${rnd(0, 100).toFixed(0)}% ${rnd(0, 100).toFixed(0)}%`).join(',');
    const el = h('i', { style: `left:${x - s / 2}px;top:${y - s / 2}px;width:${s}px;height:${s}px;background:${SHARD_COLORS[i % SHARD_COLORS.length]};clip-path:polygon(${pts})` });
    box.append(el);
    const a = (i / count) * Math.PI * 2 + rnd(0, .5), d = rnd(120, 480), rot = rnd(-540, 540);
    anim(el, [
      { transform: 'translate(0,0) rotate(0) scale(.3)', opacity: 1 },
      { transform: `translate(${Math.cos(a) * d * .7}px, ${Math.sin(a) * d * .7}px) rotate(${rot * .7}deg) scale(1)`, opacity: 1, offset: .55 },
      { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d + 60}px) rotate(${rot}deg) scale(.6)`, opacity: 0 },
    ], { duration: rnd(650, 950), easing: 'cubic-bezier(.1,.8,.3,1)', fill: 'none' }).then(() => el.remove());
  }
}
const centre = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

// The dive, radiating from a source point (the chosen option, the Home button). Jets and
// droplets branch out from it, a pool of water floods outward behind a foam ring until it covers
// the screen, `mid` swaps the scene, then a hole opens from the same point and drains outward with
// its own foam ring while bubbles drift up.
let holeOk = false;
try { CSS.registerProperty({ name: '--hole', syntax: '<length>', inherits: false, initialValue: '0px' }); holeOk = true; } catch { holeOk = !!window.CSS?.registerProperty; }
async function surge(mid, origin) {
  const sp = $('#splash');
  if (reduced()) {
    const veil = h('div', { style: 'position:absolute;inset:0;background:#0a2a9e' });
    sp.replaceChildren(veil);
    await anim(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'none' });
    veil.style.opacity = 1;
    await mid();
    await anim(veil, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'none' });
    sp.replaceChildren();
    return;
  }
  const W = innerWidth, H = innerHeight;
  const [ox, oy] = origin || [W / 2, H];
  const R = Math.ceil(Math.max(Math.hypot(ox, oy), Math.hypot(W - ox, oy), Math.hypot(ox, H - oy), Math.hypot(W - ox, H - oy))) + 80;
  const box = `left:${ox - R}px;top:${oy - R}px;width:${2 * R}px;height:${2 * R}px`;
  const lite = settings.effects === 'low';
  const pool = h('div', { class: 'pool', style: box });
  const rimIn = h('i', { class: 'rim', style: box }), rimOut = h('i', { class: 'rim out', style: box });
  const vmin = Math.min(W, H) / 100;
  // jets: tapered streams branching out from the source
  const jets = Array.from({ length: lite ? 6 : 14 }, (_, k, n = lite ? 6 : 14) => {
    const w = rnd(1.2, 3.2) * vmin, len = rnd(14, 34) * vmin;
    const el = h('i', { class: 'jet' + (k % 3 ? '' : ' c'), style: `left:${ox}px;top:${oy}px;width:${w}px;height:${len}px;margin:${-len}px 0 0 ${-w / 2}px;rotate:${(k / n) * 360 + rnd(-8, 8)}deg` });
    return [el, len];
  });
  const drops = Array.from({ length: lite ? 8 : 24 }, () => {
    const s = rnd(5, 18);
    return h('i', { class: 'drop' + (Math.random() < .35 ? ' c' : ''), style: `left:${ox - s / 2}px;top:${oy - s / 2}px;width:${s}px;height:${s * 1.25}px` });
  });
  const bubs = Array.from({ length: lite ? 18 : 60 }, () => {
    const big = Math.random() < .14, s = big ? rnd(46, 110) : rnd(8, 40);
    return h('i', { class: 'bub' + (!big && Math.random() < .3 ? ' solid' : ''), style: `left:${ox - s / 2}px;top:${oy - s / 2}px;width:${s}px;height:${s}px` });
  });
  // foam puffs riding the water's edge: one set for the flood, one for the drain
  const puffSet = () => {
    const n = lite ? 12 : 28;
    return Array.from({ length: n }, (_, k) => {
      const s = rnd(3, 7.5) * vmin, a = (k / n) * Math.PI * 2 + rnd(-.06, .06);
      return [h('i', { class: 'puff', style: `left:${ox - s / 2}px;top:${oy - s / 2}px;width:${s}px;height:${s * rnd(.7, 1)}px` }), a];
    });
  };
  const puffsIn = puffSet(), puffsOut = puffSet();
  sp.replaceChildren(pool, rimIn, rimOut, ...jets.map((j) => j[0]), ...drops, ...puffsIn.map((p) => p[0]), ...bubs);

  const IN = 600, OUT = 680, ease = 'cubic-bezier(.55,0,.25,1)';
  const ride = (set, dur) => set.forEach(([el, a]) => anim(el, [
    { transform: 'translate(0,0) scale(.4)', opacity: 1 },
    { transform: `translate(${Math.cos(a) * R * .92}px, ${Math.sin(a) * R * .92}px) scale(1.3)`, opacity: 1, offset: .9 },
    { transform: `translate(${Math.cos(a) * R}px, ${Math.sin(a) * R}px) scale(1.5)`, opacity: 0 },
  ], { duration: dur, easing: ease, fill: 'both' }));
  anim(pool, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: IN, easing: ease, fill: 'forwards' });
  ride(puffsIn, IN);
  anim(rimIn, [{ transform: 'scale(0)', opacity: 1 }, { transform: 'scale(1)', opacity: 1, offset: .92 }, { transform: 'scale(1)', opacity: 0 }], { duration: IN, easing: ease, fill: 'forwards' });
  jets.forEach(([el, len], k) => anim(el, [
    { transform: 'translateY(0) scaleY(0)', opacity: 1 },
    { transform: `translateY(${-len * .6}px) scaleY(1)`, opacity: 1, offset: .45 },
    { transform: `translateY(${-len * 2.4}px) scaleY(.35)`, opacity: 0 },
  ], { duration: rnd(620, 900), delay: k % 2 ? 40 : 0, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' }));
  drops.forEach((el) => {
    const a = rnd(0, Math.PI * 2), d = rnd(18, 62) * vmin;
    anim(el, [
      { transform: 'translate(0,0) scale(.4)', opacity: 0 },
      { transform: `translate(${Math.cos(a) * d * .6}px, ${Math.sin(a) * d * .6}px) scale(1)`, opacity: 1, offset: .45 },
      { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d + 8 * vmin}px) scale(.5)`, opacity: 0 },
    ], { duration: rnd(600, 950), delay: rnd(0, 160), easing: 'cubic-bezier(.15,.8,.35,1)', fill: 'both' });
  });
  bubs.forEach((el) => {
    const a = rnd(0, Math.PI * 2), d = rnd(10, 70) * vmin, rise = rnd(30, 70);
    anim(el, [
      { transform: 'translate(0,0) scale(.3)', opacity: 0 },
      { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(1)`, opacity: 1, offset: .4 },
      { transform: `translate(${Math.cos(a) * d * 1.1 + rnd(-30, 30)}px, calc(${Math.sin(a) * d}px - ${rise}vh)) scale(1.05)`, opacity: 0 },
    ], { duration: rnd(1100, 1900), delay: rnd(0, 520), easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'both' });
  });
  await sleep(IN + 40);
  await mid();
  await sleep(90);
  if (holeOk && !lite) {   // the widening hole repaints every frame, so lite mode fades instead
    sp.append(...puffsOut.map((p) => p[0]));
    ride(puffsOut, OUT);
    anim(rimOut, [{ transform: 'scale(0)', opacity: 1 }, { transform: 'scale(1)', opacity: 1, offset: .85 }, { transform: 'scale(1)', opacity: 0 }], { duration: OUT, easing: ease, fill: 'forwards' });
    await anim(pool, [{ '--hole': '0px' }, { '--hole': R + 'px' }], { duration: OUT, easing: ease, fill: 'forwards' });
  } else {
    await anim(pool, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
  }
  pool.remove(); rimIn.remove(); rimOut.remove();
  clearTimeout(surge.t);
  surge.t = setTimeout(() => sp.replaceChildren(), 1400);
}

// The opening: dark, a thin line of light draws across, then the dark splits open on it while
// the camera is already pulling back from the moon.
async function startup(after) {
  const c = $('#curtain');
  setTimeout(() => c.remove(), 4000);   // failsafe: animations can be paused in background tabs
  if (reduced()) { after(); await anim(c, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 }); c.remove(); return; }
  const line = $('.cur-line', c);
  await anim(line, [{ transform: 'scaleX(0)', opacity: 1 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 520, delay: 200, easing: 'cubic-bezier(.7,0,.2,1)' });
  after();
  anim(line, [{ opacity: 1, transform: 'scaleX(1) scaleY(1)' }, { opacity: 0, transform: 'scaleX(1) scaleY(6)' }], { duration: 420, delay: 120 });
  anim($('.cur-top', c), [{ transform: 'none' }, { transform: 'translateY(-101%)' }], { duration: 950, easing: 'cubic-bezier(.75,0,.2,1)' });
  await anim($('.cur-bot', c), [{ transform: 'none' }, { transform: 'translateY(101%)' }], { duration: 950, easing: 'cubic-bezier(.75,0,.2,1)' });
  c.remove();
}

function show(id) { const el = $(id); el.hidden = false; return el; }
function setScreen(s, mood) {
  screen = s;
  body.dataset.screen = s;
  updateSea();   // the WebGL sea only runs where it can be seen
  setMood(mood || s, s === 'section' ? secIndex - sections.length / 2 : 0);
}
const sectionMood = (i) => sections[i].id === 'system' ? 'system' : 'section';

// ---------------------------------------------------------------- HOME
const MONO = { linkedin: 'in', github: 'GH', instagram: 'IG', x: 'X', twitter: 'X', youtube: 'YT', behance: 'Bē', dribbble: 'Dr', medium: 'M', leetcode: 'LC', discord: 'DC', email: '@', website: 'WWW' };
const mono = (p) => MONO[String(p || '').toLowerCase()] || String(p || '?').slice(0, 2).toUpperCase();
const ZIG = [0, .5, .22, .62, .1, .4, .3, .05];
function buildHome() {
  const p = data.profile || {};
  const words = String(p.name || 'Portfolio').trim().split(/\s+/);
  $('#tl-first').replaceChildren(...[...words[0]].map((c, i) => h('span', { class: 'tl-ch', style: `--c:${i}` }, c)));
  $('#tl-last').textContent = words.slice(1).join(' ');
  $('#tl-last').parentElement.hidden = words.length < 2;
  $('#tl-sub').textContent = p.headline || '';
  const links = [
    ...(data.socials || []).filter((s) => safeUrl(s.url)).map((s) => ({ k: s.platform || 'Link', v: s.handle || pretty(s.url), href: safeUrl(s.url) })),
    data.contact?.email && { k: 'Email', v: data.contact.email, href: 'mailto:' + data.contact.email },
  ].filter(Boolean);
  $('#home-links').replaceChildren(...links.map((l, i) => h('a', {
    class: 'hl', href: l.href, style: `--i:${i}`, target: /^https?:/.test(l.href) ? '_blank' : null, rel: 'noopener noreferrer', 'aria-label': `${l.k}: ${l.v}`,
  }, h('span', { class: 'hl-ico', 'aria-hidden': 'true' }, mono(l.k)), h('span', { class: 'hl-txt' }, h('b', null, l.k), h('small', null, l.v)))));
  // a clock face around the moon
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = i / 60 * Math.PI * 2, major = i % 5 === 0, r1 = major ? 84 : 90;
    return `<line x1="${(Math.sin(a) * r1).toFixed(1)}" y1="${(-Math.cos(a) * r1).toFixed(1)}" x2="${(Math.sin(a) * 96).toFixed(1)}" y2="${(-Math.cos(a) * 96).toFixed(1)}" stroke-width="${major ? 2.4 : 1}"/>`;
  }).join('');
  $$('.clock svg').forEach((c) => { c.innerHTML = `<g stroke="#cdf3ff" fill="none"><circle r="99" stroke-width="1.4"/><circle r="97" stroke-width=".6" stroke-dasharray="2 4"/>${ticks}<circle r="78" stroke-width=".8"/></g>`; });
  // options: one word per section
  const items = sections.map((s, i) => h('li', { class: 'ci-li', style: `--i:${i};--x:${ZIG[i % ZIG.length]}` },
    h('button', { class: 'ci', type: 'button' },
      h('span', { class: 'ci-shard', 'aria-hidden': 'true' }), h('span', { class: 'ci-band', 'aria-hidden': 'true' }),
      h('span', { class: 'ci-word' }, s.label), h('span', { class: 'ci-num', 'aria-hidden': 'true' }, i < 9 ? i + 1 : ''))));
  $('#cmd-list').replaceChildren(...items);
  menu = makeList(items.map((li) => li.firstChild), {
    start: secIndex,
    onSelect: (i, _, quiet) => {
      secIndex = i;
      if (screen === 'title') setGuide(sections[i].guide, 'title');
      if (!quiet) {   // the cursor shard snaps in with a kick
        const b = menu.items[i];
        anim(b.querySelector('.ci-shard'), [{ scale: '.3 1', rotate: '-14deg' }, { scale: '1.12 1', rotate: '3deg', offset: .6 }, { scale: '1 1', rotate: '0deg' }], { duration: 320, easing: EASE_OUT, fill: 'none' });
        anim(b.querySelector('.ci-word'), [{ translate: '-.18em 0' }, { translate: '0 0' }], { duration: 260, easing: EASE_POP, fill: 'none' });
      }
    },
    onActivate: (i) => go(sections[i].id),
    tapActivates: true,
  });
}
// mode 'intro': full pull-back from the moon; 'return': a short settle after the water clears
async function homeIn(mode = 'return') {
  show('#scr-title');
  const all = [...$$('#scr-title .layer'), ...$$('.clock'), ...$$('#scr-title .tl-ch'), $('.tl-bar'), $('#tl-last'), $('#tl-sub'), ...$$('#cmd-list .ci-li'), ...$$('#home-links .hl')];
  settle(all);
  menu.select(secIndex, true);
  setGuide(sections[secIndex].guide, 'title');
  const intro = mode === 'intro';
  // smaller zooms keep the scaled layers cheap to draw; lite mode moves the far planes less still
  const zoom = isLite() ? { sky: 1.15, 'moon-layer': 1.5, clouds: 1.5, frame: 1.9 } : { sky: 1.3, 'moon-layer': 1.8, clouds: 2.1, frame: 2.6 };
  const D = intro ? (isLite() ? 2000 : 2600) : 1300;
  for (const [k, z] of Object.entries(zoom)) {
    anim($(`#scr-title .${k}`), [{ scale: intro ? z : 1 + (z - 1) * .2 }, { scale: 1 }], { duration: D, easing: 'cubic-bezier(.3,.6,.1,1)' });
  }
  $$('.clock').forEach((c) => anim(c, [{ opacity: 0, scale: intro ? 1.6 : 1.1 }, { opacity: c.classList.contains('back') ? .45 : .75, scale: 1 }], { duration: intro ? 2400 : 1200, easing: EASE_OUT }));
  const t0 = intro ? 1500 : 250;
  $$('#scr-title .tl-ch').forEach((c, i) => anim(c, [{ opacity: 0, transform: 'translateY(60%) skewX(-24deg) scale(1.4)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
    { duration: 620, delay: t0 + i * 55, easing: EASE_POP }));
  anim($('.tl-bar'), [{ scale: '0 1' }, { scale: '1 1' }], { duration: 520, delay: t0 + 220 });
  anim($('#tl-last'), [{ opacity: 0, translate: '-40px 0' }, { opacity: 1, translate: '0 0' }], { duration: 480, delay: t0 + 360 });
  anim($('#tl-sub'), [{ opacity: 0, letterSpacing: '.8em' }, { opacity: 1, letterSpacing: '.3em' }], { duration: 700, delay: t0 + 420 });
  $$('#cmd-list .ci-li').forEach((li, i) => anim(li, [{ opacity: 0, transform: 'translateX(22vw) skewX(-20deg)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: t0 + 380 + i * 50 }));
  $$('#home-links .hl').forEach((a, i) => anim(a, [{ opacity: 0, translate: '0 40px', rotate: '-8deg' }, { opacity: 1, translate: '0 0', rotate: '0deg' }], { duration: 520, delay: t0 + 600 + i * 80, easing: EASE_POP }));
  await sleep(t0 + 500);
  if (device === 'keys') menu.items[secIndex]?.focus({ preventScroll: true });
}
function hideHome() { $('#scr-title').hidden = true; }
// pointer parallax on the night scene, at most once per frame (off in lite mode)
let pmX = 0, pmY = 0, pmRaf = 0;
addEventListener('pointermove', (e) => {
  if (screen !== 'title' || reduced() || isLite()) return;
  pmX = e.clientX; pmY = e.clientY;
  if (pmRaf) return;
  pmRaf = requestAnimationFrame(() => {
    pmRaf = 0;
    const home = $('#scr-title');
    home.style.setProperty('--mx', ((pmX / innerWidth - .5) * -24).toFixed(0) + 'px');
    home.style.setProperty('--my', ((pmY / innerHeight - .5) * -16).toFixed(0) + 'px');
  });
}, { passive: true });

// ---------------------------------------------------------------- LITE MODE
// Fewer, cheaper effects for older hardware: no WebGL sea, no clouds/glows/spinning ring, fewer
// particles, no parallax, and a fade instead of the repainting drain. It turns itself on for
// low-end devices and when the opening animation runs slowly, unless the visitor has chosen.
const isLite = () => settings.effects === 'low';
function setLite(on, byUser, quiet) {
  settings.effects = on ? 'low' : 'high';
  if (byUser) settings.liteChosen = true;
  saveSettings();
  body.classList.toggle('lite', on);
  const b = $('#lite-btn');
  b.setAttribute('aria-pressed', String(on));
  b.querySelector('b').textContent = on ? 'On' : 'Off';
  if (on) $('#scr-title').style.setProperty('--mx', '0px'), $('#scr-title').style.setProperty('--my', '0px');
  spawnDrift();
  updateSea();
  if (!quiet) toast(on ? 'Lite mode on: fewer effects' : 'Lite mode off: full effects');
}
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
}
$('#lite-btn').addEventListener('click', () => setLite(!isLite(), true));
// watch frame times while the opening plays; consistently slow frames switch lite mode on
function probeSpeed(ms) {
  if (settings.liteChosen || isLite()) return;
  const times = [];
  let last = performance.now(), stop = last + ms;
  const tick = (now) => {
    times.push(now - last); last = now;
    if (now < stop && !document.hidden) return requestAnimationFrame(tick);
    if (document.hidden || times.length < 10) return;
    times.sort((a, b) => a - b);
    const median = times[times.length >> 1];
    if (median > 34) { setLite(true, false, true); toast('Lite mode on for smoother motion (press L to switch)'); }
  };
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- SECTION: tab strip
function buildStrip() {
  const tabs = sections.map((s, i) => h('button', { class: 'hb-tab', type: 'button', 'data-i': i, onclick: () => switchTo(i), 'aria-label': `${s.label} (${i + 1})` },
    i < 9 ? h('kbd', null, i + 1) : null, h('span', null, s.label)));
  $('#hbar').replaceChildren(
    h('button', { class: 'hb-step', type: 'button', onclick: () => switchTo(secIndex - 1), 'aria-label': 'Previous section' }, h('kbd', null, 'Q')),
    h('div', { class: 'hb-tabs scroll-x' }, h('i', { class: 'hb-ind', 'aria-hidden': 'true' }), tabs),
    h('button', { class: 'hb-step', type: 'button', onclick: () => switchTo(secIndex + 1), 'aria-label': 'Next section' }, h('kbd', null, 'E')));
}
function updateStrip(animate) {
  const tabs = $$('#hbar .hb-tab'), tab = tabs[secIndex], ind = $('#hbar .hb-ind');
  if (!tab) return;
  tabs.forEach((t, i) => { t.classList.toggle('on', i === secIndex); t.setAttribute('aria-current', i === secIndex ? 'page' : 'false'); });
  const box = tab.parentElement;
  const to = { x: tab.offsetLeft, w: tab.offsetWidth };
  const from = { x: parseFloat(ind.dataset.x || to.x), w: parseFloat(ind.dataset.w || to.w) };
  ind.style.transform = `translateX(${to.x}px)`; ind.style.width = to.w + 'px';
  ind.dataset.x = to.x; ind.dataset.w = to.w;
  if (animate) anim(ind, [{ transform: `translateX(${from.x}px)`, width: from.w + 'px' }, { transform: `translateX(${to.x}px)`, width: to.w + 'px' }], { duration: 380, easing: EASE_OUT, fill: 'none' });
  box.scrollTo({ left: to.x - (box.clientWidth - to.w) / 2, behavior: animate && !reduced() ? 'smooth' : 'auto' });
}

const ctx = {
  replay: () => { history.replaceState(null, '', location.pathname + location.search); location.reload(); },
  onSettings: () => { body.classList.toggle('reduced', reduced()); spawnDrift(); initSea.resize?.(); },
  toggleLite: () => setLite(!isLite(), true, true),
  onFont: async () => { await applyFont(settings.font); updateStrip(false); },
};
function buildPage() {
  const s = sections[secIndex];
  const r = s.render(data, ctx);
  const giant = r.noGiant ? null : h('h1', { class: 'giant', 'aria-hidden': 'true', 'data-text': s.label }, [...s.label].map((c, i) => h('span', { style: `--c:${i}` }, c)));
  const el = h('div', { class: 'page ' + (r.cls || ''), 'data-id': s.id }, giant, h('h2', { class: 'sr' }, s.label), r.el);
  if (r.noGiant) el.prepend(h('h1', { class: 'sr' }, s.label));
  return { el, list: r.list, id: s.id };
}
// entrance choreography for a page; dir: 0 after the dive, ±1 when switching sections
function pageIn(pg, dir = 0) {
  const el = pg.el;
  const g = el.querySelector('.giant'), rises = $$('.rise', el), pops = $$('.pop', el);
  const dx = dir || -1;
  // individual translate/scale properties layer on top of each element's own CSS transform;
  // fills are dropped once each entrance lands
  const done = (x) => () => settle(x);
  if (g) {
    anim(g, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 }).then(done(g));
    $$('span', g).forEach((c, i) => anim(c, [{ opacity: 0, transform: `translate(${dx * 1.2}em, .25em) skewX(-20deg)` }, { opacity: 1, transform: 'none' }],
      { duration: 560, delay: 30 + i * 32, easing: EASE_OUT }).then(done(c)));
  }
  rises.forEach((r, i) => anim(r, [{ opacity: 0, translate: `${dx * 60}px ${dir ? 0 : 18}px` }, { opacity: 1, translate: '0 0' }],
    { duration: 460, delay: 90 + Math.min(i, 10) * 38 }).then(done(r)));
  pops.forEach((p, i) => anim(p, [{ opacity: 0, translate: `${(dir || 1) * 50}px 0`, scale: .97 }, { opacity: 1, translate: '0 0', scale: 1 }], { duration: 520, delay: 180 + i * 70 }).then(done(p)));
  return sleep(420);
}
function pageOut(pg, dir) {
  const el = pg.el;
  el.classList.add('leaving');
  el.style.pointerEvents = 'none';
  return anim(el, [{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: `translateX(${-dir * 8}vw) skewX(-4deg)`, filter: 'blur(3px)' }],
    { duration: 260, easing: 'cubic-bezier(.7,0,.84,0)' }).then(() => el.remove());
}
async function sectionIn(dir = 0) {
  const first = $('#scr-section').hidden;
  show('#scr-section');
  if (first) settle($('#hbar'), $('#back-btn'));
  page = buildPage();
  $('#pages').append(page.el);
  updateStrip(!!dir);
  setGuide(sections[secIndex].ask, 'section');
  location.replace('#/' + sections[secIndex].id);
  if (!dir) {
    anim($('#hbar'), [{ translate: '0 -160%' }, { translate: '0 0' }], { duration: 560, delay: 120 });
    anim($('#back-btn'), [{ opacity: 0, translate: '-30px 0' }, { opacity: 1, translate: '0 0' }], { duration: 400, delay: 200 });
  }
  await pageIn(page, dir);
  page.list?.items[page.list.sel]?.focus({ preventScroll: true });
}
function hideSection() {
  $('#pages').replaceChildren();
  page = null;
  $('#scr-section').hidden = true;
}
// jump to any section from inside a section (Q/E, number keys, tabs)
async function switchTo(i) {
  if (busy || screen !== 'section' || sections.length < 2) return;
  const n = sections.length, target = ((i % n) + n) % n;
  if (target === secIndex) return;
  busy = true;
  const span = Math.abs(target - secIndex), far = span > 1 && span !== n - 1;
  let dir = target > secIndex ? 1 : -1;
  if (span === n - 1) dir = -dir;                         // wrapping Q/E keeps its direction
  const old = page;
  secIndex = target;
  setMood(sectionMood(secIndex), secIndex - n / 2);
  if (far) wipe(dir);                                     // long jumps get a slash
  pageOut(old, dir);
  await sleep(reduced() ? 0 : far ? 160 : 110);           // overlap: the new page starts while the old one leaves
  menu.select(secIndex, true);
  await sectionIn(dir);
  busy = false;
}

// ---------------------------------------------------------------- router
async function go(target) {
  if (busy) return;
  const from = screen;
  if (target === 'title') {
    if (from === 'title') return;
    busy = true;
    const btn = $('#back-btn'), origin = btn.offsetParent ? centre(btn) : null;
    await surge(async () => {
      hideSection();
      setScreen('title');
      history.replaceState(null, '', location.pathname + location.search);
      homeIn('return');
    }, origin);
    busy = false;
    return;
  }
  const i = sections.findIndex((s) => s.id === target);
  if (i < 0) return;
  if (from === 'section') return switchTo(i);             // e.g. browser back/forward between sections
  busy = true;
  secIndex = i;
  menu.select(i, true);
  if (menu.items[i] && !reduced()) {
    const li = menu.items[i].parentElement;
    shatter(...centre(menu.items[i]), 14);
    anim(li, [{ transform: 'none' }, { transform: 'scale(1.2)', offset: .4 }, { transform: 'scale(1.1)' }], { duration: 420, easing: EASE_OUT });
  }
  const from0 = menu.items[i] ? centre(menu.items[i]) : null;
  await sleep(reduced() ? 0 : 140);
  await surge(async () => {
    hideHome();
    setScreen('section', sectionMood(i));
    sectionIn(0);
  }, from0);
  busy = false;
}
const back = () => { if (screen === 'section') go('title'); };
// number keys jump straight to a section from anywhere
function jump(i) {
  if (i >= sections.length) return;
  if (screen === 'section') switchTo(i);
  else go(sections[i].id);
}

// ================================================================ input
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || screen === 'boot') return;
  noteDevice('keys');
  const k = e.key;
  if (/^[1-9]$/.test(k)) { e.preventDefault(); jump(+k - 1); return; }
  if ((k === 'l' || k === 'L') && !e.target.closest?.('input, textarea')) { e.preventDefault(); setLite(!isLite(), true); return; }
  const lst = screen === 'title' ? menu : page?.list;
  const onLink = e.target.closest?.('a');
  if (k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); if (!busy) lst?.move(1); }
  else if (k === 'ArrowUp' || k === 'w' || k === 'W') { e.preventDefault(); if (!busy) lst?.move(-1); }
  else if ((k === 'Enter' || k === ' ') && !onLink) {
    if (e.target.closest?.('.hb-tab, .hb-step, .back-btn, .cal-nav')) return;   // let those buttons click themselves
    e.preventDefault(); if (!busy) lst?.activate();
  }
  else if (k === 'Escape' || k === 'Backspace') { e.preventDefault(); back(); }
  else if (screen === 'section' && (k === 'ArrowRight' || k === 'e' || k === 'E')) { e.preventDefault(); switchTo(secIndex + 1); }
  else if (screen === 'section' && (k === 'ArrowLeft' || k === 'q' || k === 'Q')) { e.preventDefault(); switchTo(secIndex - 1); }
});
document.addEventListener('pointerdown', (e) => noteDevice(e.pointerType === 'mouse' ? 'keys' : 'touch'));
// swipe left/right on a section page switches section (a clearly horizontal, quick gesture only,
// so vertical scrolling and the tab strip / calendar keep working)
let sw = null;
$('#pages').addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  sw = e.touches.length === 1 && !e.target.closest('.cal, a, input') ? { x: t.clientX, y: t.clientY, t: performance.now() } : null;
}, { passive: true });
$('#pages').addEventListener('touchend', (e) => {
  if (!sw || screen !== 'section') return;
  const t = e.changedTouches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
  const quick = performance.now() - sw.t < 650;
  sw = null;
  if (quick && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) switchTo(secIndex + (dx < 0 ? 1 : -1));
}, { passive: true });
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('a, input')) return;
  if (screen === 'section') { e.preventDefault(); back(); }
});
let wheelAt = 0;
document.addEventListener('wheel', (e) => {
  if (screen !== 'title' || busy || Math.abs(e.deltaY) < 8 || Date.now() - wheelAt < 140) return;
  wheelAt = Date.now();
  menu.move(Math.sign(e.deltaY));
}, { passive: true });
$('#back-btn').addEventListener('click', () => go('title'));
addEventListener('resize', () => { if (screen === 'section') updateStrip(false); });
addEventListener('hashchange', () => {
  const r = location.hash.replace(/^#\/?/, '');
  if (busy || screen === 'boot') return;
  if ((!r || r === 'menu') && screen !== 'title') go('title');
  else if (sections.some((s) => s.id === r) && !(screen === 'section' && sections[secIndex].id === r)) go(r);
});

// ================================================================ boot
(async function boot() {
  body.dataset.device = device;
  body.classList.toggle('reduced', reduced());
  const pick = new URLSearchParams(location.search).get('font');   // fonts.html links here with ?font=<key>
  if (pick && FONTS[pick]) { settings.font = pick; saveSettings(); history.replaceState(null, '', location.pathname + location.hash); }
  const fontReady = applyFont(settings.font);
  // lite mode: the visitor's own choice wins; otherwise judge the device
  const n = navigator;
  const weak = !!((n.deviceMemory && n.deviceMemory <= 4) || (n.hardwareConcurrency && n.hardwareConcurrency <= 4) || n.connection?.saveData);
  setLite(settings.liteChosen ? isLite() : weak, false, true);
  initSea();
  spawnDrift();
  drawDate();
  setInterval(drawDate, 60000);

  try {
    const src = new URLSearchParams(location.search).get('data');   // ?data=sample.json for local layout testing
    const url = src && /^[\w-]+\.json$/.test(src) ? src : 'content.json';
    data = await fetch(url, { cache: 'no-cache' }).then((r) => r.json());
  } catch { data = { profile: { name: 'Portfolio' } }; }
  document.title = data.profile?.name || 'Portfolio';
  sections = SECTIONS.filter((s) => s.has(data));
  buildHome();
  buildStrip();
  await Promise.race([Promise.all([fontReady, document.fonts?.ready]), sleep(1500)]);

  const route = location.hash.replace(/^#\/?/, '');
  const target = sections.findIndex((s) => s.id === route);
  busy = true;
  let entered;
  await startup(() => {
    probeSpeed(1800);
    if (target >= 0) { secIndex = target; menu.select(target, true); setScreen('section', sectionMood(target)); entered = sectionIn(0); }
    else { setScreen('title'); entered = homeIn('intro'); }
  });
  await entered;
  busy = false;
})();
