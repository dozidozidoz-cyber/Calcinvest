#!/usr/bin/env node
/**
 * Synchronise les <lastmod> du sitemap sur la vraie date de dernière
 * modification de chaque page (dernier commit git touchant le fichier).
 *
 * Pourquoi : le sitemap était maintenu à la main et toutes les dates
 * étaient figées au 2026-07-02, alors que des pages changeaient encore.
 * Google n'avait donc aucun signal l'invitant à revenir — l'inspection
 * d'URL du 10/11/2026 montrait une dernière exploration remontant au
 * 12 juin pour calculateur-impot-revenu.
 *
 * Usage :
 *   node scripts/update_sitemap_lastmod.js           (écrit)
 *   node scripts/update_sitemap_lastmod.js --check    (échoue si périmé)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RACINE = path.resolve(__dirname, '..');
const SITEMAP = path.join(RACINE, 'sitemap.xml');
const CHECK = process.argv.includes('--check');

/** URL publique -> fichier local */
function fichierPour(url) {
  const slug = url.replace(/^https:\/\/calcinvest\.fr/, '').replace(/\/$/, '');
  const candidats = slug === '' ? ['index.html'] : [slug.slice(1) + '.html'];
  for (const c of candidats) {
    const p = path.join(RACINE, c);
    if (fs.existsSync(p)) return c;
  }
  return null;
}

/** Date du dernier commit touchant ce fichier (YYYY-MM-DD) */
function dateGit(fichier) {
  try {
    const d = execSync(`git log -1 --format=%cs -- "${fichier}"`, {
      cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  } catch { return null; }
}

let xml = fs.readFileSync(SITEMAP, 'utf8');
const blocs = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)];

let modifiees = 0, inconnues = [], perimees = [];

blocs.forEach(b => {
  const bloc = b[1];
  const url = (bloc.match(/<loc>([^<]+)<\/loc>/) || [])[1];
  const actuelle = (bloc.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1];
  if (!url) return;

  const f = fichierPour(url);
  if (!f) { inconnues.push(url); return; }

  const reelle = dateGit(f);
  if (!reelle || reelle === actuelle) return;

  perimees.push({ url: url.replace('https://calcinvest.fr', '') || '/', de: actuelle, vers: reelle });
  if (!CHECK) {
    const neuf = bloc.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${reelle}</lastmod>`);
    xml = xml.replace(b[0], `<url>${neuf}</url>`);
    modifiees++;
  }
});

if (inconnues.length) {
  console.log('⚠ URLs du sitemap sans fichier local (' + inconnues.length + ') :');
  inconnues.slice(0, 5).forEach(u => console.log('    ' + u));
}

if (CHECK) {
  if (perimees.length) {
    console.log('✗ ' + perimees.length + ' date(s) <lastmod> périmée(s) dans sitemap.xml');
    perimees.slice(0, 10).forEach(p => console.log('    ' + p.url + ' : ' + p.de + ' → ' + p.vers));
    console.log('\n  Corriger avec : node scripts/update_sitemap_lastmod.js');
    process.exit(1);
  }
  console.log('✓ Toutes les dates <lastmod> sont à jour (' + blocs.length + ' URLs)');
  process.exit(0);
}

if (modifiees) {
  fs.writeFileSync(SITEMAP, xml);
  console.log('✓ ' + modifiees + ' date(s) mise(s) à jour sur ' + blocs.length + ' URLs');
  perimees.slice(0, 12).forEach(p => console.log('    ' + p.url + ' : ' + p.de + ' → ' + p.vers));
  if (perimees.length > 12) console.log('    … +' + (perimees.length - 12) + ' autres');
} else {
  console.log('✓ Rien à faire, les ' + blocs.length + ' dates sont déjà exactes');
}
