# Application Web de Coaching Virtuel Intelligent

Application web de coaching virtuel intelligent offrant un coach sportif numérique personnalisé avec analyse posturale en temps réel.

## Technologies utilisées

- **Backend**: Node.js + Express
- **Base de données**: SQLite
- **Frontend**: HTML, CSS, JavaScript vanilla
- **IA Pose Estimation**: MediaPipe Pose (intégré côté client)
- **Chat IA**: OpenAI API (optionnel)

## Installation

1. Installer les dépendances:
```bash
npm install
```

2. Créer un fichier `.env` à partir de `.env.example`:
```bash
cp .env.example .env
```

3. Modifier le fichier `.env` avec vos clés API si nécessaire (OpenAI optionnel)

4. Démarrer le serveur:
```bash
npm start
```

Pour le développement avec rechargement automatique:
```bash
npm run dev
```

5. Ouvrir l'application dans le navigateur:
```
http://localhost:3000
```

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
- La génération de plans utilise des règles simples (peut être améliorée avec ML)
- Le chat IA nécessite une clé OpenAI API (optionnel, fonctionne sans avec réponses basiques)


