# 🚀 Setup Claude Code — CalcInvest

Guide de transition de Claude.ai vers Claude Code pour continuer le projet. À lire 1 fois, après ça tu n'auras plus besoin.

## Pourquoi Claude Code ?

**Avantages vs la version web** :
- **Pas de re-upload de contexte** à chaque session. Claude lit `CLAUDE.md` automatiquement.
- **Édite plusieurs fichiers à la fois** en un prompt (genre "ajoute l'Analyse 02")
- **Lance les tests**, le serveur local, git, tout depuis le chat
- **Pas de copier-coller** — modifie directement tes fichiers
- **Sessions longues** sans perte de contexte

**Coût** : inclus dans ton abonnement Claude Pro (si tu l'as). Sinon il y a un tier gratuit limité.

---

## 1. Installer Claude Code (5 min)

**Prérequis** : Node.js ≥ 18. Vérifie avec `node -v`. Si pas installé, va sur [nodejs.org](https://nodejs.org/) → LTS.

**Installation** (macOS / Linux / WSL Windows) :
```bash
npm install -g @anthropic-ai/claude-code
```

Une fois installé :
```bash
claude --version
```

**Première connexion** :
```bash
claude
```
→ t'ouvre un navigateur pour te log avec ton compte Anthropic. Login avec le même email que claude.ai. Autorise.

---

## 2. Récupérer le projet localement

Si ton repo GitHub `calcinvest` est déjà cloné sur ton ordi, saute cette étape.

```bash
# Clone ton repo
git clone https://github.com/TON_USERNAME/calcinvest.git
cd calcinvest
```

**Important** : avant de commencer, pull le dernier état :
```bash
git pull
```

**Télécharge le ZIP `calcinvest-session3.zip` que je t'ai livré** et dézippe-le en écrasant le contenu local (il contient `CLAUDE.md`, `.gitignore`, et la Session 3 complète). Ou récupère juste les 2 fichiers manquants :
- `CLAUDE.md` (le gros context doc)
- `.gitignore`

---

## 3. Lancer Claude Code dans le projet

Depuis la racine du projet :
```bash
cd calcinvest
claude
```

Première chose à taper :
```
Lis CLAUDE.md et dis-moi que tu as bien tout le contexte. Puis liste les 3 prochaines choses à faire selon la roadmap.
```

Il va lire le fichier, te confirmer qu'il a compris, et te proposer des actions. C'est ta **preuve que le transfert a marché**.

---

## 4. Workflow type d'une session Claude Code

Exemple concret d'une session "ajoute l'Analyse 02 (rendements glissants)" :

**Toi :**
```
Implémente l'Analyse 02 (rendements glissants / heatmap). 
Référence-toi à CLAUDE.md pour les conventions.
Teste avec le S&P 500 avant de me rendre la main.
```

**Claude Code va** :
1. Lire `calc-dca.js` pour comprendre le pattern
2. Ajouter une fonction `computeRollingReturns()` dans le core
3. Modifier `simulateur-dca.html` (remplacer le placeholder)
4. Ajouter `renderAnalyse02()` dans `dca.view.js`
5. Lancer `node -e "..."` pour tester que les calculs sont cohérents
6. Te montrer le résultat avec les chiffres

**Toi (après test visuel dans ton navigateur)** :
```
Parfait. Commit et push.
```

**Claude Code** :
```bash
git add -A
git commit -m "feat: dca analyse 02 rendements glissants"
git push
```

Vercel redéploie auto. Fini.

---

## 5. Commandes utiles Claude Code

**Dans le chat** (slash commands) :
- `/clear` — vide la conversation (mais garde CLAUDE.md actif)
- `/cost` — combien de tokens consommés dans la session
- `/help` — aide complète

**Dans le terminal** (Claude Code non-lancé) :
- `claude` — démarre une session interactive
- `claude --help` — options CLI

---

## 6. Reprendre ton serveur local pour tester

Claude Code ne rend pas de preview visuel — tu testes dans ton navigateur. Pour éviter les problèmes CORS avec les fetch de `/assets/data/*.json`, il faut servir le site via HTTP :

```bash
# Option 1 : Python (déjà installé sur macOS/Linux)
python3 -m http.server 8000
# → http://localhost:8000

# Option 2 : Node (npx, pas besoin d'install)
npx serve .
```

Ouvre `http://localhost:8000` dans Chrome. Recharge après chaque modif (le service worker peut cacher, si ça bloque : DevTools → Application → Service Workers → Unregister).

---

## 7. Bonnes pratiques spécifiques à ce projet

**⚠️ Avant toute grosse modif** : "Relis CLAUDE.md section X avant de coder". Ça évite qu'il réinvente les conventions.

**Pour tester un calcul core** : demande-lui de créer un script Node one-shot. Exemple :
```
Teste computeRollingReturns sur sp500.json en prenant les durées 5/10/15/20 ans. 
Affiche une heatmap ASCII dans le terminal pour valider à l'œil.
```

**Pour les nouvelles analyses DCA** : suis le pattern section "Ajouter une analyse au simulateur DCA" de CLAUDE.md.

**Pour les nouveaux outils complets** (FIRE, PER, etc.) : utilise les `_templates/` et la checklist dans CLAUDE.md.

---

## 8. Ce que Claude Code fait mieux que la version web

- **Refactoring** sur plusieurs fichiers : "renomme tous les IDs `d-*` en `dca-*`"
- **Recherche dans le code** : "trouve où je gère la devise dans le DCA"
- **Exploration** : "montre-moi le `style.css` section tokens"
- **Tests** : "vérifie que le TRI donne ~8.5% pour le DCA classique S&P 500 depuis 2000"
- **Git ops** : commits intelligents, revert sélectifs, debug

Ce que la version web fait encore mieux :
- Brainstorming long sans fichier
- Analyse d'images (captures, vidéos)

→ Pour continuer à bosser sur du design visuel / maquettes, reviens sur claude.ai. Pour le dev pur, Claude Code.

---

## 9. Si ça coince

**Erreur "command not found: claude"** après install :
- macOS : vérifie `$PATH` contient le dossier npm global (`echo $PATH`)
- Essaie `npx @anthropic-ai/claude-code` à la place

**Erreur de login** :
- Check l'url d'auth, parfois le navigateur ouvre une mauvaise session
- Essaie `claude logout` puis `claude login`

**Claude ne lit pas CLAUDE.md** :
- Vérifie qu'il est bien à la racine du projet (pas dans un sous-dossier)
- Tape explicitement "Lis CLAUDE.md" en début de session

**Pour documenter un problème ou demander de l'aide à Anthropic** : [claude.ai/docs](https://docs.claude.com/en/docs/build-with-claude/claude-code).

---

## 10. Prochaines étapes concrètes

1. Install Claude Code (étape 1)
2. Dézippe `calcinvest-session3.zip` dans ton repo local
3. Lance `claude` depuis le dossier
4. Tape : "Lis CLAUDE.md et lance le serveur local sur :8000"
5. Ouvre `http://localhost:8000/simulateur-dca` pour tester
6. Première mission : "Implémente l'Analyse 02 (rendements glissants)" et tu verras la machine tourner.

Bon dev. 🚀
