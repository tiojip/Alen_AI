# Application Web de Coaching Virtuel Intelligent

Plateforme de coaching sportif numérique proposant un accompagnement personnalisé avec génération de plan d'entraînement, suivi de posture en temps réel, analytics de progression et interactions IA. Toutes les exigences fonctionnelles FR-01 à FR-15 sont couvertes avec un socle technique simple (Node.js + SQLite + JavaScript vanilla).

## Aperçu rapide
- API Express avec authentification JWT, gestion des préférences et conformité Loi 25 (consentement, export et suppression des données).
- Génération de programmes via moteur de règles enrichi ou OpenAI (fallback automatique, SLA surveillés, versioning et rollback).
- Séance interactive utilisant MediaPipe Pose pour l'analyse posturale (<250 ms), HUD temps réel, alertes audio et arrêt automatique en cas de risque.
- Module post-séance fournissant conseils instantanés (IA ou règles) et enregistrement détaillé de la séance.
- Tableau de bord progression avec graphiques Canvas, filtres temporels, indicateurs d'adhérence/cohérence et logs de performance.
- Coach IA conversationnel avec streaming SSE (<2 s premier token), suggestions contextuelles et mode fallback déterministe.
- Notifications, préférences (dark mode, unités, langue, réglages d'alertes) et service worker pour rappels planifiés.

## Architecture
### Backend (`server.js`)
- Express + SQLite (`sqlite3`), authentification JWT, hashing `bcryptjs`, tokens réinitialisation mot de passe et middleware CORS/JSON.
- Initialisation + migrations idempotentes des tables : `users`, `user_profile_extended`, `preferences`, `workout_plans`, `workout_plan_history`, `sessions`, `progress`, `performance_logs`, `password_reset_tokens`.
- Routes principales :
  - Auth (`/api/auth/register`, `/login`, `/password-reset/request|confirm`)
  - Profil & conformité (`/api/user/profile`, `/profile/extended`, `/preferences`, `/consent`, `/data-export`, `/account`)
  - Plans d'entraînement (`/api/workout/generate`, `/plan`, `/plan/history`, `/plan/rollback`, `/optimize`)
  - Sessions & progression (`/api/session`, `/session/history`, `/session/advice`, `/api/progress`)
  - Analytics & optimisation (`/api/performance/indicators`, `/api/performance/logs`)
  - Coach IA (`/api/chat`, `/api/chat/suggestions`)
- Intégration OpenAI optionnelle : génération structurée (schema JSON), optimisation SLA, fallback moteur de règles.
- Support Vercel (`vercel.json`), gestion chemin DB (`SQLITE_DB_PATH`), compatibilité environnement éphémère.

### Frontend (`public/`)
- `index.html` SPA orchestrée par JavaScript vanilla et modules dédiés.
- `js/api.js` client REST centralisé avec gestion JWT.
- `js/auth.js`, `js/app.js`, `js/consent.js`, `js/profile-extended.js`: onboarding, profil, consentement Loi 25.
- `js/plan-editor.js`, `js/exercises-catalog.js`: édition de plan, navigation catalogue.
- `js/workout.js`, `js/pose-detection.js`: pilotage séance, capture caméra, analyse posturale, overlays HUD, audio.
- `js/post-session.js`, `js/progress-charts.js`: conseils post-séance, graphiques Canvas (progression, volume, cohérence).
- `js/notifications.js`: préférences notifications, service worker `sw.js`, scheduling côté client.
- `css/style.css`: design responsive, mode sombre, composants HUD.
- `exercises/exercises.json`: référentiel d'exercices enrichi (tags muscles, équipement, niveau).

### Données & conformité
- Consentement Loi 25 stocké dans `users` (date/version) avec export JSON complet (`/api/user/data-export`) et suppression cascade.
- Historique de plans (`workout_plan_history`) pour audit + rollback; logs de performance pour traçabilité FR-15.
- Notifications planifiées stockées dans `preferences` (jours/heure en JSON) et relayées via service worker.

## Fonctionnalités détaillées
- **Sécurité & Authentification** : JWT 30 jours, mots de passe hashés, reset token avec hash + expiration, logs minimaux.
- **Profil étendu** : collecte biométrique, habitudes de vie, préférences coaching, disponibilité hebdo, objectifs mesurables.
- **Génération de plans (FR-06/07)** : AI (OpenAI) avec schéma JSON validé, fallback règles. Versioning, seed, SLA ≤5 s, historisation et rollback en <3 s.
- **Optimisation continue (FR-15)** : analyse sessions récentes, métriques posture/completion, ajustement intensité, logs persistés.
- **Séances interactives (FR-05/10)** : détection MediaPipe CDN, scoring 0-100, feedback visuel + audio, arrêt auto risque élevé, enregistrement posture pour analytics.
- **Chat coach IA (FR-14)** : streaming SSE, prompts contextualisés (profil + historique), suggestions IA/quatre options, fallback déterministe si absence API.
- **Conseils post-séance (FR-11)** : IA (<3 s) ou règles (messages contextualisés). Sauvegarde `session_data` enrichi (durée, erreurs, feedback).
- **Progression & analytics (FR-12)** : graphiques Canvas sans dépendance externe, filtres 7/30/90/180/365/all, métriques adhérence, cohérence, fréquence, volume.
- **Notifications & préférences (FR-13)** : toggles mode sombre/sons/notifications, planification locale, service worker `sw.js`, badge, focus fenêtre lors clic.
- **Catalogue & planification (FR-08/09)** : planification hebdomadaire dynamique selon disponibilités, éditeur drag/drop, calcul temps séance par objectif.

## Installation & lancement
1. **Prérequis** : Node.js ≥ 14, npm, caméra (Chrome/Firefox/Edge), accès réseau au CDN MediaPipe.
2. **Dépendances** :
   ```bash
   npm install
   ```
3. **Variables d'environnement** : créer un fichier `.env` à la racine (voir tableau ci-dessous).
4. **Démarrer** :
   ```bash
   # Production locale
   npm start

   # Développement (watch nodemon)
   npm run dev
   ```
5. **Accès** : ouvrir `http://localhost:3000`, autoriser la caméra lors des séances.

### Variables d'environnement
| Variable | Description | Valeur par défaut |
| --- | --- | --- |
| `PORT` | Port HTTP Express | `3000` |
| `JWT_SECRET` | Clé de signature JWT (changer en production) | `your-secret-key-change-in-production` |
| `OPENAI_API_KEY` | Clé optionnelle pour génération IA (plans/chat/post-séance) | _vide_ |
| `OPENAI_PLAN_MODEL` | Modèle OpenAI pour les plans | `gpt-4o-mini` |
| `SQLITE_DB_PATH` | Chemin personnalisé vers la base SQLite | `./coaching.db` (ou `/tmp/coaching.db` sur Vercel) |
| `NODE_ENV` | `production` pour activer certaines protections | _vide_ |
| `VERCEL` | Défini automatiquement sur Vercel (gère chemin DB) | _vide_ |

## Déploiement
- **Vercel** : configuration prête (`vercel.json`). Le backend (`server.js`) est déployé via `@vercel/node`, les assets statiques via `@vercel/static`. Sur Vercel, la base SQLite est stockée dans `/tmp`; prévoir export ou persistance externe pour production.
- **Autre hébergeur** : veiller à ce que le dossier contenant `coaching.db` soit accessible en lecture/écriture. Activer HTTPS pour les accès caméra en production.

## Parcours utilisateur type
1. Inscription / connexion (`auth.js`) → création préférences par défaut.
2. Consentement Loi 25 (`consent.js`) et remplissage profil étendu (`profile-extended.js`).
3. Génération du plan (`plan-editor.js`) → édition/ sauvegarde / rollback si besoin.
4. Séance live (`workout.js` + `pose-detection.js`) avec feedback, stockage `session_data` et envoi de conseils post-séance (`post-session.js`).
5. Suivi progression (`progress-charts.js`), consultation indicateurs (`/api/performance/indicators`) et optimisation plan (`/api/workout/optimize`).
6. Interaction coach IA (`chat`), notifications planifiées (`notifications.js`), export/suppression données à tout moment (`/api/user/data-export`, `/api/user/account`).

## Ressources complémentaires
- `INSTALLATION.md` : guide pas-à-pas détaillé, conseils de dépannage.
- `public/js/` : modules commentés par fonctionnalité (FR-xx) pour repérage rapide des exigences.
- `public/css/style.css` : styles HUD posture, dashboards, UI responsive.

## Tests & vérifications
- Pas de suite de tests automatisés fournie. Recommandations : tester flux critiques (auth, génération plan, séance, export données) et vérifier SLA cible via logs console (`server.js`, modules front) après déploiement.

---
Pour toute question ou amélioration, se référer aux commentaires dans `server.js` et les modules front-end (recherche `FR-xx` pour retrouver la fonctionnalité associée). Aucune donnée sensible n'est collectée sans consentement explicite et l'utilisateur peut exporter ou supprimer son profil à tout moment.
