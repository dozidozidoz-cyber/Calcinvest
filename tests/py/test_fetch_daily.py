"""Tests unitaires de scripts/fetch_daily.py (fonctions pures, aucun appel réseau).

    python -m unittest discover -s tests/py -v
"""
import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from fetch_daily import build_series, slug  # noqa: E402


def frame(rows, start='2026-01-05', tz='America/New_York'):
    """rows = [(open, high, low, close), ...] sur des jours calendaires consécutifs."""
    idx = pd.date_range(start, periods=len(rows), freq='D', tz=tz)
    return pd.DataFrame(rows, index=idx, columns=['Open', 'High', 'Low', 'Close'])


class BuildSeriesTest(unittest.TestCase):
    def test_ohlc_et_dates(self):
        s = build_series(frame([(10, 12, 9, 11), (11, 13, 10, 12)]), '2030-01-01')
        self.assertEqual(s['d'], ['2026-01-05', '2026-01-06'])
        self.assertEqual(s['o'], [10, 11])
        self.assertEqual(s['h'], [12, 13])
        self.assertEqual(s['l'], [9, 10])
        self.assertEqual(s['c'], [11, 12])

    def test_date_dans_le_fuseau_de_la_bourse(self):
        # Minuit à New York = 04:00 ou 05:00 UTC selon l'heure d'été : la date
        # doit rester celle de la séance locale, été comme hiver.
        ete = build_series(frame([(10, 12, 9, 11)], start='2026-07-06'), '2030-01-01')
        hiver = build_series(frame([(10, 12, 9, 11)], start='2026-12-07'), '2030-01-01')
        self.assertEqual(ete['d'], ['2026-07-06'])
        self.assertEqual(hiver['d'], ['2026-12-07'])

    def test_ecarte_seances_incompletes_et_seance_du_jour(self):
        nan = float('nan')
        s = build_series(frame([(10, 12, 9, 11), (nan, nan, nan, nan), (11, 13, 10, 12)]), '2026-01-07')
        self.assertEqual(s['d'], ['2026-01-05'])  # le 06 est vide, le 07 est "aujourd'hui"

    def test_ecarte_prix_negatifs_ou_nuls(self):
        # WTI du 20/04/2020 : clôture négative → séance inutilisable
        s = build_series(frame([(18, 18, -40, -37.63), (0, 5, 0, 5), (10, 12, 9, 11)]), '2030-01-01')
        self.assertEqual(s['d'], ['2026-01-07'])

    def test_high_low_encadrent_open_close(self):
        s = build_series(frame([(10, 9.5, 10.2, 11)]), '2030-01-01')  # données incohérentes
        self.assertEqual(s['h'], [11])
        self.assertEqual(s['l'], [9.5])

    def test_ecarte_doublons(self):
        df = pd.concat([frame([(10, 12, 9, 11)]), frame([(10, 12, 9, 11), (11, 13, 10, 12)])])
        s = build_series(df, '2030-01-01')
        self.assertEqual(s['d'], ['2026-01-05', '2026-01-06'])

    def test_arrondi_7_chiffres_significatifs(self):
        s = build_series(frame([(1234.567891, 1234.567891, 0.000123456789, 1.5)]), '2030-01-01')
        self.assertEqual(s['o'], [1234.568])
        self.assertEqual(s['l'], [0.0001234568])

    def test_dataframe_vide(self):
        s = build_series(frame([]), '2030-01-01')
        self.assertEqual(s, {'d': [], 'o': [], 'h': [], 'l': [], 'c': []})


class SlugTest(unittest.TestCase):
    def test_slug(self):
        self.assertEqual(slug('0388.HK'), '0388_hk')
        self.assertEqual(slug('^GSPC'), 'gspc')
        self.assertEqual(slug('BTC-USD'), 'btc_usd')


if __name__ == '__main__':
    unittest.main()
