#!/usr/bin/env node
/* ============================================================
   CalcInvest — build (Vercel : `npm run vercel-build`)
   Minifie en place common.js + style.css + tous les views/core JS
   en gardant les mêmes chemins pour ne pas casser les <script src>.
   Sourcemaps inline pour debug prod si besoin.
   ============================================================ */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const glob = (pattern, dir) => {
  const out = [];
  function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith(pattern)) out.push(p);
    }
  }
  walk(dir);
  return out;
};

const TARGETS = {
  js: ['assets/js/common.js', 'assets/js/auth.js', 'assets/js/paywall.js',
       'assets/js/scenarios.js', 'assets/js/wizards.js',
       ...glob('.js', 'assets/js/core'),
       ...glob('.js', 'assets/js/views')],
  css: ['assets/css/style.css']
};

function size(file) {
  try { return fs.statSync(file).size; } catch { return 0; }
}
function fmt(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
  return (n/1024/1024).toFixed(2) + ' MB';
}

async function minify() {
  // Garde : éviter de minifier les sources git localement par erreur.
  // Vercel positionne VERCEL=1, on autorise. Sinon il faut FORCE=1.
  if (!process.env.VERCEL && !process.env.FORCE) {
    console.error('⚠️  Build refusé en local — il minifierait les sources git !');
    console.error('    Si tu veux vraiment lancer en local : FORCE=1 npm run build');
    console.error('    (Vercel l\'exécute automatiquement via vercel-build sur deploy.)');
    process.exit(0);
  }
  let totalBefore = 0, totalAfter = 0;

  // JS
  for (const file of TARGETS.js) {
    if (!fs.existsSync(file)) continue;
    if (file.endsWith('.bundle.js')) continue; // déjà bundled
    const before = size(file);
    totalBefore += before;
    try {
      // transform (et NON build) : minifie le texte tel quel, sans bundler ni
      // wrapper CommonJS. Crucial : nos fichiers ont `module.exports` (tests
      // Node) ET `window.X = ...` (chargés en <script>). esbuild.build()
      // détectait module.exports et encapsulait le fichier → l'assignation
      // globale ne s'exécutait plus → window.CalcDCA undefined → pages cassées.
      const src = fs.readFileSync(file, 'utf8');
      const result = await esbuild.transform(src, {
        minify: true,
        target: 'es2020',
        loader: 'js',
        legalComments: 'none',
      });
      fs.writeFileSync(file, result.code);
      const after = size(file);
      totalAfter += after;
      const pct = before > 0 ? ((1 - after / before) * 100).toFixed(0) : 0;
      console.log('  JS  ' + file + '  ' + fmt(before) + ' -> ' + fmt(after) + '  (-' + pct + '%)');
    } catch (e) {
      console.error('  ✗ ' + file + ': ' + e.message);
    }
  }

  // CSS (esbuild minifie aussi le CSS)
  for (const file of TARGETS.css) {
    if (!fs.existsSync(file)) continue;
    const before = size(file);
    totalBefore += before;
    try {
      const src = fs.readFileSync(file, 'utf8');
      const result = await esbuild.transform(src, {
        minify: true,
        loader: 'css',
        legalComments: 'none',
      });
      fs.writeFileSync(file, result.code);
      const after = size(file);
      totalAfter += after;
      const pct = before > 0 ? ((1 - after / before) * 100).toFixed(0) : 0;
      console.log('  CSS ' + file + '  ' + fmt(before) + ' -> ' + fmt(after) + '  (-' + pct + '%)');
    } catch (e) {
      console.error('  ✗ ' + file + ': ' + e.message);
    }
  }

  const savedPct = totalBefore > 0 ? ((1 - totalAfter / totalBefore) * 100).toFixed(0) : 0;
  console.log('\n  TOTAL: ' + fmt(totalBefore) + ' -> ' + fmt(totalAfter) + '  (-' + savedPct + '%)');
}

minify().catch(e => { console.error(e); process.exit(1); });
