'use strict';
// Import profile data from a file.
//
// Chosen format: LinkedIn's own data export ("Settings → Data privacy → Get a copy of your data").
// It arrives as a .zip of CSV files; we read Profile, Positions, Education, Skills, Certifications,
// Honors, Projects, Email Addresses and PhoneNumbers. You can also pick the .csv files directly,
// or a .json backup previously exported from this site (which replaces the draft as-is).
//
// Imported entries are merged into the current data: matching entries (same school, same role,
// same skill name, ...) are updated, new ones are added, nothing existing is deleted.
// Everything lands in the editor's draft; nothing is saved until you press SAVE.
(function () {
  const dec = new TextDecoder();

  // ---- minimal ZIP reader (stored + deflate entries, via the browser's DecompressionStream) ----
  async function unzip(file, wanted) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error(`${file.name} is not a ZIP file`);
    const count = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    const out = {};
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true);
      const csize = dv.getUint32(off + 20, true);
      const nameLen = dv.getUint16(off + 28, true), extraLen = dv.getUint16(off + 30, true), commentLen = dv.getUint16(off + 32, true);
      const local = dv.getUint32(off + 42, true);
      const name = dec.decode(buf.subarray(off + 46, off + 46 + nameLen));
      off += 46 + nameLen + extraLen + commentLen;
      if (!wanted(name)) continue;
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const raw = buf.subarray(start, start + csize);
      let bytes;
      if (method === 0) bytes = raw;
      else if (method === 8) {
        if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot unzip; extract the ZIP and pick its CSV files instead');
        const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      } else continue;
      out[name.split('/').pop()] = dec.decode(bytes);
    }
    return out;
  }

  // ---- CSV (RFC 4180: quoted fields, doubled quotes, newlines inside quotes) ----
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const rows = []; let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim()));
  }

  // rows of a named CSV as objects; LinkedIn sometimes puts notes above the header, so find it by a key column
  function table(csvs, nameRe, keyCol) {
    const name = Object.keys(csvs).find((n) => nameRe.test(n));
    if (!name) return [];
    const rows = parseCSV(csvs[name]);
    const hi = rows.findIndex((r) => r.map((x) => x.trim()).includes(keyCol));
    if (hi < 0) return [];
    const head = rows[hi].map((x) => x.trim());
    return rows.slice(hi + 1).map((r) => Object.fromEntries(head.map((k, i) => [k, (r[i] || '').trim()])));
  }

  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  function mergeList(target, incoming, keyFn) {
    let added = 0;
    for (const item of incoming) {
      if (!keyFn(item)) continue;
      const hit = target.find((t) => keyFn(t) === keyFn(item));
      if (hit) { for (const [k, v] of Object.entries(item)) if (String(v).trim()) hit[k] = v; }
      else { target.push(item); added++; }
    }
    return incoming.filter(keyFn).length;
  }
  function platformOf(url) {
    const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
    const known = { 'linkedin.com': 'LinkedIn', 'github.com': 'GitHub', 'instagram.com': 'Instagram', 'x.com': 'X', 'twitter.com': 'X',
      'youtube.com': 'YouTube', 'behance.net': 'Behance', 'dribbble.com': 'Dribbble', 'medium.com': 'Medium', 'leetcode.com': 'LeetCode' };
    return known[host] || 'Website';
  }

  function fromLinkedIn(csvs, base) {
    const d = structuredClone(base || {});
    d.profile = d.profile || {}; d.contact = d.contact || {};
    for (const k of ['education', 'experience', 'skills', 'certifications', 'achievements', 'projects', 'socials']) d[k] = d[k] || [];
    const summary = {};

    const P = table(csvs, /^profile\.csv$/i, 'First Name')[0];
    if (P) {
      const name = [P['First Name'], P['Last Name']].filter(Boolean).join(' ');
      if (name) d.profile.name = name;
      if (P.Headline) d.profile.headline = P.Headline;
      if (P['Geo Location']) d.profile.location = P['Geo Location'];
      if (P.Summary) d.profile.about = P.Summary;
      summary.profile = 1;
      const urls = (P.Websites || '').match(/https?:\/\/[^\s,\]]+/g) || [];
      const tw = ((P['Twitter Handles'] || '').match(/[A-Za-z0-9_]{1,15}/g) || []).map((h) => `https://x.com/${h}`);
      const socials = [...urls, ...tw].map((url) => ({ platform: platformOf(url), handle: '', url }));
      summary['social links'] = mergeList(d.socials, socials, (s) => norm(s.url).replace(/\/$/, ''));
    }

    const emails = table(csvs, /^email addresses\.csv$/i, 'Email Address');
    const email = (emails.find((e) => /yes/i.test(e.Primary)) || emails[0] || {})['Email Address'];
    if (email) { d.contact.email = email; summary.email = 1; }
    const phone = (table(csvs, /^phonenumbers\.csv$/i, 'Number')[0] || {}).Number;
    if (phone) { d.contact.phone = phone; summary.phone = 1; }

    summary.education = mergeList(d.education, table(csvs, /^education\.csv$/i, 'School Name').map((e) => ({
      school: e['School Name'], degree: e['Degree Name'], field: '', start: e['Start Date'], end: e['End Date'],
      description: [e.Notes, e.Activities].filter(Boolean).join('\n') })), (e) => norm(e.school));
    summary.roles = mergeList(d.experience, table(csvs, /^positions\.csv$/i, 'Company Name').map((e) => ({
      title: e.Title, company: e['Company Name'], start: e['Started On'], end: e['Finished On'] || 'Present',
      location: e.Location, description: e.Description })), (e) => norm(e.company) + '|' + norm(e.title));
    summary.skills = mergeList(d.skills, table(csvs, /^skills\.csv$/i, 'Name').map((s) => ({ name: s.Name, level: '' })), (s) => norm(s.name));
    summary.certifications = mergeList(d.certifications, table(csvs, /^certifications\.csv$/i, 'Name').map((c) => ({
      name: c.Name, issuer: c.Authority, date: c['Started On'], link: c.Url })), (c) => norm(c.name));
    summary.achievements = mergeList(d.achievements, table(csvs, /^honors\.csv$/i, 'Title').map((a) => ({
      title: a.Title, event: '', date: a['Issued On'], description: a.Description, link: '' })), (a) => norm(a.title));
    summary.projects = mergeList(d.projects, table(csvs, /^projects\.csv$/i, 'Title').map((p) => ({
      name: p.Title, link: p.Url, description: p.Description })), (p) => norm(p.name));
    return { data: d, summary };
  }

  async function importFiles(fileList, base) {
    const files = [...fileList];
    if (files.length === 1 && /\.json$/i.test(files[0].name)) {
      const obj = JSON.parse(await files[0].text());
      if (!obj || typeof obj.profile !== 'object') throw new Error('that JSON is not a portfolio backup (no "profile")');
      return { data: obj, summary: { 'sections from backup': Object.keys(obj).length } };
    }
    const csvs = {};
    for (const f of files) {
      if (/\.zip$/i.test(f.name) || f.type === 'application/zip') Object.assign(csvs, await unzip(f, (n) => /\.csv$/i.test(n)));
      else if (/\.csv$/i.test(f.name)) csvs[f.name] = await f.text();
    }
    if (!Object.keys(csvs).length) throw new Error('no LinkedIn CSV files found (pick the export .zip, its .csv files, or a .json backup)');
    return fromLinkedIn(csvs, base);
  }

  window.PortfolioImport = { importFiles, _parseCSV: parseCSV, _fromLinkedIn: fromLinkedIn };
})();
