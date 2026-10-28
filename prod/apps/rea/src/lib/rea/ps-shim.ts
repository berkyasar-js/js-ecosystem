import fs from 'node:fs';
import path from 'node:path';

/**
 * Vercel/Lambda imajında `ps` yoktur; rea-agents süreç sahipliğini `ps -axo pid=,ppid=,pgid=,uid=,stat=,command=`
 * ile gözler. Bu shim /proc'tan aynı çıktıyı üretir. Çalışma dizinine `bin/ps` olarak yazılır ve PATH'in başına eklenir.
 * Kaynak dosya değil, metin olarak gömülü (izleme/paketleme sorunlarını önler).
 */
const PS_SHIM = () => `#!${process.execPath}
'use strict';
const fs = require('fs');
const argv = process.argv.slice(2);
let cols = ['pid', 'ppid', 'pgid', 'uid', 'stat', 'command'];
let header = true;
let pids = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-o' || a === '-axo' || a === '-eo' || a === 'o' || a === '-ao' || a === '-xo') {
    const spec = argv[++i] || '';
    cols = spec.split(',').map((c) => c.replace(/=.*$/, '').trim()).filter(Boolean);
    header = !spec.includes('=');
  } else if (a === '-p' || a === '--pid') pids = String(argv[++i] || '').split(',').map(Number);
  else if (/^-?p\\d/.test(a)) pids = a.replace(/^-?p/, '').split(',').map(Number);
}
const ownUid = typeof process.getuid === 'function' ? process.getuid() : 0;
const rows = [];
let entries = [];
try { entries = fs.readdirSync('/proc'); } catch { entries = []; }
for (const e of entries) {
  if (!/^\\d+$/.test(e)) continue;
  const pid = Number(e);
  if (pids && !pids.includes(pid)) continue;
  let stat;
  try { stat = fs.readFileSync('/proc/' + e + '/stat', 'utf8'); } catch { continue; }
  const close = stat.lastIndexOf(')');
  const comm = stat.slice(stat.indexOf('(') + 1, close);
  const rest = stat.slice(close + 2).split(' ');
  const state = rest[0] || 'S';
  const ppid = rest[1] || '0';
  const pgid = rest[2] || '0';
  let uid = ownUid;
  try { const m = /^Uid:\\s+(\\d+)/m.exec(fs.readFileSync('/proc/' + e + '/status', 'utf8')); if (m) uid = Number(m[1]); } catch {}
  let command = comm;
  try { const c = fs.readFileSync('/proc/' + e + '/cmdline', 'utf8').split('\\0').filter(Boolean).join(' '); if (c) command = c; } catch {}
  const map = { pid: String(pid), ppid, pgid, uid: String(uid), stat: state, state, s: state, command, args: command, comm, cmd: command, user: String(uid) };
  rows.push(cols.map((c) => (c in map ? map[c] : '')).join(' '));
}
if (header) process.stdout.write(cols.map((c) => c.toUpperCase()).join(' ') + '\\n');
process.stdout.write(rows.join('\\n') + (rows.length ? '\\n' : ''));
`;

/** `ps` shim'ini `dir/bin/ps` olarak yazar ve PATH'e eklenecek dizini döner. Sistemde gerçek `ps` varsa yine shim öne alınmaz. */
export function ensurePsShim(dir: string): string | null {
  const real = (process.env.PATH ?? '').split(path.delimiter).some((p) => p && fs.existsSync(path.join(p, 'ps')));
  if (real) return null;
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const file = path.join(bin, 'ps');
  fs.writeFileSync(file, PS_SHIM(), { mode: 0o755 });
  try { fs.chmodSync(file, 0o755); } catch { /* yetki yoksa node ile çağrılmaz; en iyi çaba */ }
  return bin;
}
