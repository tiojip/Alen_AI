# Guide d'installation

## Prérequis

- Node.js (version 14 ou supérieure)
- npm (généralement inclus avec Node.js)
- Un navigateur moderne avec support de la caméra (Chrome, Firefox, Edge)

## Installation

1. **Installer les dépendances Node.js:**
   ```bash
   npm install
   ```

2. **Configurer les variables d'environnement:**
   - Le fichier `.env` a été créé automatiquement
   - Optionnel: Ajoutez votre clé OpenAI API pour le chat IA:
     ```
     OPENAI_API_KEY=votre-cle-api-openai
     ```

3. **Démarrer le serveur:**
   ```bash
   npm start
   ```
   
   Pour le développement avec rechargement automatique:
   ```bash
   npm run dev
   ```

4. **Ouvrir l'application:**
   - Ouvrez votre navigateur à l'adresse: `http://localhost:3000`
   - Autorisez l'accès à la caméra lorsque demandé

## Première utilisation

1. **Créer un compte:**
   - Cliquez sur "Inscription"
   - Entrez votre email et mot de passe
   - Cliquez sur "S'inscrire"

2. **Compléter votre profil:**
   - Allez dans "Profil"
   - Remplissez vos informations (âge, poids, taille, niveau, objectifs)
   - Enregistrez

3. **Évaluation posturale (optionnel mais recommandé):**
   - Allez dans "Dashboard"
   - Cliquez sur "Évaluation posturale"
   - Suivez les instructions pour effectuer les mouvements
   - Le système évaluera votre niveau

4. **Générer un plan d'entraînement:**
   - Retournez au "Dashboard"
   - Cliquez sur "Générer un plan"
   - Un plan personnalisé sera créé selon votre profil

5. **Commencer un entraînement:**
   - Allez dans "Entraînement"
   - Sélectionnez un jour de la semaine
   - Cliquez sur "Commencer cette séance"
   - Autorisez l'accès à la caméra
   - Suivez les instructions à l'écran

## Fonctionnalités

- ✅ Authentification sécurisée
- ✅ Profil utilisateur personnalisé
- ✅ Génération automatique de plans d'entraînement
- ✅ Analyse posturale en temps réel avec MediaPipe
- ✅ Feedback instantané pendant l'exercice
- ✅ Suivi de progression
- ✅ Chat avec coach IA (si clé API configurée)
- ✅ Mode sombre
- ✅ Interface responsive

## Dépannage

**La caméra ne fonctionne pas:**
- Vérifiez que vous avez autorisé l'accès à la caméra dans votre navigateur
- Utilisez HTTPS ou localhost (requis pour l'accès caméra)
- Vérifiez que votre caméra n'est pas utilisée par une autre application

**Erreur de connexion à la base de données:**
- Le fichier `coaching.db` sera créé automatiquement au premier démarrage
- Vérifiez les permissions d'écriture dans le dossier du projet

**Le chat IA ne répond pas:**
- Le chat fonctionne sans clé API mais avec des réponses basiques
- Pour des réponses intelligentes, ajoutez votre clé OpenAI dans `.env`

## Support

Pour toute question ou problème, consultez le fichier README.md ou les commentaires dans le code.


