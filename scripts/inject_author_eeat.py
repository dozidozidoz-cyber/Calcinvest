"""
E-E-A-T pack — sur tous les articles blog :
  1. JSON-LD Article : author Organization → Person (Nicolas D.,
     lien page À propos + profil X via sameAs)
  2. Bio auteur visible en fin d'article (avant le bloc related)

Usage : python scripts/inject_author_eeat.py   (idempotent)
"""
import sys, io
from pathlib import Path

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = PATH = Path(__file__).resolve().parent.parent

OLD_AUTHOR = '"author": {"@type": "Organization", "name": "CalcInvest"}'
NEW_AUTHOR = '"author": {"@type": "Person", "@id": "https://calcinvest.fr/a-propos#nicolas", "name": "Nicolas D.", "url": "https://calcinvest.fr/a-propos", "sameAs": ["https://x.com/nicoladoz1"]}'

BIO_BOX = '''
      <!-- ═══ Bio auteur (E-E-A-T) ═══ -->
      <div class="ci-author-bio" style="display:flex;gap:16px;align-items:flex-start;padding:20px;background:var(--bg-2);border:1px solid var(--border);border-radius:var(--r);margin:32px 0 8px">
        <div style="width:48px;height:48px;border-radius:50%;background:var(--accent-soft);display:grid;place-items:center;flex-shrink:0;font:700 20px var(--font-sans);color:var(--accent)">N</div>
        <div style="font-size:13px;line-height:1.6;color:var(--text-2)">
          <strong style="color:var(--text);font-size:14px">Nicolas D.</strong> — Investisseur particulier passionné de bourse et de crypto depuis plusieurs années. Je crée et maintiens les simulateurs CalcInvest pour tester mes propres stratégies sur données réelles.
          <a href="/a-propos" style="color:var(--accent)">En savoir plus</a> ·
          <a href="https://x.com/nicoladoz1" target="_blank" rel="noopener" style="color:var(--accent)">@nicoladoz1 sur X</a>
        </div>
      </div>
'''


def main():
    count = 0
    for p in (ROOT / 'blog').glob('*.html'):
        txt = p.read_text(encoding='utf-8')
        changed = False
        if OLD_AUTHOR in txt:
            txt = txt.replace(OLD_AUTHOR, NEW_AUTHOR)
            changed = True
        if 'ci-author-bio' not in txt:
            anchor = '<!-- RELATED -->'
            alt_anchor = '<div class="article-related">'
            if anchor in txt:
                txt = txt.replace(anchor, BIO_BOX + '\n      ' + anchor, 1)
                changed = True
            elif alt_anchor in txt:
                txt = txt.replace(alt_anchor, BIO_BOX + '\n      ' + alt_anchor, 1)
                changed = True
        if changed:
            p.write_text(txt, encoding='utf-8')
            count += 1
            print(f'  ✓ {p.name}')
    print(f'\n{count} articles patchés (Person schema + bio)')


if __name__ == '__main__':
    main()
