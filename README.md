# Application Web de Coaching Virtuel Intelligent

Plateforme monopage (SPA) de coaching sportif qui combine profil utilisateur, génération de plans d'entraînement et évaluation posturale en temps réel. Le projet repose uniquement sur Node.js, Express, SQLite et JavaScript vanilla côté client.

## Ce qui est inclus actuellement
- Authentification complète avec JWT, inscription, connexion et réinitialisation du mot de passe (modal accessible directement depuis la page de connexion).
- Onboarding conforme (modal de consentement Loi 25 après inscription) et gestion centrale du profil : un bouton unique sauvegarde toutes les sections et lance automatiquement la génération du plan personnalisé.
- Tableau de bord modernisé avec sections statistiques, résumé du plan courant et actions rapides, compatible desktop/tablette/mobile.
- Séance d'entraînement interactive :
  - Explications affichées pour chaque exercice (évaluation et plan).
  - Évaluation posturale en direct via MediaPipe Pose avec HUD incrusté (score, feedback, statut couleur, balise pulsée).
  - Contrôles instantanés pour l'évaluation (précédent, pause/reprendre, passer) et actions post-évaluation (générer un plan, recommencer).
- Navigation responsive : barre desktop conservée et menu « sandwich » (hamburger) pour mobile.
- Gestion du catalogue d'exercices, génération de plans et sauvegarde en base SQLite.
- Déploiement validé sur Vercel avec base `coaching.db` déplacée automatiquement dans `/tmp` pour la persistance éphémère.

## Architecture technique
### Backend (`server.js`)
- Express 4 + `sqlite3`, JSON middleware, CORS basique.
- Tables : `users`, `user_profile_extended`, `preferences`, `workout_plans`, `workout_plan_history`, `sessions`, `password_reset_tokens`.
- Routes principales : auth (`/api/auth/*`), profil (`/api/user/profile`, `/api/user/profile/extended`, `/api/user/preferences`), plans (`/api/workout/*`), sessions et statistiques basiques.
- Gestion JWT (signature, vérification middleware) et hashing de mots de passe `bcryptjs`.
- Support Vercel : détection `process.env.VERCEL`, copie/migration de la base vers `/tmp/coaching.db`.
- Variables d'environnement chargées via `.env` (non commité) ou Vercel dashboard.

### Frontend (`public/`)
- `index.html` : unique page contenant les sections (auth, dashboard, profil, séance, etc.).
- `js/api.js` : client Fetch avec stockage du token dans `localStorage`.
- `js/auth.js` : formulaire login/inscription, modale de reset, affichage du consentement après inscription, toggle menu mobile.
- `js/app.js` : routage client simple, chargement du dashboard, agrégation des données de profil, génération automatique du plan depuis le bouton global.
- `js/workout.js` : orchestration de la séance, affichage des instructions, gestion de l'évaluation posturale (contrôles, progression, plan post-évaluation).
- `js/pose-detection.js` : intégration MediaPipe Pose, analyse du score, rendu de l'overlay HUD directement dans le canvas vidéo, état global pour le HUD.
- `js/profile-extended.js` : sauvegarde des données étendues (mode silencieux pour la sauvegarde globale).
- `js/exercises-catalog.js` : consultation et lancement de séances depuis le catalogue.
- `css/style.css` : grille responsive, dashboard redesign, styles HUD, menu mobile, boutons post-évaluation.

## Prise en main
1. **Cloner & installer**
   ```bash
   git clone https://github.com/tiojip/Alen_AI.git
   cd Alen_AI
   npm install
   ```
2. **Configurer `.env`**
   ```
   PORT=3000
   JWT_SECRET=change-me
   SQLITE_DB_PATH=./coaching.db          # facultatif en local
   OPENAI_API_KEY=                       # optionnel (voir ci-dessous)
   ```
   > `.env` est ignoré par git. Ne le commitez pas.
3. **Lancer**
   ```bash
   npm start          # serveur Express sur http://localhost:3000
   ```
   Autorisez l'accès caméra lors des séances de posture.
4. **Ouvrir l'application dans le navigateur:**
   ```
   http://localhost:3000
   ```

### Option OpenAI
Le code peut appeler l'API OpenAI pour la génération de plans ou de feedback si `OPENAI_API_KEY` est renseigné. Sans clé, le backend retombe sur les règles locales.

## Déploiement sur Vercel
1. Pousser le dépôt sur GitHub (branch `main`).
2. Créer un projet Vercel relié au repo.
3. Définir les variables d'environnement (`PORT`, `JWT_SECRET`, `OPENAI_API_KEY` si besoin).
4. Déployer : Vercel détecte le `vercel.json` et build automatiquement.

**Particularités SQLite** :
- Vercel offre un FS en lecture seule hors `/tmp`.
- `server.js` copie la base depuis le repo vers `/tmp/coaching.db` à chaque cold start.
- Les données persistent uniquement pendant la durée de vie du conteneur (démos OK, production → prévoir base externe).

## Parcours utilisateur
1. L'utilisateur s'inscrit ou se connecte. Après inscription, la modale de consentement s'affiche immédiatement.
2. Il remplit son profil (données personnelles, préférences, informations avancées) puis clique sur `Enregistrer et générer mon plan personnalisé`. Toutes les sections sont sauvegardées et un plan est créé.
3. Sur le dashboard, il consulte le résumé du plan, les statistiques et lance la séance.
4. Pendant l'évaluation posturale :
   - Les instructions de l'exercice s'affichent (texte court).
   - Le HUD vidéo montre score, statut visuel dynamique (vert/orange/rouge) et feedback.
   - Les boutons `Précédent`, `Pause/Reprendre`, `Passer` contrôlent l'évaluation.
5. En fin d'évaluation, il choisit `Générer le plan d'entraînement` ou `Recommencer l'évaluation`.

## Structure du projet

```
.
├── server.js              # Serveur Express et API
├── package.json           # Dépendances Node.js
├── public/                # Fichiers frontend
│   ├── index.html         # Page principale
│   ├── css/              # Styles
│   ├── js/               # JavaScript client
│   └── exercises/        # Catalogue d'exercices
└── coaching.db           # Base de données SQLite (créée automatiquement)
```

## Fonctionnalités principales

- ✅ Authentification utilisateur
- ✅ Création de profil
- ✅ Génération automatique de plans d'entraînement
- ✅ Analyse posturale en temps réel (MediaPipe)
- ✅ Suivi de progression
- ✅ Chat avec coach IA
- ✅ Catalogue d'exercices
- ✅ Interface de séance interactive

## Requis fonctionnels implémentés

Tous les requis "Must have" (FR-01 à FR-15) sont implémentés avec des technologies simples.

## Notes

- MediaPipe Pose est chargé depuis un CDN pour la simplicité
- L'analyse posturale fonctionne directement dans le navigateur
- La génération de plans utilise des règles simples et ML
- Le chat IA nécessite une clé OpenAI API (optionnel, fonctionne sans avec réponses basiques)

## Conseils de maintenance
- Lancer `npm start` avec `VERCEL=1` pour reproduire le comportement Vercel en local si nécessaire.
- Vérifier `public/js/pose-detection.js` après mise à jour de MediaPipe : le HUD dépend des dimensions du canvas.
- Lors des modifications UI, tester sur desktop (>1024px) et mobile (<768px) pour valider la barre de navigation et les modales.
- Toujours vérifier que la modale « Mot de passe oublié » reste accessible sans connexion.

## Dépannage rapide
- **Caméra bloquée** : vérifier HTTPS (obligatoire en production) ou permissions navigateur.
- **Pas de redirection après login** : s'assurer que le token est stocké (`localStorage.getItem('jwtToken')`) et que l'API retourne un statut 200.
- **Base vide sur Vercel** : créer un nouvel utilisateur; la base est neuve à chaque déploiement.
- **Différences locales/Vercel** : remettre à niveau avec `git pull`, puis `npm install`. Relancer `npm start`.

---
Pour toute amélioration, ouvrez une issue ou créez une PR. Toute contribution doit respecter la sauvegarde des données utilisateur et la conformité au consentement explicite.
