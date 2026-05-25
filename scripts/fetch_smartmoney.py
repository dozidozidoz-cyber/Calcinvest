"""
CalcInvest — Smart Money tracker
=================================

Récupère 3 sources :
  1. 13F institutionnels  (SEC EDGAR, gratuit, public)
  2. ARK Invest daily     (CSV publiés par ark-funds.com)
  3. Congress STOCK Act   (House + Senate stock watcher S3 buckets)

Sortie : assets/data/smart-money/*.json

Usage :
    pip install requests pandas
    python scripts/fetch_smartmoney.py             # tout
    python scripts/fetch_smartmoney.py --only 13f  # 13f | ark | congress
"""
import argparse
import io
import json
import re
import sys
import time
import zipfile
from pathlib import Path
from datetime import datetime
from xml.etree import ElementTree as ET

import requests

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'data' / 'smart-money'
OUT.mkdir(parents=True, exist_ok=True)

UA = {'User-Agent': 'CalcInvest research dozidozidoz@gmail.com'}

# ============================================================================
# 1. 13F INSTITUTIONNELS — SEC EDGAR
# ============================================================================

MANAGERS_13F = {
    'berkshire':  {'name': 'Warren Buffett',       'fund': 'Berkshire Hathaway',   'cik': '0001067983'},
    'scion':      {'name': 'Michael Burry',        'fund': 'Scion Asset Mgmt',     'cik': '0001649339'},
    'pershing':   {'name': 'Bill Ackman',          'fund': 'Pershing Square',      'cik': '0001336528'},
    'duquesne':   {'name': 'Stanley Druckenmiller','fund': 'Duquesne Family Office','cik': '0001536411'},
    'appaloosa':  {'name': 'David Tepper',         'fund': 'Appaloosa Management', 'cik': '0001656456'},
}

EDGAR_SUB = 'https://data.sec.gov/submissions/CIK{cik}.json'
EDGAR_DOC = 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=13F-HR&dateb=&owner=include&count=10'
EDGAR_FILING_INDEX = 'https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_nodash}/'

NS_13F = {'ns': 'http://www.sec.gov/edgar/document/thirteenf/informationtable'}


def fetch_13f_filings(cik, limit=2):
    """Retourne les N derniers 13F-HR d'un gérant."""
    r = requests.get(EDGAR_SUB.format(cik=cik), headers=UA, timeout=30)
    r.raise_for_status()
    sub = r.json()
    recent = sub['filings']['recent']
    out = []
    for i, form in enumerate(recent['form']):
        if form != '13F-HR':
            continue
        out.append({
            'accession': recent['accessionNumber'][i],
            'filed': recent['filingDate'][i],
            'period': recent['reportDate'][i],
        })
        if len(out) >= limit:
            break
    return out


def parse_13f_information_table(cik, accession):
    """Télécharge et parse l'XML informationTable d'un 13F."""
    cik_int = str(int(cik))
    acc_nodash = accession.replace('-', '')
    idx_url = EDGAR_FILING_INDEX.format(cik_int=cik_int, acc_nodash=acc_nodash) + 'index.json'
    r = requests.get(idx_url, headers=UA, timeout=30)
    r.raise_for_status()
    items = r.json()['directory']['item']
    # informationTable = tout XML qui n'est PAS le cover primary_doc.xml
    xml_name = None
    for it in items:
        n = it['name'].lower()
        if n.endswith('.xml') and 'primary_doc' not in n:
            xml_name = it['name']
            break
    if not xml_name:
        return None

    xml_url = EDGAR_FILING_INDEX.format(cik_int=cik_int, acc_nodash=acc_nodash) + xml_name
    r = requests.get(xml_url, headers=UA, timeout=30)
    r.raise_for_status()
    root = ET.fromstring(r.content)

    positions = []
    total_value = 0
    for info in root.findall('ns:infoTable', NS_13F):
        name = info.findtext('ns:nameOfIssuer', '', NS_13F)
        cls = info.findtext('ns:titleOfClass', '', NS_13F)
        cusip = info.findtext('ns:cusip', '', NS_13F)
        value = int(info.findtext('ns:value', '0', NS_13F) or 0)
        shares = int(info.findtext('ns:shrsOrPrnAmt/ns:sshPrnamt', '0', NS_13F) or 0)
        positions.append({
            'issuer': name, 'class': cls, 'cusip': cusip,
            'value': value, 'shares': shares,
        })
        total_value += value

    for p in positions:
        p['pct'] = round(100 * p['value'] / total_value, 3) if total_value else 0
    positions.sort(key=lambda x: -x['value'])
    return {'positions': positions, 'total_value': total_value, 'count': len(positions)}


def run_13f():
    print('\n=== 13F INSTITUTIONNELS ===')
    for mid, meta in MANAGERS_13F.items():
        try:
            print(f'  → {meta["name"]} ({meta["fund"]})')
            filings = fetch_13f_filings(meta['cik'], limit=2)
            out_filings = []
            for f in filings:
                time.sleep(0.3)
                data = parse_13f_information_table(meta['cik'], f['accession'])
                if not data:
                    print(f'    [skip] {f["period"]} — XML introuvable')
                    continue
                out_filings.append({
                    'period': f['period'],
                    'filed': f['filed'],
                    'accession': f['accession'],
                    **data,
                })
            payload = {
                'meta': {**meta, 'id': mid, 'type': '13F'},
                'updated': datetime.utcnow().isoformat() + 'Z',
                'filings': out_filings,
            }
            (OUT / f'{mid}.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
            print(f'    ✓ {len(out_filings)} filings ({sum(f["count"] for f in out_filings)} lignes)')
            time.sleep(0.3)
        except Exception as e:
            print(f'    ✗ {e}')


# ============================================================================
# 2. ARK INVEST — daily holdings CSV
# ============================================================================

ARK_FUNDS = ['ARKK', 'ARKQ', 'ARKW', 'ARKG', 'ARKF', 'ARKX']
ARKFUNDS_API = 'https://arkfunds.io/api/v2/etf/holdings?symbol={symbol}'


def run_ark():
    """Source: arkfunds.io API (public, gratuit, CORS-friendly)."""
    print('\n=== ARK DAILY (via arkfunds.io) ===')
    out = {'updated': datetime.utcnow().isoformat() + 'Z', 'funds': {}}
    for fund in ARK_FUNDS:
        try:
            r = requests.get(ARKFUNDS_API.format(symbol=fund), headers=UA, timeout=30)
            r.raise_for_status()
            data = r.json()
            holdings_raw = data.get('holdings', [])
            holdings = []
            for h in holdings_raw:
                holdings.append({
                    'ticker': h.get('ticker', ''),
                    'name': h.get('company', ''),
                    'cusip': h.get('cusip', ''),
                    'shares': h.get('shares', 0),
                    'value': h.get('market_value', 0),
                    'weight': h.get('weight', 0),
                    'weight_rank': h.get('weight_rank', 0),
                    'share_price': h.get('share_price', 0),
                })
            holdings.sort(key=lambda x: -x['weight'])
            as_of = holdings_raw[0]['date'] if holdings_raw else None
            out['funds'][fund] = {'as_of': as_of, 'holdings': holdings}
            print(f'  ✓ {fund}: {len(holdings)} lignes (as of {as_of})')
            time.sleep(0.3)
        except Exception as e:
            print(f'  ✗ {fund}: {e}')
    (OUT / 'ark.json').write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')


# ============================================================================
# 3. CONGRESS STOCK ACT — House + Senate watchers
# ============================================================================

# `match` = liste de tokens qui doivent TOUS être présents dans le nom (case-insensitive,
# ponctuation ignorée). Plusieurs sets possibles : on match si UN set entier correspond.
POLITICIANS = {
    'pelosi':  {'name': 'Nancy Pelosi',  'chamber': 'House',  'party': 'D', 'state': 'CA',
                'match': [['nancy', 'pelosi']]},
    'meuser':  {'name': 'Dan Meuser',    'chamber': 'House',  'party': 'R', 'state': 'PA',
                'match': [['daniel', 'meuser'], ['dan', 'meuser']]},
    'carper':  {'name': 'Tom Carper',    'chamber': 'Senate', 'party': 'D', 'state': 'DE',
                'match': [['carper']]},  # nom de famille rare → suffit
}

# Sources primaires (S3 buckets community) actuellement DOWN — on fallback sur Wayback Machine.
# Le suffixe "if_" force le retour du contenu brut sans le frame wrapper de l'archive.
# ===== Live House scraping (disclosures-clerk.house.gov) =====
HOUSE_ZIP_URL = 'https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}FD.ZIP'
HOUSE_PDF_URL = 'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/{year}/{doc_id}.pdf'
HOUSE_PDF_CACHE = OUT / '_pdf_cache'

_PTR_NULL_RE   = re.compile(r'\x00+')
_PTR_HEADER_RE = re.compile(r'^(ID Owner Asset Transaction|Type Date Gains|\$200\?|Filing ID|Clerk of the House|Name:|Status:|State/District:|^T$|^F\s|F\s+I)')
# Line 1 : 2 layouts possibles
#   (a) Pelosi : "$X -"  (amt_high sur ligne 2)
#   (b) Meuser : "$X - $Y" (full range sur ligne 1)
_PTR_LINE1_RE  = re.compile(
    r'^(?P<owner>SP|JT|DC)?\s*(?P<asset_partial>.+?)\s+'
    r'(?P<type>P|E|S\s*\(partial\)|S)\s+'
    r'(?P<date>\d{2}/\d{2}/\d{4})\s+(?P<notif>\d{2}/\d{2}/\d{4})\s+'
    r'\$(?P<amt_low>[\d,]+)\s*-\s*(?:\$(?P<amt_high_l1>[\d,]+))?\s*$'
)
# Line 2 : "(TICKER) [CLASS] [$amt_high?]" — amt_high optionnel
_PTR_LINE2_RE  = re.compile(
    r'^(?P<asset_suffix>.*?)\(?(?P<ticker>[A-Z0-9.\-]{1,8})?\)?\s*\[(?P<class>\w+)\]\s*(?:\$(?P<amt_high>[\d,]+))?'
)
_PTR_DESC_RE   = re.compile(r'^D\s*:\s*(.*)')


def _parse_ptr_pdf(pdf_path):
    """Parse un PTR House PDF → liste de transactions."""
    if not HAS_PDFPLUMBER:
        return []
    text = ''
    try:
        with pdfplumber.open(str(pdf_path)) as pdf:
            for p in pdf.pages:
                text += (p.extract_text() or '') + '\n'
    except Exception as e:
        print(f'    [pdf parse error: {e}]')
        return []
    text = _PTR_NULL_RE.sub('', text)
    lines = text.split('\n')
    txns = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line or _PTR_HEADER_RE.match(line):
            i += 1; continue
        m1 = _PTR_LINE1_RE.match(line)
        if not m1:
            i += 1; continue
        if i + 1 >= len(lines):
            break
        m2 = _PTR_LINE2_RE.search(lines[i+1].strip())
        if not m2:
            i += 1; continue
        owner = m1.group('owner') or 'SELF'
        asset = (m1.group('asset_partial') + ' ' + (m2.group('asset_suffix') or '')).strip()
        ticker = m2.group('ticker') or ''
        if not ticker:
            tk = re.search(r'\(([A-Z0-9.\-]{1,8})\)', asset)
            if tk: ticker = tk.group(1)
        asset_clean = re.sub(r'\s*\([A-Z0-9.\-]{1,8}\)\s*$', '', asset).strip()
        # amt_high : ligne 1 ou ligne 2
        amt_high = m1.group('amt_high_l1') or m2.group('amt_high') or m1.group('amt_low')
        # Description : "D: ..." (Pelosi) ou "S O: ..." (Meuser - sub-owner) ou rien
        j = i + 2
        desc = ''
        while j < len(lines) and j - i < 8:  # max 8 lignes pour la desc
            ll = lines[j].strip()
            if _PTR_HEADER_RE.match(ll):
                j += 1; continue
            if _PTR_LINE1_RE.match(ll):  # nouvelle transaction
                break
            if ll.startswith('F') and ':' in ll:
                j += 1; continue
            md = _PTR_DESC_RE.match(ll)
            if md:
                desc = md.group(1)
                j += 1
                while j < len(lines):
                    nl = lines[j].strip()
                    if not nl or _PTR_HEADER_RE.match(nl) or _PTR_LINE1_RE.match(nl): break
                    if (nl.startswith('F') or nl.startswith('S O')) and ':' in nl: break
                    desc += ' ' + nl
                    j += 1
                break
            # "S O:" = sub-owner (Meuser) → capture comme info
            if ll.startswith('S O') and ':' in ll:
                desc = ll.split(':', 1)[1].strip()
                j += 1
                break
            j += 1
        # Normalize date format MM/DD/YYYY → YYYY-MM-DD
        d = m1.group('date').split('/')
        nd = m1.group('notif').split('/')
        txns.append({
            'date':        f'{d[2]}-{d[0]}-{d[1]}',
            'disclosed':   f'{nd[2]}-{nd[0]}-{nd[1]}',
            'ticker':      ticker or None,
            'asset':       asset_clean,
            'asset_class': m2.group('class'),
            'type':        m1.group('type').strip(),
            'amount':      f"${m1.group('amt_low')} - ${amt_high}",
            'owner':       owner,
            'description': desc.strip(),
        })
        i = j if j > i else i + 1
    return txns


def fetch_house_live(years, politicians_subset):
    """Pull official House Clerk ZIPs, filter PTRs for our politicians, parse PDFs.
    Returns {politician_id: [txns]}.
    """
    HOUSE_PDF_CACHE.mkdir(parents=True, exist_ok=True)
    by_pol = {pid: [] for pid in politicians_subset}
    for year in years:
        try:
            print(f'  → House {year} ZIP...')
            r = requests.get(HOUSE_ZIP_URL.format(year=year), headers=UA, timeout=120)
            if not r.ok:
                print(f'    [{year} ZIP unavailable: {r.status_code}]')
                continue
            zf = zipfile.ZipFile(io.BytesIO(r.content))
            xml_name = [n for n in zf.namelist() if n.endswith('.xml')][0]
            root = ET.fromstring(zf.read(xml_name).decode('utf-8-sig'))
            for record in root:
                ft = (record.findtext('FilingType') or '').upper()
                if not ft.startswith('P'):
                    continue
                last = (record.findtext('Last') or '').lower()
                first = (record.findtext('First') or '').lower()
                full_norm = normalize_name(f'{first} {last}')
                for pid, meta in politicians_subset.items():
                    if name_matches(full_norm, meta['match']):
                        doc_id = record.findtext('DocID')
                        if not doc_id: continue
                        # Cache PDF
                        cache_path = HOUSE_PDF_CACHE / f'{year}_{doc_id}.pdf'
                        if not cache_path.exists():
                            pdf_r = requests.get(HOUSE_PDF_URL.format(year=year, doc_id=doc_id),
                                                 headers=UA, timeout=60)
                            if not pdf_r.ok:
                                continue
                            cache_path.write_bytes(pdf_r.content)
                            time.sleep(0.5)
                        txns = _parse_ptr_pdf(cache_path)
                        filed = record.findtext('FilingDate')
                        # Convert M/D/YYYY → YYYY-MM-DD
                        if filed and '/' in filed:
                            parts = filed.split('/')
                            filed = f'{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}'
                        for t in txns:
                            t['filing_date'] = filed
                            t['doc_id'] = doc_id
                        by_pol[pid].extend(txns)
                        print(f'    ✓ {meta["name"]} PTR {doc_id} → {len(txns)} txns')
                        break
        except Exception as e:
            print(f'    ✗ {year}: {e}')
    return by_pol


HOUSE_URL_PRIMARY  = 'https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json'
SENATE_URL_PRIMARY = 'https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json'
HOUSE_URL_FALLBACK  = 'https://web.archive.org/web/20241129040416if_/https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json'
SENATE_URL_FALLBACK = 'https://web.archive.org/web/20230913070422if_/https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json'


def fetch_with_fallback(primary, fallback, label):
    """Tente primary, sinon fallback Wayback Machine."""
    try:
        r = requests.get(primary, headers=UA, timeout=60)
        if r.ok:
            return r.json(), 'live'
    except Exception:
        pass
    print(f'    [primary down, fallback Wayback for {label}]')
    r = requests.get(fallback, headers=UA, timeout=120)
    r.raise_for_status()
    return r.json(), 'wayback'


def normalize_name(s):
    s = re.sub(r'[.,]', ' ', (s or '').lower())
    return re.sub(r'\s+', ' ', s).strip()


def name_matches(name_norm, match_sets):
    """name_norm contient-il TOUS les tokens d'au moins un set ?"""
    for tokens in match_sets:
        if all(t in name_norm for t in tokens):
            return True
    return False


def run_congress():
    print('\n=== CONGRESS STOCK ACT ===')

    # 1. Live scraping House (Pelosi, Meuser) — disclosures-clerk.house.gov
    house_politicians = {k: v for k, v in POLITICIANS.items() if v['chamber'] == 'House'}
    house_live = {}
    if house_politicians and HAS_PDFPLUMBER:
        years = [datetime.utcnow().year, datetime.utcnow().year - 1]  # année courante + précédente
        print(f'  Live House scraping (PDFs officiels, années {years})...')
        house_live = fetch_house_live(years, house_politicians)
    elif house_politicians and not HAS_PDFPLUMBER:
        print('  ⚠ pdfplumber non installé → House restera sur fallback Wayback')

    # 2. Fallback Wayback pour Senate (Carper retraité, Wayback couvre sa carrière)
    senate_politicians = {k: v for k, v in POLITICIANS.items() if v['chamber'] == 'Senate'}
    senate_data, senate_src = (None, None)
    if senate_politicians:
        print('  → fetch Senate transactions (Wayback fallback)...')
        try:
            senate_data, senate_src = fetch_with_fallback(SENATE_URL_PRIMARY, SENATE_URL_FALLBACK, 'Senate')
            print(f'    {len(senate_data)} transactions Senate (source: {senate_src})')
        except Exception as e:
            print(f'    ✗ Senate fetch failed: {e}')

    # 3. Pour les House politicians qui n'ont rien eu en live, fallback Wayback
    needs_fallback = [pid for pid, txns in house_live.items() if not txns]
    house_wayback, house_src = (None, None)
    if needs_fallback:
        print('  → fetch House Wayback for fallback...')
        try:
            house_wayback, house_src = fetch_with_fallback(HOUSE_URL_PRIMARY, HOUSE_URL_FALLBACK, 'House')
        except Exception as e:
            print(f'    ✗ House Wayback failed: {e}')

    # 4. Compose payload pour chaque politicien
    for pid, meta in POLITICIANS.items():
        txns = []
        data_source = None

        if meta['chamber'] == 'House':
            if house_live.get(pid):
                txns = house_live[pid]
                data_source = 'live_house_clerk'
            elif house_wayback:
                for tx in house_wayback:
                    if name_matches(normalize_name(tx.get('representative', '')), meta['match']):
                        txns.append(_normalize_wayback_tx(tx))
                data_source = 'wayback'
        else:
            if senate_data:
                for tx in senate_data:
                    if name_matches(normalize_name(tx.get('senator', '')), meta['match']):
                        txns.append(_normalize_wayback_tx(tx))
                data_source = senate_src or 'wayback'

        txns = [t for t in txns if t.get('date')]
        txns.sort(key=lambda t: t['date'], reverse=True)

        payload = {
            'meta': {**meta, 'id': pid, 'type': 'CONGRESS'},
            'updated': datetime.utcnow().isoformat() + 'Z',
            'data_source': data_source,
            'count': len(txns),
            'transactions': txns,
        }
        (OUT / f'{pid}.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'  ✓ {meta["name"]}: {len(txns)} transactions (source: {data_source})')


def _normalize_wayback_tx(tx):
    """Mappe une txn Wayback → format unifié."""
    return {
        'date':        tx.get('transaction_date') or tx.get('disclosure_date'),
        'disclosed':   tx.get('disclosure_date'),
        'ticker':      tx.get('ticker', '').upper() if tx.get('ticker') else None,
        'asset':       tx.get('asset_description') or tx.get('asset_type'),
        'asset_class': None,
        'type':        tx.get('type') or tx.get('transaction_type'),
        'amount':      tx.get('amount'),
        'owner':       tx.get('owner'),
        'description': '',
    }


# ============================================================================
# Manifest
# ============================================================================

def write_manifest():
    manifest = {
        'updated': datetime.utcnow().isoformat() + 'Z',
        'managers_13f': [{'id': k, **v, 'file': f'{k}.json'} for k, v in MANAGERS_13F.items()],
        'politicians':  [{'id': k, **v, 'file': f'{k}.json'} for k, v in POLITICIANS.items()],
        'ark_funds':    list(ARK_FUNDS),
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'\n✓ manifest écrit → {OUT / "manifest.json"}')


# ============================================================================
# 4. PRIX (yfinance) — pour calculer la perf depuis chaque trade politicien
# ============================================================================

def run_prices():
    """Fetch monthly close prices via yfinance pour tous les tickers présents
    dans les transactions des politiciens. Sortie : prices.json."""
    print('\n=== PRIX (yfinance) ===')
    try:
        import yfinance as yf
    except ImportError:
        print('  ⚠ yfinance non installé → skip')
        return

    def norm_date(d):
        """Normalize 'MM/DD/YYYY' (Wayback) ou 'YYYY-MM-DD' (live) → ISO."""
        if not d: return None
        if '/' in d:
            parts = d.split('/')
            if len(parts) == 3:
                return f'{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}'
            return None
        return d

    # Collecte tickers + date min de transaction (normalisée)
    tickers_meta = {}  # {ticker: earliest_date_iso}
    for pid in POLITICIANS:
        path = OUT / f'{pid}.json'
        if not path.exists(): continue
        data = json.loads(path.read_text(encoding='utf-8'))
        for t in data.get('transactions', []):
            tk = t.get('ticker')
            d = norm_date(t.get('date'))
            if not tk or not d: continue
            # Ignore tickers exotiques (options, mutual funds long codes)
            if len(tk) > 5 or '.' in tk: continue
            if tk not in tickers_meta or d < tickers_meta[tk]:
                tickers_meta[tk] = d

    if not tickers_meta:
        print('  Aucun ticker à fetcher.')
        return

    # Date range : depuis earliest trade, jusqu'à aujourd'hui
    earliest = min(tickers_meta.values())
    # Clamp à 2018 pour limiter le volume
    if earliest < '2018-01-01': earliest = '2018-01-01'
    print(f'  {len(tickers_meta)} tickers + ^GSPC benchmark, depuis {earliest}')

    # Toujours inclure le S&P 500 pour comparer la perf vs benchmark
    tickers_meta['^GSPC'] = earliest

    prices_out = {}
    # Tickers exotiques à skip (options, mutual funds longs codes)
    # ^GSPC est OK car traité comme index par yfinance
    for i, (tk, _) in enumerate(sorted(tickers_meta.items())):
        if tk.startswith('^') is False and (len(tk) > 5 or '.' in tk):
            continue
        try:
            t = yf.Ticker(tk)
            hist = t.history(start=earliest, interval='1mo', auto_adjust=True, prepost=False)
            if hist.empty:
                continue
            series = {idx.strftime('%Y-%m-%d'): round(float(row['Close']), 4) for idx, row in hist.iterrows()}
            prices_out[tk] = series
            if (i+1) % 25 == 0:
                print(f'    {i+1}/{len(tickers_meta)} fetched ({tk} latest: {list(series.keys())[-1]})')
        except Exception as e:
            pass  # silently skip dead tickers
        time.sleep(0.05)

    payload = {
        'updated': datetime.utcnow().isoformat() + 'Z',
        'count': len(prices_out),
        'prices': prices_out,
    }
    (OUT / 'prices.json').write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
    print(f'  ✓ {len(prices_out)} tickers sauvegardés ({len(tickers_meta)-len(prices_out)} introuvables)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', choices=['13f', 'ark', 'congress', 'prices'], default=None)
    args = ap.parse_args()

    if args.only in (None, '13f'):     run_13f()
    if args.only in (None, 'ark'):     run_ark()
    if args.only in (None, 'congress'): run_congress()
    if args.only in (None, 'prices'):   run_prices()
    write_manifest()


if __name__ == '__main__':
    main()
