import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Source of truth is clis/goofish/. What OpenCLI actually serves lives in
// ~/.opencli/clis/<site>/ as real-file copies made by scripts/install-adapters.sh
// (a symlink there is never loaded: dist/src/cli.js listJsFiles keeps only
// Dirents that are a real directory or a real file). The `xianyu` alias is the
// same files with the `site:` line rewritten. This guard fails when the served
// copy drifts from the repo — measured 2026-09-02: seller.js served 4-day-old
// navigation code while the repo had the fix.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.GOOFISH_ADAPTER_SRC || path.resolve(HERE, '..', 'clis', 'goofish');
const CLIS = process.env.OPENCLI_CLIS_DIR || path.join(os.homedir(), '.opencli', 'clis');
const ALIASES = (process.env.GOOFISH_SITE_ALIASES || 'xianyu').split(/\s+/).filter(Boolean);
const SITES = ['goofish', ...ALIASES];
const SITE_LINE = /^(\s*site:\s*)'goofish'/gm;

function lstatOrNull(p) { try { return fs.lstatSync(p); } catch { return null; } }
function jsFiles(dir) { return fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort(); }

test('installed override dirs are real directories, never symlinks', (t) => {
  const present = SITES.filter(s => lstatOrNull(path.join(CLIS, s)));
  if (present.length === 0) { t.skip(`nothing installed under ${CLIS}`); return; }
  for (const site of present) {
    const st = lstatOrNull(path.join(CLIS, site));
    assert.ok(!st.isSymbolicLink(), `${CLIS}/${site} is a symlink — OpenCLI never reads it; run scripts/install-adapters.sh`);
    assert.ok(st.isDirectory(), `${CLIS}/${site} is not a directory`);
  }
  console.log(`override dir guard: checked ${present.length} site dirs`);
});

test('served copies match clis/goofish (alias copies differ only in the site line)', (t) => {
  const present = SITES.filter(s => lstatOrNull(path.join(CLIS, s))?.isDirectory());
  if (present.length === 0) { t.skip(`nothing installed under ${CLIS}`); return; }
  const files = jsFiles(SRC);
  assert.ok(files.length > 0, `no adapters found in ${SRC}`);
  let graded = 0;
  for (const site of present) {
    for (const f of files) {
      const src = fs.readFileSync(path.join(SRC, f), 'utf-8');
      const dest = path.join(CLIS, site, f);
      assert.ok(fs.existsSync(dest), `${site}/${f} missing — run scripts/install-adapters.sh`);
      const expected = site === 'goofish' ? src : src.replace(SITE_LINE, `$1'${site}'`);
      assert.strictEqual(fs.readFileSync(dest, 'utf-8'), expected,
        `${site}/${f} drifted from clis/goofish/${f} — run scripts/install-adapters.sh`);
      graded++;
    }
  }
  console.log(`install drift guard: graded ${graded} served files across ${present.length} sites`);
  assert.ok(graded >= files.length, 'drift guard graded fewer files than the repo holds');
});
