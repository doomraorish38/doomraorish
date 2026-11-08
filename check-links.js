const fs = require('fs');
const INDEX = process.env.INDEX_FILE || 'index.html';
const OUT = process.env.OUT_FILE || 'status.json';
const DB = process.env.DB_URL || 'https://doomfilms-3ee0f-default-rtdb.asia-southeast1.firebasedatabase.app';
const key = u => String(u).replace(/[^a-z0-9]/gi, '_').slice(0, 100);

function loadLinks() {
  const t = fs.readFileSync(INDEX, 'utf8');
  const m = t.match(/const LINKS=(\[[\s\S]*?\n\]);/);
  if (!m) throw new Error('LINKS not found in ' + INDEX);
  return new Function('return ' + m[1])().filter(l => l && l.u);
}
async function loadCustom() {
  if (process.env.SKIP_DB) return [];
  try {
    const r = await fetch(DB + '/config/custom.json', { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return [];
    const o = await r.json();
    return Object.values(o || {}).filter(x => x && /^https?:\/\/\S+$/i.test(x.u));
  } catch (e) { return []; }
}
async function probe(u) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(u, {
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; DoomFilmsLinkCheck/1.0)', accept: 'text/html,*/*' }
      });
      try { await r.body.cancel(); } catch (e) {}
      const s = r.status;
      if (!(s >= 500 || s === 404 || s === 410)) return true;
    } catch (e) {}
    if (i < 2) await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}
(async () => {
  const all = [...loadLinks(), ...(await loadCustom())];
  const uniq = new Map();
  all.forEach(l => uniq.set(key(l.u), l.u));
  const entries = [...uniq];
  const res = {};
  for (let i = 0; i < entries.length; i += 8) {
    await Promise.all(entries.slice(i, i + 8).map(async ([k, u]) => { res[k] = { ok: await probe(u) }; }));
  }
  const down = Object.values(res).filter(x => !x.ok).length;
  console.log('checked', entries.length, 'links, down:', down);
  if (entries.length && down === entries.length) {
    console.log('every link failed, not writing status.json.');
    return;
  }
  fs.writeFileSync(OUT, JSON.stringify({ checked: new Date().toISOString(), links: res }));
})();
