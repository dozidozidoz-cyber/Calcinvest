#!/usr/bin/env python3
"""Refactor parseFloat($('xxx').value) || N → CI.safeNum('xxx', N)
   et $('xxx').value || 'X' → CI.safeStr('xxx', 'X')
   dans les views trading."""
import re, os

FILES = [
    'assets/js/views/cost.view.js',
    'assets/js/views/fisca-trading.view.js',
    'assets/js/views/margin.view.js',
    'assets/js/views/mctrading.view.js',
    'assets/js/views/pips.view.js',
    'assets/js/views/risk.view.js',
    # Ces autres views potentielles
    'assets/js/views/fire.view.js',
    'assets/js/views/per.view.js',
    'assets/js/views/dcf.view.js',
    'assets/js/views/compound.view.js',
    'assets/js/views/loan.view.js',
    'assets/js/views/impot.view.js',
]

# Pattern : parseFloat($('id').value) || fallback
# ou       parseFloat($('id').value)  || fallback
PAT_NUM = re.compile(r"""parseFloat\(\s*\$\(\s*['"]([^'"]+)['"]\s*\)\.value\s*\)\s*\|\|\s*([\d.\-]+)""")
# Pattern : $('id').value || 'string'
PAT_STR = re.compile(r"""\$\(\s*['"]([^'"]+)['"]\s*\)\.value\s*\|\|\s*['"]([^'"]+)['"]""")

total_num = 0
total_str = 0
files_touched = []

for fp in FILES:
    if not os.path.exists(fp): continue
    with open(fp, 'r', encoding='utf-8') as f: c = f.read()

    orig = c
    # num
    def repl_num(m):
        return f"CI.safeNum('{m.group(1)}', {m.group(2)})"
    c, n = PAT_NUM.subn(repl_num, c)

    # str (uniquement pour les patterns simples — pas $('x').value && ...)
    def repl_str(m):
        return f"CI.safeStr('{m.group(1)}', '{m.group(2)}')"
    c, s = PAT_STR.subn(repl_str, c)

    if c != orig:
        with open(fp, 'w', encoding='utf-8') as f: f.write(c)
        files_touched.append((fp, n, s))
        total_num += n
        total_str += s

print('parseFloat->safeNum: %d | str->safeStr: %d' % (total_num, total_str))
for fp, n, s in files_touched:
    print(f'  {fp}: num={n} str={s}')
