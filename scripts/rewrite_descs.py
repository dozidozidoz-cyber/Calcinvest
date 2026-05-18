#!/usr/bin/env python3
"""Rewrite tool-card descriptions in index.html for clarity."""
with open('index.html', 'r', encoding='utf-8') as f:
    c = f.read()

# Each entry : (search, replace)
reps = [
    (
        "Calcul de la valeur d'un pip pour chaque paire, du sizing optimal selon votre risque, et P&L théorique d'un trade",
        "Pour traders forex/CFD : taille de position optimale selon votre risque par trade, valeur d'un pip, P&L théorique"
    ),
    (
        "Marge requise, prix de liquidation, niveaux margin call broker, SL/TP par montant cible, convertisseur pip ↔ prix.",
        "Pour traders à effet de levier : marge requise, prix de liquidation, distance au margin call broker, SL/TP par montant"
    ),
    (
        "Coût annuel réel de votre trading : spread + commission + swap × nuits. Calculé sur votre profil.",
        "Pour traders réguliers : coût annuel total spread + commission + swap selon votre profil (occasionnel à scalper)"
    ),
    (
        "Expectancy, probabilité de ruine, simulation 1000 trades. Découvrez si votre système est statistiquement viable.",
        "Pour traders qui veulent valider leur edge : expectancy, ratio R/R, probabilité de ruine de votre stratégie sur 1 000 trades"
    ),
    (
        "2 000 trajectoires de votre stratégie pour mesurer le séquence-of-returns risk et l'espérance de gain.",
        "Pour traders avancés : simule 2 000 fois votre stratégie pour mesurer la vraie variabilité des résultats possibles"
    ),
    (
        "Stop loss basé sur l'ATR (volatilité réelle), Kelly Criterion pour le sizing optimal, risque multi-positions corrélées.",
        "Pour traders quanti : stop loss adaptatif à la volatilité (ATR), taille optimale (Kelly), risque corrélé multi-positions"
    ),
    (
        "PFU 30 % vs option IR au barème · CTO vs PEA · statut occasionnel/habituel · imputation MV reportables 10 ans.",
        "Pour traders actifs en France : PFU 30 % vs option IR, CTO vs PEA, statut occasionnel vs habituel, report moins-values 10 ans"
    ),
    (
        "Suivi de vos trades persistant : winrate, expectancy, profit factor, equity curve, drawdown. Cloud + RLS Supabase.",
        "Pour traders qui veulent progresser : journal persistant de chaque trade, stats avancées (winrate, expectancy, drawdown)"
    ),
    (
        "Évaluez la valeur intrinsèque d'une action par actualisation des flux de trésorerie. Sensibilité au WACC + croissance terminale.",
        "Pour stock-pickers : valorisation d'une action par actualisation des flux de trésorerie (DCF), sensibilité WACC + terminal"
    ),
    # Also rephrase Décumulation pour clarté
    (
        "Phase de retrait : combien d'années votre capital tient-il ? SWR via Monte Carlo Trinity. Stratégie 3 buckets.",
        "Pour préparer la retraite : combien de temps tient votre capital ? Taux de retrait sûr (SWR) + stratégie 3 buckets"
    ),
    (
        "Indépendance financière : règle des 4 %, coast-FIRE, lean/fat FIRE, Monte Carlo survie capital.",
        "Pour viser l'indépendance financière : âge FIRE, règle des 4 %, scénarios lean/fat-FIRE + Monte Carlo"
    ),
    (
        "Backtest sur 13 actifs (S&P 500 depuis 1871, ETF UCITS PEA, or). Monte Carlo, drawdowns, rendements glissants.",
        "Pour investir progressivement en bourse : backtest sur 20 actifs (S&P 500 depuis 1871, ETF UCITS PEA, crypto, or)"
    ),
]

count = 0
for old, new in reps:
    if old in c:
        c = c.replace(old, new)
        count += 1
        print(f'  ✓ {old[:60]}...')
    else:
        print(f'  ✗ NOT FOUND: {old[:60]}...')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(c)
print('\nDescriptions réécrites:', count)
