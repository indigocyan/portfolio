// Portfolio server — no dependencies.
// Anyone on the network can VIEW. Only this PC can EDIT:
//   1. the request must come from a loopback address (127.0.0.1 / ::1),
//   2. it must not carry proxy/forwarding headers (so a tunnel can't masquerade as local),
//   3. it must carry the secret admin cookie, which is set by opening the admin
//      link printed at startup (the key lives in .admin_key, on this PC only).
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'docs');            // the static site (what gets hosted)
const DATA_FILE = path.join(PUBLIC_DIR, 'profile.json');
const KEY_FILE = path.join(ROOT, '.admin_key');
const MAX_BODY = 5 * 1024 * 1024; // 5 MB (room for an avatar image)

// ---------- admin key ----------
let ADMIN_KEY;
if (fs.existsSync(KEY_FILE)) {
  ADMIN_KEY = fs.readFileSync(KEY_FILE, 'utf8').trim();
} else {
  ADMIN_KEY = crypto.randomBytes(24).toString('hex');
  fs.writeFileSync(KEY_FILE, ADMIN_KEY + '\n', { mode: 0o600 });
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function isLoopback(req) {
  const addr = req.socket.remoteAddress || '';
  const local = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  const forwarded = ['x-forwarded-for', 'forwarded', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip']
    .some((h) => req.headers[h] !== undefined);
  return local && !forwarded;
}

function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function canEdit(req) {
  return isLoopback(req) && safeEqual(cookies(req).p3_admin || '', ADMIN_KEY);
}

// Block cross-site writes: Origin (if present) must be a loopback origin.
function originOk(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try {
    const h = new URL(o).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  } catch { return false; }
}

// ---------- helpers ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function git(args, cb) {
  execFile('git', args, { cwd: ROOT, timeout: 60000 }, (err, stdout, stderr) => cb(err ? (stderr || err.message).trim() : null, stdout.trim()));
}

function publish(cb) {
  git(['remote', 'get-url', 'origin'], (err) => {
    if (err) return cb('Publishing is not set up yet (no git remote).');
    git(['add', 'docs'], (err) => {
      if (err) return cb(err);
      git(['diff', '--cached', '--quiet'], (hasChanges) => {  // exit 1 (error) means there are staged changes
        const push = () => git(['push', 'origin', 'HEAD'], (err) => cb(err, 'Published! Live in about a minute.'));
        if (!hasChanges) return push(); // nothing new staged; push any unpushed commits
        git(['commit', '-m', 'Update portfolio content'], (err) => err ? cb(err) : push());
      });
    });
  });
}

function writeProfile(obj) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  try {
    // Admin login: only works from this PC with the right key.
    if (p === '/admin' && req.method === 'GET') {
      if (!isLoopback(req) || !safeEqual(url.searchParams.get('key') || '', ADMIN_KEY)) {
        return send(res, 403, 'Editing is only available on the owner\'s PC.', 'text/plain; charset=utf-8');
      }
      return send(res, 302, '', 'text/plain', {
        'Set-Cookie': `p3_admin=${ADMIN_KEY}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`,
        Location: '/',
      });
    }

    if (p === '/api/whoami' && req.method === 'GET') {
      return send(res, 200, { canEdit: canEdit(req) }, undefined, { 'Cache-Control': 'no-store' });
    }

    // Publish = commit docs/ and push it to the static host. Does nothing until a git remote is configured.
    if (p === '/api/publish' && req.method === 'POST') {
      if (!canEdit(req) || !originOk(req)) return send(res, 403, { error: 'read-only' });
      return publish((err, message) => err ? send(res, 500, { error: err }) : send(res, 200, { ok: true, message }));
    }

    if (p === '/api/profile' && req.method === 'PUT') {
      if (!canEdit(req) || !originOk(req)) return send(res, 403, { error: 'read-only' });
      if (!(req.headers['content-type'] || '').startsWith('application/json')) {
        return send(res, 415, { error: 'json only' });
      }
      const data = JSON.parse(await readBody(req));
      if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.profile !== 'object') {
        return send(res, 400, { error: 'invalid profile' });
      }
      writeProfile(data);
      return send(res, 200, { ok: true });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method' });

    // Static files
    const rel = p === '/' ? 'index.html' : decodeURIComponent(p).replace(/^\/+/, '');
    const file = path.resolve(PUBLIC_DIR, rel);
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 404, 'not found', 'text/plain');
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, 'not found', 'text/plain');
      send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream');
    });
  } catch (e) {
    send(res, e.message === 'too large' ? 413 : 400, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Portfolio running on port ${PORT}`);
  console.log(`  View (anyone on your network): http://<this-pc-ip>:${PORT}`);
  console.log(`  Edit (this PC only, open once): http://localhost:${PORT}/admin?key=${ADMIN_KEY}\n`);
});
