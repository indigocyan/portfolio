// One renderer per section. Each returns { el, list, noGiant? } where `el` is the page body and
// `list` is the selection controller (see list.js). Elements tagged .rise / .pop are choreographed
// by the router on entry and exit.
import { h, filled, range, pretty, safeUrl, roman, years, parseDate, isPresent, MONTHS, settings, saveSettings, anim, EASE_OUT, FONTS } from '../util.js';
import { makeList } from '../list.js';

const list = (d, k) => (d[k] || []).filter(filled);

// detail panes cross-fade their content whenever the selection moves
function swapDetail(box, ...kids) {
  box.replaceChildren(...kids.flat().filter(Boolean));
  anim(box, [{ opacity: 0, translate: '14px 0' }, { opacity: 1, translate: '0 0' }], { duration: 260, fill: 'none' });
}
const tag = (t, cls = '') => h('span', { class: 'tag ' + cls }, t);
const empty = (n, cls) => Array.from({ length: n }, () => h('div', { class: cls + ' slot-empty rise', 'aria-hidden': 'true' }, h('span', null, '– – – – – – – – – –')));
function openHref(href) {
  if (!href) return;
  if (/^https?:/.test(href)) window.open(href, '_blank', 'noopener');
  else location.href = href;
}

// ---------------------------------------------------------------- PROFILE
function profile(d) {
  const p = d.profile || {};
  const edu = list(d, 'education')[0];
  const study = edu ? [edu.degree, edu.field].filter(Boolean).join(', ') : '';
  const plates = [
    ['Name', p.name, p.name],
    ['Role', p.headline, p.headline],
    ['Study', edu && (edu.degree || edu.school), edu && [study, edu.school].filter(Boolean).join('\n')],
    ['Based', p.location, p.location],
    ['Pronouns', p.pronouns, p.pronouns],
  ].filter((r) => r[1]);
  const about = p.about || [study && `${study} at ${edu.school}.`, p.location && `Based in ${p.location}.`].filter(Boolean).join(' ');

  const info = h('div', { class: 'prof-info' });
  const items = plates.map(([k, v], i) => h('button', { class: 'plate rise', type: 'button', style: `--i:${i}` },
    h('span', { class: 'plate-tag' }, k), h('span', { class: 'plate-val' }, v)));
  const card = h('div', { class: 'prof-card pop' },
    h('div', { class: 'prof-name' }, p.name),
    p.headline ? h('div', { class: 'prof-head' }, p.headline) : null,
    about ? h('p', { class: 'prof-about' }, about) : null,
    info);
  const el = h('div', { class: 'prof' }, h('div', { class: 'prof-plates' }, items), card);
  const ctrl = makeList(items, {
    onSelect: (i) => swapDetail(info, tag(plates[i][0], 'red'), h('div', { class: 'info-v' }, plates[i][2])),
  });
  return { el, list: ctrl };
}

// ---------------------------------------------------------------- SKILLS
const RANKS = ['Novice', 'Novice', 'Apprentice', 'Apprentice', 'Capable', 'Capable', 'Seasoned', 'Seasoned', 'Expert', 'Master'];
function skills(d) {
  const all = list(d, 'skills').map((s) => ({ ...s, level: Math.max(1, Math.min(10, Math.round(+s.level || 1))) }));
  const detail = h('div', { class: 'sk-detail pop' });
  const items = all.map((s, i) => h('button', { class: 'sk-row rise', type: 'button', style: `--i:${i}` },
    h('span', { class: 'sk-name' }, s.name),
    h('span', { class: 'sk-meter', 'aria-label': `${s.level} out of 10` }, Array.from({ length: 10 }, (_, k) => h('i', { class: k < s.level ? 'on' : '', style: `--k:${k}` }))),
    h('span', { class: 'sk-rank' }, RANKS[s.level - 1])));
  const el = h('div', { class: 'sk' }, h('div', { class: 'sk-list scroll' }, items), detail);
  const ctrl = makeList(items, {
    onSelect: (i) => {
      const s = all[i];
      swapDetail(detail,
        h('div', { class: 'sk-big' }, h('b', null, s.level), h('small', null, '/10')),
        h('div', { class: 'sk-word' }, RANKS[s.level - 1]),
        h('div', { class: 'sk-dname' }, s.name),
        s.group ? tag(s.group) : null);
    },
  });
  return { el, list: ctrl };
}

// ---------------------------------------------------------------- BOND CARDS (education / experience)
function cards(rows) {
  const detail = h('div', { class: 'dcard pop' });
  const items = rows.map((r, i) => h('button', { class: 'card rise', type: 'button', style: `--i:${i}` },
    h('span', { class: 'card-num' }, roman(i + 1)),
    h('span', { class: 'card-main' }, h('b', null, r.title), r.sub ? h('small', null, r.sub) : null),
    r.rank ? h('span', { class: 'card-rank' }, h('small', null, r.rankLabel || 'Yrs'), h('b', null, r.rank)) : null));
  const el = h('div', { class: 'cards' }, h('div', { class: 'card-list scroll' }, items), detail);
  const ctrl = makeList(items, {
    onSelect: (i) => {
      const r = rows[i];
      swapDetail(detail,
        h('span', { class: 'dcard-mark', 'aria-hidden': 'true' }, roman(i + 1)),
        r.kicker ? tag(r.kicker, 'red') : null,
        h('div', { class: 'dcard-title' }, r.title),
        r.sub ? h('div', { class: 'dcard-sub' }, r.sub) : null,
        r.when ? h('div', { class: 'dcard-when' }, r.when) : null,
        r.body ? h('p', { class: 'dcard-body' }, r.body) : null,
        r.href ? h('a', { class: 'btn-open', href: r.href, target: '_blank', rel: 'noopener noreferrer' }, 'Open link') : null);
    },
  });
  return { el, list: ctrl };
}
function education(d) {
  return cards(list(d, 'education').map((e) => ({
    title: e.school, sub: [e.degree, e.field].filter(Boolean).join(' · '),
    kicker: e.degree ? 'Degree' : 'School', when: range(e.start, e.end), rank: years(e.start, e.end) || '',
    body: e.description,
  })));
}
function experience(d) {
  return cards(list(d, 'experience').map((e) => ({
    title: e.title, sub: e.company, kicker: e.company || 'Role',
    when: [e.location, range(e.start, e.end)].filter(Boolean).join(' · '), rank: years(e.start, e.end) || '',
    body: e.description,
  })));
}

// ---------------------------------------------------------------- PROJECTS (request board)
function projects(d) {
  const all = list(d, 'projects');
  const task = h('div', { class: 'task pop' });
  const items = all.map((p, i) => h('button', { class: 'qrow rise', type: 'button', style: `--i:${i}` },
    h('span', { class: 'q-no' }, String(i + 1).padStart(2, '0')),
    h('span', { class: 'q-name' }, p.name),
    h('span', { class: 'q-year' }, p.year || '—'),
    h('span', { class: 'q-status' + (/done|complete|shipped|live/i.test(p.status || '') ? ' done' : '') }, p.status || (safeUrl(p.link) ? 'Live' : 'Active'))));
  const board = h('div', { class: 'board' },
    h('div', { class: 'qhead rise' }, h('span', null, 'No.'), h('span', null, 'Request'), h('span', null, 'Year'), h('span', null, 'Status')),
    h('div', { class: 'qbody scroll' }, items, empty(Math.max(0, 5 - all.length), 'qrow')));
  const el = h('div', { class: 'proj' }, board, task);
  const ctrl = makeList(items, {
    onSelect: (i) => {
      const p = all[i], href = safeUrl(p.link);
      swapDetail(task, h('div', { class: 'task-h' }, 'Task'),
        h('p', { class: 'task-body' }, p.description || p.name),
        href ? h('a', { class: 'btn-open', href, target: '_blank', rel: 'noopener noreferrer' }, pretty(href)) : null);
    },
    onActivate: (i) => openHref(safeUrl(all[i].link)),
  });
  return { el, list: ctrl };
}

// ---------------------------------------------------------------- TIMELINE (calendar)
export function timelineItems(d) {
  const out = [];
  const add = (date, title, kind, detail) => { const p = parseDate(date); if (p && title) out.push({ ...p, title, kind, detail }); };
  list(d, 'education').forEach((e) => {
    add(e.start, `Started at ${e.school}`, 'Education', [e.degree, e.field].filter(Boolean).join(', '));
    if (!isPresent(e.end)) add(e.end, `Graduated · ${e.school}`, 'Education', [e.degree, e.field].filter(Boolean).join(', '));
  });
  list(d, 'experience').forEach((e) => add(e.start, [e.title, e.company].filter(Boolean).join(' · '), 'Work', e.description));
  list(d, 'projects').forEach((p) => add(p.year, p.name, 'Project', p.description));
  list(d, 'timeline').forEach((t) => add(t.date, t.title, 'Milestone', t.description));
  return out.sort((a, b) => b.key - a.key);
}
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function timeline(d) {
  const ev = timelineItems(d);
  let view = { y: ev[0].y, m: ev[0].m || 1 };
  const cal = h('div', { class: 'cal pop' });
  const detail = h('div', { class: 'cal-detail' });

  function drawMonth(selected) {
    const { y, m } = view;
    const first = new Date(y, m - 1, 1).getDay(), days = new Date(y, m, 0).getDate();
    const inMonth = ev.filter((e) => e.y === y && e.m === m);
    const marked = new Set(inMonth.map((e) => e.d || 1));
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(h('i', { class: 'pad' }));
    for (let n = 1; n <= days; n++) {
      const dow = (first + n - 1) % 7;
      cells.push(h('i', { class: [marked.has(n) && 'ev', selected && selected.y === y && selected.m === m && (selected.d || 1) === n && 'on', dow === 0 && 'sun', dow === 6 && 'sat'].filter(Boolean).join(' ') }, n));
    }
    const prev = h('button', { class: 'cal-nav', type: 'button', 'aria-label': 'Previous month', onclick: () => step(-1) }, '◀');
    const next = h('button', { class: 'cal-nav', type: 'button', 'aria-label': 'Next month', onclick: () => step(1) }, '▶');
    const grid = h('div', { class: 'cal-grid' }, DOW.map((w, i) => h('b', { class: i === 0 ? 'sun' : i === 6 ? 'sat' : '' }, w)), cells);
    cal.replaceChildren(
      h('div', { class: 'cal-top' }, h('span', { class: 'cal-y' }, y), h('span', { class: 'cal-mname' }, MONTHS[m - 1])),
      h('div', { class: 'cal-row' }, prev, h('span', { class: 'cal-m', 'aria-live': 'polite' }, m), next),
      grid);
  }
  function step(dir) {
    view.m += dir;
    if (view.m < 1) { view.m = 12; view.y--; } else if (view.m > 12) { view.m = 1; view.y++; }
    drawMonth(ev[ctrl.sel]);
    anim(cal.querySelector('.cal-grid'), [{ opacity: 0, transform: `translateX(${dir * 30}px)` }, { opacity: 1, transform: 'none' }], { duration: 280 });
    anim(cal.querySelector('.cal-m'), [{ opacity: 0, transform: `translateX(${dir * 60}px) skewX(-10deg)` }, { opacity: 1, transform: 'none' }], { duration: 340 });
  }

  const items = ev.map((e, i) => h('button', { class: 'ev-row rise', type: 'button', style: `--i:${i}` },
    h('span', { class: 'ev-date' }, e.d ? `${e.m}/${e.d}` : e.m ? MONTHS[e.m - 1] : e.y, h('small', null, e.m ? e.y : 'Year')),
    h('span', { class: 'ev-title' }, e.title), h('span', { class: 'ev-kind' }, e.kind)));
  const el = h('div', { class: 'tl' }, cal, h('div', { class: 'tl-side' }, h('div', { class: 'ev-list scroll' }, items), detail));
  const ctrl = makeList(items, {
    onSelect: (i, prev, quiet) => {
      const e = ev[i];
      const moved = view.y !== e.y || view.m !== (e.m || 1);
      const dir = e.key > (ev[prev]?.key ?? 0) ? 1 : -1;
      view = { y: e.y, m: e.m || 1 };
      drawMonth(e);
      if (moved && !quiet) anim(cal.querySelector('.cal-grid'), [{ opacity: 0, transform: `translateX(${dir * 30}px)` }, { opacity: 1, transform: 'none' }], { duration: 280 });
      swapDetail(detail, tag(e.kind, 'red'), h('div', { class: 'cal-dh' }, e.title), e.detail ? h('p', null, e.detail) : null);
    },
  });
  if (!items.length) drawMonth(null);
  return { el, list: ctrl };
}

// ---------------------------------------------------------------- CONTACT (directory)
function contact(d) {
  const c = d.contact || {};
  const rows = [
    c.email && { k: 'Email', v: c.email, href: 'mailto:' + c.email },
    c.phone && { k: 'Phone', v: c.phone, href: 'tel:' + c.phone.replace(/[^\d+]/g, '') },
    ...list(d, 'socials').map((s) => ({ k: s.platform || 'Link', v: s.handle || pretty(s.url), href: safeUrl(s.url) })),
  ].filter((r) => r && r.href);
  const detail = h('div', { class: 'dir-detail pop' });
  const items = rows.map((r, i) => h('button', { class: 'dir-row rise', type: 'button', style: `--i:${i}` },
    h('span', { class: 'dir-k' }, r.k), h('span', { class: 'dir-v' }, r.v)));
  const el = h('div', { class: 'dir' },
    h('div', { class: 'dir-panel pop' },
      h('div', { class: 'dir-band', 'aria-hidden': 'true' }),
      h('div', { class: 'dir-head' }, 'Directory'),
      h('div', { class: 'dir-list' }, items, empty(Math.max(0, 4 - rows.length), 'dir-row'))),
    detail);
  const ctrl = makeList(items, {
    onSelect: (i) => swapDetail(detail, h('div', { class: 'dir-q' }, 'Where should we meet?'),
      tag(rows[i].k, 'red'), h('div', { class: 'dir-link' }, pretty(rows[i].href)),
      h('a', { class: 'btn-open', href: rows[i].href, target: /^https?:/.test(rows[i].href) ? '_blank' : null, rel: 'noopener noreferrer' }, 'Open')),
    onActivate: (i) => openHref(rows[i].href),
  });
  return { el, list: ctrl };
}

// ---------------------------------------------------------------- SYSTEM
function system(d, ctx) {
  const opts = [
    { label: 'Motion', value: () => settings.motion === 'full' ? 'Full' : 'Reduced', info: 'Full choreography, or short cross-fades only.',
      act: () => { settings.motion = settings.motion === 'full' ? 'reduced' : 'full'; saveSettings(); ctx.onSettings(); } },
    { label: 'Lite Mode', value: () => settings.effects === 'low' ? 'On' : 'Off', info: 'For older hardware: no WebGL sea, no clouds, glows or spinning ring, fewer particles and simpler transitions. Turns on by itself when the site runs slowly. Press L anywhere to switch.',
      act: () => ctx.toggleLite() },
    { label: 'Typeface', value: () => FONTS[settings.font]?.name || 'Sofia Sans Extra Condensed', info: () => [h('p', null, `${FONTS[settings.font]?.name} for titles and menus, paired with Fira Sans Extra Condensed for labels. ${FONTS[settings.font]?.note}. Enter cycles through ${Object.keys(FONTS).length} options.`),
        h('a', { class: 'btn-open', href: 'fonts.html' }, 'Compare all typefaces')],
      act: () => { const keys = Object.keys(FONTS); settings.font = keys[(keys.indexOf(settings.font) + 1) % keys.length]; saveSettings(); ctx.onFont(); } },
    { label: 'About This Site', info: 'Plain HTML, CSS and a WebGL sea, no frameworks. The menus are a love letter to the interface design of Persona 3 Reload; nothing from the game is used.' },
    { label: 'Replay Intro', info: 'Watch the opening again: the light splits the dark and the camera pulls back from the moon.', act: () => ctx.replay() },
  ];
  const info = h('div', { class: 'sys-info pop' });
  const items = opts.map((o, i) => h('button', { class: 'sys-item rise', type: 'button', style: `--i:${i}` },
    h('span', { class: 'sys-slash' }), h('span', { class: 'sys-word' }, o.label), o.value ? h('span', { class: 'sys-val' }, o.value()) : null));
  const el = h('div', { class: 'sys' },
    h('div', { class: 'sys-slab pop', 'aria-hidden': 'true' }),
    h('div', { class: 'sys-giant', 'aria-hidden': 'true' }, 'SYSTEM'),
    h('div', { class: 'sys-disc pop', 'aria-hidden': 'true' }),
    h('div', { class: 'sys-list' }, items), info);
  const ctrl = makeList(items, {
    onSelect: (i) => swapDetail(info, typeof opts[i].info === 'function' ? opts[i].info() : h('p', null, opts[i].info)),
    onActivate: (i) => {
      const o = opts[i];
      o.act?.();
      if (o.value) {
        const v = items[i].querySelector('.sys-val');
        v.textContent = o.value();
        if (typeof o.info === 'function') swapDetail(info, o.info());
        anim(v, [{ scale: 1.35, color: '#ff1f3d' }, { scale: 1 }], { duration: 380, easing: EASE_OUT, fill: 'none' });
      }
    },
  });
  return { el, list: ctrl, noGiant: true, cls: 'page-system' };
}

// ---------------------------------------------------------------- registry
export const SECTIONS = [
  { id: 'profile',    label: 'Profile',    guide: 'Who I am',                 ask: 'What would you like to know?',      render: profile,    has: () => true },
  { id: 'skills',     label: 'Skills',     guide: 'What I can do',            ask: 'Which skill do you want to view?',  render: skills,     has: (d) => list(d, 'skills').length > 0 },
  { id: 'education',  label: 'Education',  guide: 'Where I studied',          ask: 'Which school do you want to view?', render: education,  has: (d) => list(d, 'education').length > 0 },
  { id: 'experience', label: 'Experience', guide: 'Where I have worked',      ask: 'Which role do you want to view?',   render: experience, has: (d) => list(d, 'experience').length > 0 },
  { id: 'projects',   label: 'Projects',   guide: 'Things I have built',      ask: 'Which project do you want to view?', render: projects,  has: (d) => list(d, 'projects').length > 0 },
  { id: 'timeline',   label: 'Calendar',   guide: 'Milestones by date',       ask: 'Which day do you want to view?',    render: timeline,   has: (d) => timelineItems(d).length > 0 },
  { id: 'contact',    label: 'Contact',    guide: 'Get in touch',             ask: 'How do you want to reach me?',      render: contact,    has: (d) => !!(d.contact?.email || d.contact?.phone || list(d, 'socials').some((x) => safeUrl(x.url))) },
  { id: 'system',     label: 'System',     guide: 'Motion, effects and more', ask: 'Which setting do you want to change?', render: system,  has: () => true },
];
