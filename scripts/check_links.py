#!/usr/bin/env python3
import os, re, glob
valid = set(['/'])
for f in glob.glob('*.html') + glob.glob('blog/*.html'):
    f = f.replace(os.sep, '/')
    if f == 'index.html': continue
    valid.add('/' + f.replace('.html',''))

issues = []
for f in glob.glob('*.html') + glob.glob('blog/*.html'):
    f = f.replace(os.sep, '/')
    with open(f,'r',encoding='utf-8') as fp: c = fp.read()
    for m in re.finditer(r'href="(/[^"#?]*)"', c):
        t = m.group(1)
        if t.startswith('/assets/') or t.startswith('/api/') or t == '/sw.js' or t == '/manifest.json': continue
        norm = t.rstrip('/') or '/'
        if norm not in valid:
            issues.append((f, t))
print('Liens internes cassés:', len(issues))
for x in issues[:30]: print(' ', x)
