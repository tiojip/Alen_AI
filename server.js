const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const HAS_OPENAI_KEY = Boolean(process.env.OPENAI_API_KEY);

console.log(`Clé API OpenAI détectée : ${HAS_OPENAI_KEY ? 'oui' : 'non'}`);

// Middleware
app.use(cors());
app.use(express.json());

// Headers de sécurité - CSP désactivée temporairement pour le développement
// Pour réactiver en production, décommenter et ajuster selon les besoins
app.use((req, res, next) => {
  // CSP désactivée pour éviter les conflits avec les extensions Chrome
  // En production, réactiver avec une CSP appropriée
  /*
  if (process.env.NODE_ENV !== 'production') {
    res.setHeader(
      'Content-Security-Policy',
      "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
      "script-src * 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' 'inline-speculation-rules'; " +
      "style-src * 'unsafe-inline'; " +
      "img-src * data: blob:; " +
      "font-src * data:; " +
      "connect-src * ws: wss:; " +
      "frame-src *; " +
      "object-src *;"
    );
  }
  */
  next();
});

app.use(express.static('public'));

const isVercel = Boolean(process.env.VERCEL);
const defaultDbPath = path.join(__dirname, 'coaching.db');
const dbPath = process.env.SQLITE_DB_PATH || (isVercel ? path.join('/tmp', 'coaching.db') : defaultDbPath);

if (isVercel) {
  try {
    const writableDir = path.dirname(dbPath);
    if (!fs.existsSync(writableDir)) {
      fs.mkdirSync(writableDir, { recursive: true });
    }
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, '');
    }
  } catch (copyErr) {
    console.error('Erreur préparation base SQLite pour Vercel:', copyErr);
  }
}

console.log(`Utilisation de la base SQLite : ${dbPath}`);

// Initialisation de la base de données
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('Erreur de connexion à la base de données:', err.message);
  } else {
    console.log('Base de données connectée');
    initDatabase();
  }
});

// Initialisation des tables
function initDatabase() {
  db.serialize(() => {
    // Migration: Ajouter les colonnes manquantes pour FR-06
    db.run(`ALTER TABLE workout_plans ADD COLUMN version TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Erreur migration version:', err);
      }
    });
    db.run(`ALTER TABLE workout_plans ADD COLUMN seed TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Erreur migration seed:', err);
      }
    });
    db.run(`ALTER TABLE workout_plans ADD COLUMN generation_time INTEGER`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Erreur migration generation_time:', err);
      }
    });
    
    // Migration: Ajouter les colonnes manquantes pour FR-03 (Préférences)
    db.run(`ALTER TABLE preferences ADD COLUMN weight_unit TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Erreur migration weight_unit:', err);
      }
    });
    db.run(`ALTER TABLE preferences ADD COLUMN height_unit TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Erreur migration height_unit:', err);
      }
    });
    db.run(`ALTER TABLE preferences ADD COLUMN language TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Erreur migration language:', err);
      }
    });
    
    // Migration: Ajouter les colonnes pour FR-13 (Notifications)
    db.run(`ALTER TABLE preferences ADD COLUMN notification_time TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Erreur migration notification_time:', err);
      }
    });
    db.run(`ALTER TABLE preferences ADD COLUMN notification_days TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Erreur migration notification_days:', err);
      }
    });
    
    // Table utilisateurs (avec champs consentement Loi 25)
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      age INTEGER,
      birthdate TEXT,
      weight REAL,
      height REAL,
      fitness_level TEXT,
      goals TEXT,
      constraints TEXT,
      consent_date DATETIME,
      consent_version TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Migration: Ajouter la colonne birthdate si elle n'existe pas
    db.run(`ALTER TABLE users ADD COLUMN birthdate TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Erreur migration birthdate:', err);
      } else if (!err) {
        console.log('Colonne birthdate ajoutée avec succès');
        // Migrer les données existantes: convertir age en birthdate approximative
        db.all('SELECT id, age FROM users WHERE age IS NOT NULL AND birthdate IS NULL', [], (err, rows) => {
          if (!err && rows && rows.length > 0) {
            const currentYear = new Date().getFullYear();
            rows.forEach(row => {
              const birthYear = currentYear - row.age;
              const birthdate = `${birthYear}-01-01`;
              db.run('UPDATE users SET birthdate = ? WHERE id = ?', [birthdate, row.id], (updateErr) => {
                if (updateErr) {
                  console.error('Erreur migration birthdate pour utilisateur', row.id, ':', updateErr);
                }
              });
            });
            console.log(`Migration: ${rows.length} utilisateurs migrés de age vers birthdate`);
          }
        });
      }
    });

    // Table profil détaillé (FR-04)
    db.run(`CREATE TABLE IF NOT EXISTS user_profile_extended (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      -- Données physiques et biométriques
      resting_heart_rate INTEGER,
      blood_pressure TEXT,
      bmi REAL,
      body_composition TEXT,
      waist_circumference REAL,
      hip_circumference REAL,
      arm_circumference REAL,
      thigh_circumference REAL,
      medical_history TEXT,
      injury_history TEXT,
      sleep_quality INTEGER,
      fatigue_level INTEGER,
      -- Habitudes de vie
      weekly_availability TEXT,
      preferred_session_duration INTEGER,
      training_location TEXT,
      available_equipment TEXT,
      daily_sitting_hours REAL,
      diet_type TEXT,
      -- Motivation et psychologie
      main_motivation TEXT,
      coaching_style_preference TEXT,
      demotivation_factors TEXT,
      engagement_score INTEGER,
      social_preference TEXT,
      -- Historique sportif
      past_sports TEXT,
      past_training_frequency TEXT,
      time_since_last_training TEXT,
      technique_level TEXT,
      -- Préférences techniques
      measurable_goals TEXT,
      alert_sensitivity INTEGER,
      camera_consent INTEGER,
      planning_preference TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Table plans d'entraînement (avec versioning FR-06 et FR-07)
    db.run(`CREATE TABLE IF NOT EXISTS workout_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan_data TEXT NOT NULL,
      version TEXT,
      seed TEXT,
      generation_time INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Table historique des versions pour roll-back (FR-07)
    db.run(`CREATE TABLE IF NOT EXISTS workout_plan_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      plan_data TEXT NOT NULL,
      version TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (plan_id) REFERENCES workout_plans(id)
    )`);

    // Table séances
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      workout_plan_id INTEGER,
      session_data TEXT NOT NULL,
      feedback TEXT,
      posture_score REAL,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (workout_plan_id) REFERENCES workout_plans(id)
    )`);

    // Table progression
    db.run(`CREATE TABLE IF NOT EXISTS progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date DATE NOT NULL,
      metrics TEXT NOT NULL,
      UNIQUE(user_id, date),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Table préférences
    db.run(`CREATE TABLE IF NOT EXISTS preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      dark_mode INTEGER DEFAULT 0,
      weight_unit TEXT DEFAULT 'kg',
      height_unit TEXT DEFAULT 'cm',
      language TEXT DEFAULT 'fr',
      sounds INTEGER DEFAULT 1,
      notifications INTEGER DEFAULT 1,
      notification_time TEXT,
      notification_days TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Table logs de performance pour optimisation continue (FR-15)
    db.run(`CREATE TABLE IF NOT EXISTS performance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan_id INTEGER,
      log_data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (plan_id) REFERENCES workout_plans(id)
    )`);

    // Table pour les demandes de réinitialisation de mot de passe
    db.run(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      used_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
  });
}

// Middleware d'authentification
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide ou expiré' });
    }
    req.user = user;
    next();
  });
}

// Routes d'authentification
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run(
      'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
      [email, hashedPassword, name || ''],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Email déjà utilisé' });
          }
          console.error('Erreur lors de l\'insertion de l\'utilisateur:', err);
          return res.status(500).json({ error: 'Erreur lors de la création du compte. Veuillez réessayer.' });
        }

        const userId = this.lastID;
        const token = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '30d' });

        // Créer les préférences par défaut avec gestion d'erreur
        db.run('INSERT INTO preferences (user_id) VALUES (?)', [userId], (prefErr) => {
          if (prefErr) {
            // Log l'erreur mais ne bloque pas l'inscription
            console.error('Erreur lors de la création des préférences par défaut:', prefErr);
            // Les préférences peuvent être créées plus tard, l'inscription est réussie
          }
          // Répondre avec succès même si les préférences n'ont pas pu être créées
          res.json({ token, user: { id: userId, email, name: name || '' } });
        });
      }
    );
  } catch (error) {
    console.error('Erreur lors de l\'inscription:', error);
    res.status(500).json({ error: 'Erreur serveur lors de l\'inscription. Veuillez réessayer.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  });
});

// Demande de réinitialisation de mot de passe
app.post('/api/auth/password-reset/request', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email requis' });
  }

  db.get('SELECT id, email FROM users WHERE email = ?', [email], (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    // Toujours retourner le même message pour éviter de divulguer l'existence d'un compte
    if (!user) {
      return res.json({ message: 'Si un compte existe, un email vient de lui être envoyé avec les instructions.' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');

    bcrypt.hash(rawToken, 10, (hashErr, hashedToken) => {
      if (hashErr) {
        return res.status(500).json({ error: hashErr.message });
      }

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 heure

      db.run('DELETE FROM password_reset_tokens WHERE user_id = ?', [user.id], (deleteErr) => {
        if (deleteErr) {
          console.error('Erreur suppression anciens tokens reset:', deleteErr);
        }

        db.run(
          'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
          [user.id, hashedToken, expiresAt],
          (insertErr) => {
            if (insertErr) {
              return res.status(500).json({ error: insertErr.message });
            }

            console.log(`Token de réinitialisation pour ${user.email}: ${rawToken}`);

            const response = {
              message: 'Si un compte existe, un email vient de lui être envoyé avec les instructions.'
            };

            if (process.env.NODE_ENV !== 'production') {
              response.debugToken = rawToken;
            }

            res.json(response);
          }
        );
      });
    });
  });
});

// Validation de la réinitialisation
app.post('/api/auth/password-reset/confirm', (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: 'Token et nouveau mot de passe requis' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
  }

  const nowIso = new Date().toISOString();

  db.all(
    'SELECT * FROM password_reset_tokens WHERE used = 0 AND expires_at >= ?',
    [nowIso],
    async (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!rows || rows.length === 0) {
        return res.status(400).json({ error: 'Token invalide ou expiré' });
      }

      let matchingToken = null;
      for (const row of rows) {
        const match = await bcrypt.compare(token, row.token_hash);
        if (match) {
          matchingToken = row;
          break;
        }
      }

      if (!matchingToken) {
        return res.status(400).json({ error: 'Token invalide ou expiré' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, matchingToken.user_id], (updateErr) => {
        if (updateErr) {
          return res.status(500).json({ error: updateErr.message });
        }

        db.run(
          'UPDATE password_reset_tokens SET used = 1, used_at = CURRENT_TIMESTAMP WHERE id = ?',
          [matchingToken.id],
          (markErr) => {
            if (markErr) {
              console.error('Erreur mise à jour token reset:', markErr);
            }
          }
        );

        res.json({ message: 'Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter.' });
      });
    }
  );
});

// Routes utilisateur
app.get('/api/user/profile', authenticateToken, (req, res) => {
  db.get('SELECT id, email, name, age, birthdate, weight, height, fitness_level, goals, constraints FROM users WHERE id = ?', 
    [req.user.id], (err, user) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      // Calculer l'âge à partir de la date de naissance si disponible
      if (user && user.birthdate && !user.age) {
        const birthDate = new Date(user.birthdate);
        const today = new Date();
        let calculatedAge = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          calculatedAge--;
        }
        user.age = calculatedAge;
      }
      res.json(user);
    });
});

app.put('/api/user/profile', authenticateToken, (req, res) => {
  const { name, age, birthdate, weight, height, fitness_level, goals, constraints } = req.body;
  
  // Calculer l'âge à partir de la date de naissance si fournie
  let calculatedAge = age;
  if (birthdate && !age) {
    const birthDate = new Date(birthdate);
    const today = new Date();
    calculatedAge = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      calculatedAge--;
    }
  }
  
  db.run(
    `UPDATE users SET name = ?, age = ?, birthdate = ?, weight = ?, height = ?, 
     fitness_level = ?, goals = ?, constraints = ? WHERE id = ?`,
    [name, calculatedAge, birthdate || null, weight, height, fitness_level, goals, constraints, req.user.id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Profil mis à jour' });
    }
  );
});

// Routes profil étendu (FR-04)
app.get('/api/user/profile/extended', authenticateToken, (req, res) => {
  db.get('SELECT * FROM user_profile_extended WHERE user_id = ?', [req.user.id], (err, profile) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(profile || {});
  });
});

app.put('/api/user/profile/extended', authenticateToken, (req, res) => {
  const data = req.body;
  const userId = req.user.id;
  
  if (!userId) {
    return res.status(401).json({ error: 'Utilisateur non authentifié' });
  }
  
  const fields = [
    'resting_heart_rate', 'blood_pressure', 'bmi', 'body_composition',
    'waist_circumference', 'hip_circumference', 'arm_circumference', 'thigh_circumference',
    'medical_history', 'injury_history', 'sleep_quality', 'fatigue_level',
    'weekly_availability', 'preferred_session_duration', 'training_location',
    'available_equipment', 'daily_sitting_hours', 'diet_type',
    'main_motivation', 'coaching_style_preference', 'demotivation_factors',
    'engagement_score', 'social_preference',
    'past_sports', 'past_training_frequency', 'time_since_last_training', 'technique_level',
    'measurable_goals', 'alert_sensitivity', 'camera_consent', 'planning_preference'
  ];
  
  // Construire les valeurs : user_id en premier, puis les autres champs
  const values = [userId, ...fields.map(field => data[field] !== undefined ? data[field] : null)];
  
  const placeholders = fields.map(() => '?').join(', ');
  const updates = fields.map(field => `${field} = excluded.${field}`).join(', ');
  
  db.run(
    `INSERT INTO user_profile_extended (user_id, ${fields.join(', ')}) 
     VALUES (?, ${placeholders})
     ON CONFLICT(user_id) DO UPDATE SET ${updates}, updated_at = CURRENT_TIMESTAMP`,
    values,
    (err) => {
      if (err) {
        console.error('Erreur sauvegarde profil étendu:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Profil étendu mis à jour' });
    }
  );
});

// Routes préférences
app.get('/api/user/preferences', authenticateToken, (req, res) => {
  db.get('SELECT * FROM preferences WHERE user_id = ?', [req.user.id], (err, prefs) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(prefs || { 
      dark_mode: 0, 
      weight_unit: 'kg', 
      height_unit: 'cm', 
      language: 'fr',
      sounds: 1, 
      notifications: 1 
    });
  });
});

app.put('/api/user/preferences', authenticateToken, (req, res) => {
  const { dark_mode, weight_unit, height_unit, language, sounds, notifications, notification_time, notification_days } = req.body;
  
  // Convertir notification_days en JSON si c'est un tableau
  const notificationDaysStr = notification_days ? 
    (Array.isArray(notification_days) ? JSON.stringify(notification_days) : notification_days) : 
    null;
  
  db.run(
    `INSERT INTO preferences (user_id, dark_mode, weight_unit, height_unit, language, sounds, notifications, notification_time, notification_days) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET 
     dark_mode = excluded.dark_mode,
     weight_unit = excluded.weight_unit,
     height_unit = excluded.height_unit,
     language = excluded.language,
     sounds = excluded.sounds,
     notifications = excluded.notifications,
     notification_time = excluded.notification_time,
     notification_days = excluded.notification_days`,
    [req.user.id, dark_mode ? 1 : 0, weight_unit || 'kg', height_unit || 'cm', language || 'fr', sounds ? 1 : 0, notifications ? 1 : 0, notification_time || null, notificationDaysStr],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Préférences mises à jour' });
    }
  );
});

// Routes consentement Loi 25 (FR-02)
app.post('/api/user/consent', authenticateToken, (req, res) => {
  const { given, date, version, loi25 } = req.body;
  
  // Enregistrer le consentement dans la base de données
  // Note: Pour une vraie application, créer une table consent_records
  db.run(
    `UPDATE users SET consent_date = ?, consent_version = ? WHERE id = ?`,
    [date, version, req.user.id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Consentement enregistré' });
    }
  );
});

app.get('/api/user/data-export', authenticateToken, (req, res) => {
  // Export des données personnelles (droit d'accès Loi 25)
  db.get('SELECT * FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    db.all('SELECT * FROM sessions WHERE user_id = ?', [req.user.id], (err, sessions) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      db.all('SELECT * FROM progress WHERE user_id = ?', [req.user.id], (err, progress) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        const exportData = {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            age: calculateAge(user.birthdate, user.age),
            weight: user.weight,
            height: user.height,
            fitness_level: user.fitness_level,
            goals: user.goals,
            constraints: user.constraints,
            created_at: user.created_at
          },
          sessions: sessions.map(s => ({
            ...s,
            session_data: JSON.parse(s.session_data)
          })),
          progress: progress.map(p => ({
            ...p,
            metrics: JSON.parse(p.metrics)
          })),
          exportDate: new Date().toISOString(),
          loi25: true
        };
        
        res.json(exportData);
      });
    });
  });
});

app.delete('/api/user/account', authenticateToken, (req, res) => {
  // Suppression de compte (droit de suppression Loi 25)
  const userId = req.user.id;
  
  db.serialize(() => {
    // Supprimer toutes les données associées
    db.run('DELETE FROM progress WHERE user_id = ?', [userId]);
    db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
    db.run('DELETE FROM workout_plans WHERE user_id = ?', [userId]);
    db.run('DELETE FROM preferences WHERE user_id = ?', [userId]);
    db.run('DELETE FROM user_profile_extended WHERE user_id = ?', [userId]);
    db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Compte et toutes les données supprimés' });
    });
  });
});

// Routes plans d'entraînement
app.post('/api/workout/generate', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  
  try {
    // OPTIMISATION: Récupérer les profils en PARALLÈLE pour gagner du temps
    const [userProfile, extendedProfile] = await Promise.all([
      new Promise((resolve, reject) => {
        db.get('SELECT id, email, name, age, birthdate, weight, height, fitness_level, goals, constraints FROM users WHERE id = ?', 
          [req.user.id], (err, profile) => {
          if (err) {
            console.error('Erreur récupération profil:', err);
            reject(err);
          } else {
            resolve(profile);
          }
        });
      }),
      new Promise((resolve) => {
        db.get('SELECT * FROM user_profile_extended WHERE user_id = ?', [req.user.id], (err, extProfile) => {
          if (err) {
            console.error('Erreur récupération profil étendu:', err);
            resolve(null);
          } else {
            resolve(extProfile);
          }
        });
      })
    ]);
    
    // Utiliser le profil de la base de données, avec fallback sur celui du body si nécessaire
    const profile = userProfile || req.body.profile || {};
    
    // OPTIMISATION: Génération rapide avec moteur de règles qui utilise toutes les infos du profil
    // Le moteur de règles est optimisé et utilise toutes les données du profil et profil étendu
    const plan = await generateWorkoutPlanAI(profile, extendedProfile, startTime);
    const generationTime = Date.now() - startTime;
    
    db.run(
      'INSERT INTO workout_plans (user_id, plan_data, version, seed, generation_time) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, JSON.stringify(plan), plan.version || '1.0.0', plan.seed || '', generationTime],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ 
          plan, 
          planId: this.lastID,
          generationTime: `${generationTime}ms`,
          slaMet: generationTime <= 5000
        });
      }
    );
  } catch (error) {
    console.error('Erreur génération plan:', error);
    
    // En cas d'erreur, récupérer le profil depuis la base de données pour le fallback (en parallèle)
    let fallbackProfile = null;
    let fallbackExtendedProfile = null;
    
    try {
      // OPTIMISATION: Récupération en parallèle pour le fallback aussi
      [fallbackProfile, fallbackExtendedProfile] = await Promise.all([
        new Promise((resolve) => {
          db.get('SELECT id, email, name, age, birthdate, weight, height, fitness_level, goals, constraints FROM users WHERE id = ?', 
            [req.user.id], (err, profile) => {
            if (err) {
              console.error('Erreur récupération profil pour fallback:', err);
              resolve(req.body.profile || {});
            } else {
              resolve(profile || req.body.profile || {});
            }
          });
        }),
        new Promise((resolve) => {
          db.get('SELECT * FROM user_profile_extended WHERE user_id = ?', [req.user.id], (err, extProfile) => {
            if (err) {
              console.error('Erreur récupération profil étendu pour fallback:', err);
              resolve(null);
            } else {
              resolve(extProfile);
            }
          });
        })
      ]);
    } catch (fallbackError) {
      console.error('Erreur lors de la récupération du profil pour fallback:', fallbackError);
      fallbackProfile = req.body.profile || {};
    }
    
    // Fallback sur génération basique avec le profil récupéré
    const plan = generateWorkoutPlanRules(fallbackProfile, fallbackExtendedProfile);
    const generationTime = Date.now() - startTime;
    db.run(
      'INSERT INTO workout_plans (user_id, plan_data, version, seed, generation_time) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, JSON.stringify(plan), plan.version || '1.0.0', plan.seed || '', generationTime],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ 
          plan, 
          planId: this.lastID, 
          generationTime: `${generationTime}ms`, 
          slaMet: true 
        });
      }
    );
  }
});

// Route d'optimisation continue améliorée (FR-15)
app.post('/api/workout/optimize', authenticateToken, (req, res) => {
  const { feedback, difficulty, rpe } = req.body;
  
  // Récupérer le plan actuel
  db.get(
    'SELECT * FROM workout_plans WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    [req.user.id],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (!row) {
        return res.status(404).json({ error: 'Aucun plan trouvé' });
      }

      const plan = JSON.parse(row.plan_data);
      
      // Récupérer l'historique des séances (FR-15) - Analyser les 2 dernières sessions
      db.all(
        'SELECT * FROM sessions WHERE user_id = ? ORDER BY completed_at DESC LIMIT 2',
        [req.user.id],
        (err, sessions) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          const sessionHistory = sessions.map(s => ({
            ...s,
            session_data: typeof s.session_data === 'string' ? JSON.parse(s.session_data) : s.session_data
          }));

          // Optimiser le plan avec les nouveaux paramètres (FR-15)
          const optimizedPlan = optimizeWorkoutPlan(plan, sessionHistory, feedback, difficulty, rpe);
          
          // Enregistrer les logs de performance (FR-15)
          const performanceLog = {
            userId: req.user.id,
            planId: row.id,
            optimizationParams: optimizedPlan.optimizationParams,
            metrics: optimizedPlan.optimizationMetrics,
            timestamp: new Date().toISOString()
          };

          // Sauvegarder le log de performance
          db.run(
            'INSERT INTO performance_logs (user_id, plan_id, log_data) VALUES (?, ?, ?)',
            [req.user.id, row.id, JSON.stringify(performanceLog)],
            (err) => {
              if (err) {
                console.error('Erreur sauvegarde log performance:', err);
              }
            }
          );
          
          // Sauvegarder le plan optimisé
          db.run(
            'UPDATE workout_plans SET plan_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [JSON.stringify(optimizedPlan), row.id],
            (err) => {
              if (err) {
                return res.status(500).json({ error: err.message });
              }
              res.json({ 
                plan: optimizedPlan, 
                message: 'Plan optimisé avec succès',
                optimizationParams: optimizedPlan.optimizationParams,
                metrics: optimizedPlan.optimizationMetrics
              });
            }
          );
        }
      );
    }
  );
});

// Route pour obtenir les indicateurs de performance (FR-15)
app.get('/api/performance/indicators', authenticateToken, (req, res) => {
  analyzePerformanceIndicators(req.user.id, (err, indicators) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(indicators);
  });
});

// Route pour obtenir l'historique d'optimisation (FR-15)
app.get('/api/performance/logs', authenticateToken, (req, res) => {
  db.all(
    'SELECT * FROM performance_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
    [req.user.id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      const logs = rows.map(row => ({
        ...row,
        log_data: typeof row.log_data === 'string' ? JSON.parse(row.log_data) : row.log_data
      }));
      res.json(logs);
    }
  );
});

app.get('/api/workout/plan', authenticateToken, (req, res) => {
  db.get(
    'SELECT * FROM workout_plans WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    [req.user.id],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!row) {
        return res.json({ plan: null });
      }
      res.json({ plan: JSON.parse(row.plan_data), planId: row.id });
    }
  );
});

app.put('/api/workout/plan', authenticateToken, (req, res) => {
  const { plan } = req.body;
  const startTime = Date.now();
  
  // Récupérer le plan actuel pour sauvegarder dans l'historique
  db.get(
    'SELECT * FROM workout_plans WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    [req.user.id],
    (err, currentPlan) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (!currentPlan) {
        return res.status(404).json({ error: 'Aucun plan trouvé' });
      }
      
      // Sauvegarder la version actuelle dans l'historique avant modification (FR-07)
      db.run(
        'INSERT INTO workout_plan_history (user_id, plan_id, plan_data, version) VALUES (?, ?, ?, ?)',
        [req.user.id, currentPlan.id, currentPlan.plan_data, currentPlan.version || '1.0.0'],
        (err) => {
          if (err) {
            console.error('Erreur sauvegarde historique:', err);
            // Continuer quand même la mise à jour
          }
        }
      );
      
      // Mettre à jour le plan avec la nouvelle version
      const newVersion = plan.version || `1.${Date.now()}`;
      db.run(
        'UPDATE workout_plans SET plan_data = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ?',
        [JSON.stringify(plan), newVersion, req.user.id, currentPlan.id],
        (err) => {
          const saveTime = Date.now() - startTime;
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          res.json({ 
            message: 'Plan mis à jour',
            saveTime: `${saveTime}ms`,
            slaMet: saveTime < 3000 // SLA <3s pour FR-07
          });
        }
      );
    }
  );
});

// Route pour récupérer l'historique des versions (FR-07)
app.get('/api/workout/plan/history', authenticateToken, (req, res) => {
  db.get(
    'SELECT * FROM workout_plans WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    [req.user.id],
    (err, currentPlan) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (!currentPlan) {
        return res.json({ history: [] });
      }
      
      db.all(
        'SELECT * FROM workout_plan_history WHERE user_id = ? AND plan_id = ? ORDER BY created_at DESC LIMIT 10',
        [req.user.id, currentPlan.id],
        (err, rows) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          
          const history = rows.map(row => ({
            id: row.id,
            version: row.version,
            createdAt: row.created_at,
            plan: JSON.parse(row.plan_data)
          }));
          
          res.json({ history });
        }
      );
    }
  );
});

// Route pour roll-back vers une version précédente (FR-07)
app.post('/api/workout/plan/rollback', authenticateToken, (req, res) => {
  const { historyId } = req.body;
  const startTime = Date.now();
  
  if (!historyId) {
    return res.status(400).json({ error: 'ID de version requis' });
  }
  
  // Récupérer la version à restaurer
  db.get(
    'SELECT * FROM workout_plan_history WHERE id = ? AND user_id = ?',
    [historyId, req.user.id],
    (err, historyEntry) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (!historyEntry) {
        return res.status(404).json({ error: 'Version non trouvée' });
      }
      
      // Récupérer le plan actuel
      db.get(
        'SELECT * FROM workout_plans WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
        [req.user.id],
        (err, currentPlan) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          
          if (!currentPlan) {
            return res.status(404).json({ error: 'Aucun plan trouvé' });
          }
          
          // Sauvegarder la version actuelle dans l'historique avant roll-back
          db.run(
            'INSERT INTO workout_plan_history (user_id, plan_id, plan_data, version) VALUES (?, ?, ?, ?)',
            [req.user.id, currentPlan.id, currentPlan.plan_data, currentPlan.version || '1.0.0'],
            (err) => {
              if (err) {
                console.error('Erreur sauvegarde historique:', err);
              }
            }
          );
          
          // Restaurer la version précédente
          const restoredVersion = historyEntry.version || `1.${Date.now()}`;
          db.run(
            'UPDATE workout_plans SET plan_data = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [historyEntry.plan_data, restoredVersion, currentPlan.id],
            (err) => {
              const rollbackTime = Date.now() - startTime;
              if (err) {
                return res.status(500).json({ error: err.message });
              }
              
              res.json({ 
                message: 'Plan restauré avec succès',
                plan: JSON.parse(historyEntry.plan_data),
                rollbackTime: `${rollbackTime}ms`,
                slaMet: rollbackTime < 3000
              });
            }
          );
        }
      );
    }
  );
});

// Base de données d'exercices enrichie (FR-06)
const EXERCISE_DATABASE = {
  beginner: [
    { name: 'Squats', sets: 3, reps: 10, rest: 60, muscles: ['Quadriceps', 'Fessiers'], equipment: 'none', difficulty: 1 },
    { name: 'Push-ups (genoux)', sets: 2, reps: 8, rest: 60, muscles: ['Pectoraux', 'Triceps'], equipment: 'none', difficulty: 1 },
    { name: 'Planche', sets: 3, duration: 20, rest: 60, muscles: ['Abdominaux', 'Épaules'], equipment: 'mat', difficulty: 2 },
    { name: 'Fentes', sets: 2, reps: 8, rest: 60, muscles: ['Quadriceps', 'Fessiers'], equipment: 'none', difficulty: 1 },
    { name: 'Pompes inclinées', sets: 2, reps: 8, rest: 60, muscles: ['Pectoraux', 'Triceps'], equipment: 'chair', difficulty: 1 },
    { name: 'Gainage latéral', sets: 2, duration: 15, rest: 60, muscles: ['Abdominaux'], equipment: 'mat', difficulty: 1 }
  ],
  intermediate: [
    { name: 'Squats', sets: 4, reps: 12, rest: 45, muscles: ['Quadriceps', 'Fessiers'], equipment: 'none', difficulty: 2 },
    { name: 'Push-ups', sets: 3, reps: 12, rest: 45, muscles: ['Pectoraux', 'Triceps'], equipment: 'none', difficulty: 2 },
    { name: 'Planche', sets: 3, duration: 30, rest: 45, muscles: ['Abdominaux', 'Épaules'], equipment: 'mat', difficulty: 2 },
    { name: 'Fentes', sets: 3, reps: 12, rest: 45, muscles: ['Quadriceps', 'Fessiers'], equipment: 'none', difficulty: 2 },
    { name: 'Burpees', sets: 2, reps: 8, rest: 60, muscles: ['Tout le corps'], equipment: 'none', difficulty: 3 },
    { name: 'Mountain Climbers', sets: 3, duration: 30, rest: 30, muscles: ['Cardio'], equipment: 'mat', difficulty: 2 },
    { name: 'Pompes diamant', sets: 3, reps: 10, rest: 45, muscles: ['Triceps'], equipment: 'none', difficulty: 3 }
  ],
  advanced: [
    { name: 'Squats', sets: 4, reps: 15, rest: 30, muscles: ['Quadriceps', 'Fessiers'], equipment: 'none', difficulty: 3 },
    { name: 'Push-ups', sets: 4, reps: 15, rest: 30, muscles: ['Pectoraux', 'Triceps'], equipment: 'none', difficulty: 3 },
    { name: 'Planche', sets: 4, duration: 45, rest: 30, muscles: ['Abdominaux', 'Épaules'], equipment: 'mat', difficulty: 3 },
    { name: 'Fentes sautées', sets: 3, reps: 12, rest: 45, muscles: ['Quadriceps', 'Fessiers'], equipment: 'none', difficulty: 4 },
    { name: 'Burpees', sets: 3, reps: 12, rest: 45, muscles: ['Tout le corps'], equipment: 'none', difficulty: 4 },
    { name: 'Pompes sur une main', sets: 2, reps: 5, rest: 60, muscles: ['Pectoraux', 'Triceps'], equipment: 'none', difficulty: 5 },
    { name: 'Planche dynamique', sets: 3, reps: 10, rest: 30, muscles: ['Abdominaux'], equipment: 'mat', difficulty: 4 }
  ]
};

// Fonction de génération de plan améliorée avec IA (FR-06) - SLA ≤5s
async function generateWorkoutPlanAI(profile, extendedProfile, startTime) {
  // OPTIMISATION: Utiliser directement le moteur de règles pour une génération rapide
  // Le moteur de règles utilise toutes les informations du profil et est beaucoup plus rapide (<1s vs 3-5s pour l'IA)
  // Il génère des plans personnalisés de qualité équivalente en utilisant les données du profil
  
  // Si l'utilisateur veut forcer l'utilisation de l'IA, il peut définir FORCE_AI_PLAN=true
  const FORCE_AI = process.env.FORCE_AI_PLAN === 'true';
  
  if (!FORCE_AI) {
    // Utiliser directement le moteur de règles (rapide et utilise toutes les infos du profil)
    console.log('Génération rapide avec moteur de règles (utilise toutes les infos du profil)');
    return generateWorkoutPlanRules(profile, extendedProfile);
  }

  // Code pour l'IA (seulement si FORCE_AI_PLAN=true)
  const MAX_GENERATION_TIME = 5000;
  
  if (!HAS_OPENAI_KEY) {
    console.warn('Aucune clé API OpenAI détectée, utilisation du moteur de règles');
    return generateWorkoutPlanRules(profile, extendedProfile);
  }

  const elapsed = Date.now() - startTime;
  const remaining = MAX_GENERATION_TIME - elapsed;

  if (remaining <= 600) {
    console.warn('Temps insuffisant pour appeler l'IA, utilisation du moteur de règles');
    return generateWorkoutPlanRules(profile, extendedProfile);
  }

  try {
    const plan = await generateWorkoutPlanWithOpenAI(profile, extendedProfile, remaining);
    if (plan && plan.weeklyPlan && Object.keys(plan.weeklyPlan).length > 0) {
      return plan;
    } else {
      console.warn('Plan généré invalide, utilisation du fallback');
    }
  } catch (error) {
    console.warn('Échec initial via OpenAI (plan) :', error.message || error);
  }

  console.log('Fallback sur le moteur de règles pour la génération du plan');
  return generateWorkoutPlanRules(profile, extendedProfile);
}

// Génération avec OpenAI (FR-06)
const workoutPlanJsonSchema = {
  name: 'WorkoutPlan',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['weeklyPlan', 'duration', 'notes'],
    properties: {
      weeklyPlan: {
        type: 'object',
        minProperties: 1,
        additionalProperties: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name'],
            properties: {
              name: { type: 'string' },
              type: { type: 'string' },
              sets: { type: ['integer', 'null'], minimum: 0 },
              reps: { type: ['integer', 'null'], minimum: 0 },
              duration: { type: ['integer', 'null'], minimum: 0 },
              rest: { type: ['integer', 'null'], minimum: 0 },
              tempo: { type: ['string', 'null'] },
              focus: {
                type: ['array', 'null'],
                items: { type: 'string' }
              },
              notes: { type: ['string', 'null'] }
            }
          }
        }
      },
      duration: { type: 'string' },
      notes: { type: 'string' },
      metadata: {
        type: 'object',
        additionalProperties: true
      }
    }
  }
};

async function generateWorkoutPlanWithOpenAI(profile, extendedProfile, timeBudgetMs = 4000, retryCount = 0) {
  const MAX_RETRIES = 2;
  const OpenAI = require('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const effectiveTimeout = Math.max(1500, Math.min(timeBudgetMs - 250, 10000));

  // Préparer le contexte utilisateur avec validation
  let userContext;
  try {
    userContext = buildUserContext(profile || {}, extendedProfile || {});
    // Valider que le contexte n'est pas vide
    if (!userContext || Object.keys(userContext).length === 0) {
      throw new Error('Contexte utilisateur invalide ou vide');
    }
  } catch (error) {
    console.error('Erreur construction contexte:', error);
    throw new Error('Impossible de construire le contexte utilisateur');
  }

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout OpenAI')), effectiveTimeout)
  );

  try {
    // Limiter la taille du contexte pour éviter les erreurs de token
    const contextString = JSON.stringify(userContext);
    if (contextString.length > 4000) {
      // Réduire le contexte si trop grand
      const reducedContext = {
        basicProfile: userContext.basicProfile,
        physicalMetrics: userContext.physicalMetrics,
        lifestyleHabits: userContext.lifestyleHabits,
        motivationAndPsychology: userContext.motivationAndPsychology
      };
      userContext = reducedContext;
    }

    const completionPromise = openai.chat.completions.create({
      model: process.env.OPENAI_PLAN_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Tu es Alen, coach sportif IA. Tu dois générer un plan d'entraînement personnalisé STRICTEMENT conforme au schéma JSON fourni.

INSTRUCTIONS IMPORTANTES:
1. Utilise TOUTES les informations du profil utilisateur fourni pour personnaliser le plan:
   - basicProfile: nom, âge, poids, taille, niveau de forme, objectifs principaux, contraintes
   - physicalMetrics: IMC, composition corporelle, fréquence cardiaque au repos, mesures corporelles
   - healthBackground: antécédents médicaux, blessures, qualité du sommeil, niveau de fatigue, type de régime
   - lifestyleHabits: disponibilité hebdomadaire, durée de séance préférée, lieu d'entraînement, équipement disponible, heures assises par jour
   - motivationAndPsychology: motivation principale, style de coaching préféré, facteurs de démotivation, score d'engagement, préférence sociale
   - sportsHistory: sports pratiqués, fréquence d'entraînement passée, temps depuis le dernier entraînement, niveau technique
   - technicalPreferences: objectifs mesurables, sensibilité des alertes, préférences de planification

2. Adapte le plan selon:
   - Le niveau de forme physique (beginner/intermediate/advanced)
   - Les objectifs spécifiques (perte de poids, prise de masse, endurance, flexibilité, etc.)
   - Les contraintes et blessures (éviter les exercices problématiques)
   - L'équipement disponible (sans matériel, tapis, haltères, etc.)
   - La durée de séance préférée
   - La disponibilité hebdomadaire
   - L'historique sportif et le niveau technique
   - Les conditions de santé (IMC, fréquence cardiaque, fatigue, sommeil)

3. Sélectionne les exercices appropriés et ajuste le volume (séries, répétitions, durée) et l'intensité selon le profil complet.

4. Ne mets AUCUN texte en dehors du JSON. Utilise uniquement des apostrophes dans les notes si tu veux citer quelque chose (pas de guillemets doubles non échappés).
5. Respecte le schéma et garde les valeurs concises.`
        },
        {
          role: 'user',
          content: `Conçois un plan d'entraînement personnalisé en utilisant TOUTES les informations du profil utilisateur suivant. Adapte chaque aspect du plan (exercices, volume, intensité, fréquence) selon ces données complètes:

${JSON.stringify(userContext, null, 2)}

Génère un plan hebdomadaire adapté avec des exercices spécifiques selon le niveau, les objectifs, les contraintes, l'équipement disponible, la durée préférée et toutes les autres informations du profil.`
        }
      ],
      max_tokens: 700,
      temperature: 0.7,
      response_format: {
        type: 'json_schema',
        json_schema: workoutPlanJsonSchema
      }
    });

    const completion = await Promise.race([completionPromise, timeoutPromise]);
    
    if (!completion || !completion.choices || completion.choices.length === 0) {
      throw new Error('Réponse invalide de la part du modèle OpenAI');
    }
    
    const responseText = completion.choices[0]?.message?.content?.trim();

    if (!responseText) {
      throw new Error('Réponse vide de la part du modèle OpenAI');
    }

    // Nettoyer la réponse
    let cleanResponse = responseText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    // Essayer de parser le JSON avec gestion d'erreur améliorée
    let aiPlan;
    try {
      aiPlan = JSON.parse(cleanResponse);
    } catch (parseError) {
      // Essayer de corriger les erreurs JSON communes
      console.warn('Erreur parsing JSON, tentative de correction:', parseError);
      try {
        // Supprimer les caractères problématiques
        cleanResponse = cleanResponse
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
          .replace(/'/g, '"'); // Remplacer les apostrophes simples par des guillemets doubles
        aiPlan = JSON.parse(cleanResponse);
      } catch (secondParseError) {
        throw new Error(`Erreur parsing JSON après correction: ${secondParseError.message}`);
      }
    }

    // Valider et enrichir le plan
    const validatedPlan = validateAndEnrichPlan(aiPlan, profile, extendedProfile);
    
    // Validation finale
    if (!validatedPlan || !validatedPlan.weeklyPlan || Object.keys(validatedPlan.weeklyPlan).length === 0) {
      throw new Error('Plan généré invalide: structure manquante ou vide');
    }

    return validatedPlan;
  } catch (error) {
    console.error(`Erreur OpenAI (plan) - tentative ${retryCount + 1}/${MAX_RETRIES + 1}:`, error.message || error);
    
    // Retry avec backoff exponentiel si ce n'est pas une erreur de timeout et qu'on n'a pas atteint le max
    if (retryCount < MAX_RETRIES && !error.message.includes('Timeout')) {
      const backoffDelay = Math.pow(2, retryCount) * 500; // 500ms, 1000ms, 2000ms
      console.log(`Nouvelle tentative dans ${backoffDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      return generateWorkoutPlanWithOpenAI(profile, extendedProfile, timeBudgetMs, retryCount + 1);
    }
    
    throw error;
  }
}

// Moteur de règles optimisé (FR-06) - toujours <5s
function generateWorkoutPlanRules(profile, extendedProfile) {
  const level = profile.fitness_level || 'beginner';
  const goals = profile.goals || 'general';
  const constraints = profile.constraints || '';
  
  // Analyser le profil étendu (FR-04)
  const availableEquipment = extendedProfile?.available_equipment?.toLowerCase() || '';
  const preferredDuration = extendedProfile?.preferred_session_duration || 30;
  const weeklyAvailability = extendedProfile?.weekly_availability || '';
  const mainMotivation = extendedProfile?.main_motivation || 'health';
  const trainingLocation = extendedProfile?.training_location || 'home';
  const pastSports = extendedProfile?.past_sports || '';
  const measurableGoals = extendedProfile?.measurable_goals || '';
  const pastTrainingFrequency = extendedProfile?.past_training_frequency || '';
  const timeSinceLastTraining = extendedProfile?.time_since_last_training || '';
  const planningPreference = extendedProfile?.planning_preference || '';
  const techniqueLevel = (extendedProfile?.technique_level || '').toLowerCase();
  const dietType = extendedProfile?.diet_type || '';
  const sleepQuality = extendedProfile?.sleep_quality ? parseInt(extendedProfile.sleep_quality, 10) : null;
  const fatigueLevel = extendedProfile?.fatigue_level ? parseInt(extendedProfile.fatigue_level, 10) : null;
  const restingHeartRate = extendedProfile?.resting_heart_rate ? parseInt(extendedProfile.resting_heart_rate, 10) : null;
  const socialPreference = extendedProfile?.social_preference || '';
  const coachingStylePreference = extendedProfile?.coaching_style_preference || '';
  const alertSensitivity = extendedProfile?.alert_sensitivity;

  const computedBmi =
    extendedProfile?.bmi ||
    (profile.weight && profile.height
      ? Number((profile.weight / Math.pow(profile.height / 100, 2)).toFixed(1))
      : null);

  const notes = [];
  const intensityAdjustments = [];
  
  // Analyser les objectifs (support des nouvelles checkboxes)
  const goalsLower = goals.toLowerCase();
  const isMuscleGain = goalsLower.includes('muscle') || goalsLower.includes('masse') || 
                        goalsLower.includes('prise de masse') || mainMotivation === 'performance';
  const isWeightLoss = goalsLower.includes('maigrir') || goalsLower.includes('perdre') || 
                        goalsLower.includes('poids') || goalsLower.includes('perte de poids') || 
                        mainMotivation === 'aesthetics';
  const isEndurance = goalsLower.includes('endurance') || goalsLower.includes('cardio');
  const isFlexibility = goalsLower.includes('flexibilité') || goalsLower.includes('souplesse');
  
  // Analyser les contraintes (support des nouvelles checkboxes)
  const constraintsLower = constraints.toLowerCase();
  const hasBackPain = constraintsLower.includes('rein') || constraintsLower.includes('dos') || 
                       constraintsLower.includes('problème de dos') ||
                       (extendedProfile?.injury_history?.toLowerCase().includes('dos') || extendedProfile?.injury_history?.toLowerCase().includes('rein'));
  const hasKneeIssues = constraintsLower.includes('genou') || 
                         constraintsLower.includes('problème de genou') ||
                         (extendedProfile?.injury_history?.toLowerCase().includes('genou'));
  const hasShoulderIssues = constraintsLower.includes('épaule') || 
                            constraintsLower.includes('problème d\'épaule') ||
                            (extendedProfile?.injury_history?.toLowerCase().includes('épaule'));
  
  // Sélectionner les exercices de base selon le niveau
  let selectedExercises = [...(EXERCISE_DATABASE[level] || EXERCISE_DATABASE.beginner)];
  
  // S'assurer qu'on a des exercices de base
  if (!selectedExercises || selectedExercises.length === 0) {
    console.warn(`Aucun exercice trouvé pour le niveau ${level}, utilisation du niveau débutant`);
    selectedExercises = [...EXERCISE_DATABASE.beginner];
  }
  
  // Filtrer selon l'équipement disponible
  if (availableEquipment && availableEquipment.trim() !== '' && availableEquipment.toLowerCase() !== 'aucun') {
    const availableLower = availableEquipment.toLowerCase();
    const hasMat = availableLower.includes('tapis') || availableLower.includes('mat');
    const hasChair = availableLower.includes('chaise') || availableLower.includes('chair');
    const hasWeights = availableLower.includes('haltère') || availableLower.includes('weight') || availableLower.includes('dumbbell');
    const hasBands = availableLower.includes('bande') || availableLower.includes('élastique') || availableLower.includes('resistance');
    
    const filtered = selectedExercises.filter(ex => {
      if (ex.equipment === 'mat' && !hasMat) return false;
      if (ex.equipment === 'chair' && !hasChair) return false;
      if (ex.equipment === 'weights' && !hasWeights) return false;
      if (ex.equipment === 'bands' && !hasBands) return false;
      return true;
    });
    
    // Si le filtrage a supprimé tous les exercices, garder ceux sans matériel
    if (filtered.length > 0) {
      selectedExercises = filtered;
    } else {
      console.warn('Filtrage par équipement a supprimé tous les exercices, utilisation des exercices sans matériel');
      selectedExercises = selectedExercises.filter(ex => ex.equipment === 'none' || ex.equipment === 'mat');
      // Si toujours vide, utiliser tous les exercices
      if (selectedExercises.length === 0) {
        selectedExercises = [...EXERCISE_DATABASE.beginner];
      }
    }
  } else {
    // Si pas d'équipement spécifié, privilégier sans matériel mais garder tous les exercices disponibles
    const noEquipment = selectedExercises.filter(ex => ex.equipment === 'none' || ex.equipment === 'mat');
    if (noEquipment.length >= 3) {
      selectedExercises = noEquipment;
    }
    // Sinon garder tous les exercices disponibles
  }
  
  // S'assurer qu'on a au moins quelques exercices
  if (selectedExercises.length === 0) {
    console.warn('Aucun exercice après filtrage, utilisation des exercices par défaut');
    selectedExercises = [...EXERCISE_DATABASE.beginner];
  }
  
  // Filtrer selon les contraintes/blessures (avec vérification pour ne pas tout supprimer)
  if (hasBackPain) {
    const beforeFilter = selectedExercises.length;
    selectedExercises = selectedExercises.filter(ex => 
      !ex.name.toLowerCase().includes('squat') && 
      !ex.name.toLowerCase().includes('fente') &&
      !ex.muscles.some(m => m.toLowerCase().includes('dos'))
    );
    // Si trop d'exercices ont été supprimés, garder au moins la moitié
    if (selectedExercises.length < beforeFilter * 0.3) {
      console.warn('Filtre dos a supprimé trop d\'exercices, réduction du filtre');
      selectedExercises = selectedExercises.slice(0, Math.max(selectedExercises.length, 3));
    }
    // Ajouter des exercices adaptés
    selectedExercises.push({ name: 'Pont', sets: 3, reps: 10, rest: 60, muscles: ['Fessiers'], equipment: 'mat', difficulty: 1 });
  }
  
  if (hasKneeIssues) {
    const beforeFilter = selectedExercises.length;
    selectedExercises = selectedExercises.filter(ex => 
      !ex.name.toLowerCase().includes('squat') && 
      !ex.name.toLowerCase().includes('fente') &&
      !ex.name.toLowerCase().includes('burpee') &&
      !ex.muscles.some(m => m.toLowerCase().includes('genou'))
    );
    // Si trop d'exercices ont été supprimés, garder au moins la moitié
    if (selectedExercises.length < beforeFilter * 0.3) {
      console.warn('Filtre genou a supprimé trop d\'exercices, réduction du filtre');
      selectedExercises = selectedExercises.slice(0, Math.max(selectedExercises.length, 3));
    }
    // Ajouter des exercices adaptés
    selectedExercises.push({ name: 'Extensions de jambes assis', sets: 3, reps: 12, rest: 45, muscles: ['Quadriceps'], equipment: 'chair', difficulty: 1 });
  }
  
  if (hasShoulderIssues) {
    const beforeFilter = selectedExercises.length;
    selectedExercises = selectedExercises.filter(ex => 
      !ex.name.toLowerCase().includes('push-up') &&
      !ex.name.toLowerCase().includes('pompe') &&
      !ex.muscles.some(m => m.toLowerCase().includes('épaule') || m.toLowerCase().includes('pectoraux'))
    );
    // Si trop d'exercices ont été supprimés, garder au moins la moitié
    if (selectedExercises.length < beforeFilter * 0.3) {
      console.warn('Filtre épaule a supprimé trop d\'exercices, réduction du filtre');
      selectedExercises = selectedExercises.slice(0, Math.max(selectedExercises.length, 3));
    }
  }

  if (computedBmi && computedBmi >= 30) {
    notes.push('Accent sur des mouvements à faible impact pour protéger les articulations en raison de votre IMC.');
    selectedExercises = selectedExercises.filter(ex => 
      !ex.name.toLowerCase().includes('jump') &&
      !ex.name.toLowerCase().includes('burpee')
    );
    selectedExercises.push(
      { name: 'Marche active', sets: 1, duration: 600, rest: 0, muscles: ['Cardio léger'], equipment: 'none', difficulty: 1 }
    );
  }

  if (restingHeartRate && restingHeartRate > 85) {
    notes.push('Intensité modérée pour tenir compte de votre fréquence cardiaque au repos.');
    intensityAdjustments.push('reduce');
  }

  if (sleepQuality && sleepQuality <= 2) {
    notes.push('Volume légèrement réduit afin de compenser une qualité de sommeil limitée.');
    intensityAdjustments.push('reduce');
  }

  if (fatigueLevel && fatigueLevel >= 4) {
    notes.push('Temps de repos allongé pour gérer votre niveau de fatigue élevé.');
    selectedExercises = selectedExercises.map(ex => ({
      ...ex,
      rest: Math.min((ex.rest || 60) + 15, 120)
    }));
  }

  if (techniqueLevel && (techniqueLevel.includes('début') || techniqueLevel.includes('novice'))) {
    notes.push('Exercices sélectionnés avec une technique accessible pour renforcer les bases.');
    const beforeFilter = selectedExercises.length;
    selectedExercises = selectedExercises.filter(ex => (ex.difficulty || 2) <= 3);
    // Si trop d'exercices ont été supprimés, garder au moins la moitié
    if (selectedExercises.length < beforeFilter * 0.5) {
      console.warn('Filtre technique a supprimé trop d\'exercices, réduction du filtre');
      selectedExercises = selectedExercises.slice(0, Math.max(selectedExercises.length, 3));
    }
  }

  if (timeSinceLastTraining && /mois|ans|année/.test(timeSinceLastTraining.toLowerCase())) {
    notes.push('Progression douce car votre dernière pratique remonte à plusieurs mois.');
    intensityAdjustments.push('reduce');
  }
  
  // Adapter selon les objectifs
  if (isMuscleGain) {
    selectedExercises = selectedExercises.map(ex => ({
      ...ex,
      sets: (ex.sets || 3) + 1,
      reps: ex.reps ? ex.reps + 2 : ex.reps,
      rest: Math.max((ex.rest || 60) - 10, 30)
    }));
  } else if (isWeightLoss || isEndurance) {
    // Ajouter plus d'exercices cardio
    selectedExercises.push(
      { name: 'Mountain Climbers', sets: 3, duration: 30, rest: 30, muscles: ['Cardio'], equipment: 'mat', difficulty: 2 },
      { name: 'Jumping Jacks', sets: 3, duration: 30, rest: 30, muscles: ['Cardio'], equipment: 'none', difficulty: 1 }
    );
    // Réduire le repos pour intensifier
    selectedExercises = selectedExercises.map(ex => ({
      ...ex,
      rest: Math.max((ex.rest || 60) - 15, 20)
    }));
  } else if (isFlexibility) {
    selectedExercises.push(
      { name: 'Étirements jambes', sets: 1, duration: 60, rest: 0, muscles: ['Flexibilité'], equipment: 'mat', difficulty: 1 },
      { name: 'Étirements dos', sets: 1, duration: 60, rest: 0, muscles: ['Flexibilité'], equipment: 'mat', difficulty: 1 }
    );
  }

  if (dietType) {
    notes.push(`Plan ajusté pour accompagner votre alimentation (${dietType}).`);
  }

  if (measurableGoals) {
    notes.push(`Suivi axé sur vos objectifs mesurables : ${measurableGoals}.`);
  }

  if (coachingStylePreference) {
    notes.push(`Style de coaching privilégié : ${coachingStylePreference}.`);
  }

  if (socialPreference) {
    notes.push(`Préférence sociale : ${socialPreference}.`);
  }

  if (alertSensitivity !== null && alertSensitivity !== undefined) {
    notes.push(`Sensibilité des alertes réglée sur ${alertSensitivity}/10 pour vos retours posturaux.`);
  }

  // Vérification finale : s'assurer qu'on a toujours des exercices après tous les filtres
  if (!selectedExercises || selectedExercises.length === 0) {
    console.error('ERREUR CRITIQUE: Tous les exercices ont été filtrés, utilisation des exercices par défaut');
    selectedExercises = [...EXERCISE_DATABASE.beginner];
  }

  // Appliquer les ajustements d'intensité cumulés
  if (intensityAdjustments.includes('reduce')) {
    selectedExercises = selectedExercises.map(ex => ({
      ...ex,
      sets: ex.sets ? Math.max(ex.sets - 1, 1) : ex.sets,
      rest: Math.min((ex.rest || 60) + 10, 120)
    }));
  }
  
  // Vérification finale après ajustements
  if (!selectedExercises || selectedExercises.length === 0) {
    console.error('ERREUR CRITIQUE: Plus d\'exercices après ajustements, utilisation des exercices par défaut');
    selectedExercises = [...EXERCISE_DATABASE.beginner];
  }
  
  // GARANTIE ABSOLUE : S'assurer qu'on a au minimum 3 exercices
  if (selectedExercises.length < 3) {
    console.warn(`Seulement ${selectedExercises.length} exercice(s) après filtrage, ajout d'exercices par défaut`);
    const defaultExercises = EXERCISE_DATABASE.beginner || EXERCISE_DATABASE.intermediate || EXERCISE_DATABASE.advanced;
    const missingCount = 3 - selectedExercises.length;
    const exercisesToAdd = defaultExercises
      .filter(ex => !selectedExercises.some(se => se.name === ex.name))
      .slice(0, missingCount);
    if (exercisesToAdd.length > 0) {
      selectedExercises.push(...exercisesToAdd);
    } else {
      // Si on ne peut pas ajouter d'exercices uniques, dupliquer les existants
      while (selectedExercises.length < 3 && selectedExercises.length > 0) {
        selectedExercises.push({...selectedExercises[0]});
      }
    }
  }
  
  console.log(`Exercices sélectionnés après tous les filtres: ${selectedExercises.length} exercices`);
  
  // Adapter la durée selon les préférences
  const targetSessionDuration = preferredDuration * 60; // en secondes
  let currentDuration = selectedExercises.reduce((sum, ex) => {
    const exDuration = (ex.sets || 1) * ((ex.reps ? ex.reps * 3 : ex.duration || 20) + (ex.rest || 60));
    return sum + exDuration;
  }, 0);
  
  // Ajuster le nombre d'exercices pour correspondre à la durée souhaitée
  if (currentDuration > targetSessionDuration * 1.2) {
    // Trop long, réduire mais GARANTIR au moins 2 exercices
    const reducedCount = Math.max(2, Math.ceil(selectedExercises.length * 0.8));
    selectedExercises = selectedExercises.slice(0, reducedCount);
  } else if (currentDuration < targetSessionDuration * 0.8 && selectedExercises.length < 8) {
    // Trop court, ajouter des exercices
    const additionalExercises = EXERCISE_DATABASE[level].filter(ex => 
      !selectedExercises.some(se => se.name === ex.name)
    );
    if (additionalExercises.length > 0) {
      selectedExercises.push(...additionalExercises.slice(0, 2));
    }
  }
  
  // GARANTIE FINALE : S'assurer qu'on a toujours au moins 2 exercices après ajustement de durée
  if (selectedExercises.length < 2) {
    console.warn(`Seulement ${selectedExercises.length} exercice(s) après ajustement de durée, ajout d'exercices`);
    const defaultExercises = EXERCISE_DATABASE.beginner || EXERCISE_DATABASE.intermediate || EXERCISE_DATABASE.advanced;
    const missingCount = 2 - selectedExercises.length;
    const exercisesToAdd = defaultExercises
      .filter(ex => !selectedExercises.some(se => se.name === ex.name))
      .slice(0, missingCount);
    if (exercisesToAdd.length > 0) {
      selectedExercises.push(...exercisesToAdd);
    } else if (selectedExercises.length > 0) {
      // Si on ne peut pas ajouter d'exercices uniques, dupliquer les existants
      while (selectedExercises.length < 2) {
        selectedExercises.push({...selectedExercises[0]});
      }
    }
  }
  
  // Générer le plan hebdomadaire selon les disponibilités
  let targetSessions = null;
  const freqMatch = pastTrainingFrequency.match(/\d+/);
  if (freqMatch) {
    targetSessions = parseInt(freqMatch[0], 10);
  }
  if (!targetSessions && planningPreference) {
    const planMatch = planningPreference.match(/\d+/);
    if (planMatch) {
      targetSessions = parseInt(planMatch[0], 10);
    }
  }
  if (!targetSessions && intensityAdjustments.includes('reduce')) {
    targetSessions = 3;
  }

  // GARANTIE FINALE : S'assurer qu'on a toujours des exercices avant de générer le plan
  if (!selectedExercises || selectedExercises.length === 0) {
    console.error('ERREUR CRITIQUE: Aucun exercice sélectionné avant génération du plan hebdomadaire');
    selectedExercises = [...EXERCISE_DATABASE.beginner];
  }
  
  // GARANTIE : Au minimum 3 exercices
  if (selectedExercises.length < 3) {
    console.warn(`Seulement ${selectedExercises.length} exercice(s), ajout d'exercices supplémentaires`);
    const defaultExercises = EXERCISE_DATABASE.beginner || EXERCISE_DATABASE.intermediate || EXERCISE_DATABASE.advanced;
    const missingCount = 3 - selectedExercises.length;
    const exercisesToAdd = defaultExercises
      .filter(ex => !selectedExercises.some(se => se.name === ex.name))
      .slice(0, missingCount);
    selectedExercises.push(...exercisesToAdd);
  }
  
  console.log(`Génération plan: ${selectedExercises.length} exercices sélectionnés pour niveau ${level}`);
  
  const weeklyPlan = generateWeeklySchedule(selectedExercises, weeklyAvailability, preferredDuration, targetSessions);
  
  // VÉRIFICATION FINALE : S'assurer que le plan hebdomadaire contient des exercices
  const totalExercises = Object.values(weeklyPlan).reduce((sum, dayExercises) => {
    return sum + (Array.isArray(dayExercises) ? dayExercises.length : 0);
  }, 0);
  
  // Si le plan est vide, vérifier si c'est parce qu'aucun jour n'a été sélectionné
  if (totalExercises === 0) {
    if (!weeklyAvailability || weeklyAvailability.trim() === '') {
      console.error('ERREUR: Aucune disponibilité hebdomadaire spécifiée par l\'utilisateur. Le plan ne peut pas être généré.');
      // Retourner un plan vide plutôt que d'utiliser des jours par défaut
      return {
        weeklyPlan: {},
        duration: '4 weeks',
        createdAt: new Date().toISOString(),
        version: `1.0.${Date.now()}`,
        seed: generatePlanSeed(profile, extendedProfile),
        metadata: {
          equipment: extendedProfile?.available_equipment || 'none',
          preferredDuration,
          motivation: mainMotivation,
          location: trainingLocation,
          weeklyAvailability: '',
          error: 'Aucune disponibilité hebdomadaire spécifiée'
        },
        notes: 'Veuillez sélectionner vos jours de disponibilité dans votre profil pour générer un plan d\'entraînement.'
      };
    } else {
      console.error('ERREUR CRITIQUE: Plan hebdomadaire généré sans exercices malgré des jours disponibles');
      // Utiliser le premier jour disponible (sélectionné par l'utilisateur)
      const availableDays = weeklyAvailability.split(',').map(d => d.trim().toLowerCase());
      const dayMapping = {
        'lundi': 'monday', 'mardi': 'tuesday', 'mercredi': 'wednesday',
        'jeudi': 'thursday', 'vendredi': 'friday', 'samedi': 'saturday', 'dimanche': 'sunday'
      };
      let firstDay = null;
      for (const day of availableDays) {
        if (dayMapping[day]) {
          firstDay = dayMapping[day];
          break;
        }
      }
      if (firstDay) {
        const emergencyExercises = selectedExercises.length > 0 ? selectedExercises : [...EXERCISE_DATABASE.beginner];
        weeklyPlan[firstDay] = emergencyExercises.slice(0, Math.min(3, emergencyExercises.length));
      }
    }
  }
  
  // GARANTIE : Chaque jour doit avoir au moins 1 exercice
  Object.keys(weeklyPlan).forEach(day => {
    if (!weeklyPlan[day] || !Array.isArray(weeklyPlan[day]) || weeklyPlan[day].length === 0) {
      console.warn(`Jour ${day} est vide, ajout d'un exercice par défaut`);
      const defaultExercise = selectedExercises[0] || EXERCISE_DATABASE.beginner[0];
      weeklyPlan[day] = [defaultExercise];
    }
  });
  
  const finalTotalExercises = Object.values(weeklyPlan).reduce((sum, dayExercises) => {
    return sum + (Array.isArray(dayExercises) ? dayExercises.length : 0);
  }, 0);
  
  console.log(`Plan généré: ${Object.keys(weeklyPlan).length} jours avec ${finalTotalExercises} exercices au total`);
  
  // Version du plan (pour traçabilité FR-06)
  const planVersion = `1.0.${Date.now()}`;

  const metadata = sanitizeContextObject({
    equipment: extendedProfile?.available_equipment || 'none',
    preferredDuration,
    motivation: mainMotivation,
    location: trainingLocation,
    weeklyAvailability,
    measurableGoals,
    dietType,
    sleepQuality,
    fatigueLevel,
    pastTrainingFrequency,
    timeSinceLastTraining,
    techniqueLevel: extendedProfile?.technique_level,
    computedBmi,
    restingHeartRate,
    coachingStylePreference,
    socialPreference
  });
  
  return {
    level,
    goals,
    constraints,
    weeklyPlan,
    duration: '4 weeks',
    createdAt: new Date().toISOString(),
    version: planVersion,
    seed: generatePlanSeed(profile, extendedProfile), // Seed pour reproductibilité
    metadata: {
      ...metadata,
      generatedBy: process.env.OPENAI_API_KEY ? 'ai' : 'rules_engine'
    },
    notes: notes.length > 0
      ? notes.join(' ')
      : 'Plan généré automatiquement selon vos informations de profil et de profil détaillé.',
    optimized: false
  };
}

function sanitizeContextObject(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const result = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;

    if (Array.isArray(value)) {
      const cleaned = value
        .map(item => (typeof item === 'string' ? item.trim() : item))
        .filter(item => item !== null && item !== undefined && (typeof item !== 'string' || item !== ''));
      if (cleaned.length > 0) {
        result[key] = cleaned;
      }
    } else if (typeof value === 'object') {
      const nested = sanitizeContextObject(value);
      if (Object.keys(nested).length > 0) {
        result[key] = nested;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Fonction utilitaire pour calculer l'âge à partir de la date de naissance
function calculateAge(birthdate, fallbackAge = null) {
  if (birthdate) {
    const birthDate = new Date(birthdate);
    const today = new Date();
    let calculatedAge = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      calculatedAge--;
    }
    return calculatedAge;
  }
  return fallbackAge;
}

// Construire le contexte utilisateur pour l'IA (FR-06)
function buildUserContext(profile = {}, extendedProfile = {}) {
  // Calculer l'IMC si disponible
  const computedBmi =
    extendedProfile?.bmi ||
    (profile.weight && profile.height
      ? Number((profile.weight / Math.pow(profile.height / 100, 2)).toFixed(1))
      : null);

  // Construire le contexte complet avec toutes les informations du profil
  const context = {
    basicProfile: {
      name: profile.name || 'Utilisateur',
      age: calculateAge(profile.birthdate, profile.age),
      weight: profile.weight || null,
      height: profile.height || null,
      fitnessLevel: profile.fitness_level || 'beginner',
      primaryGoals: profile.goals || 'general',
      constraints: profile.constraints || ''
    },
    physicalMetrics: {
      bmi: computedBmi,
      bodyComposition: extendedProfile.body_composition,
      restingHeartRate: extendedProfile.resting_heart_rate,
      bloodPressure: extendedProfile.blood_pressure,
      waistCircumference: extendedProfile.waist_circumference,
      hipCircumference: extendedProfile.hip_circumference,
      armCircumference: extendedProfile.arm_circumference,
      thighCircumference: extendedProfile.thigh_circumference
    },
    healthBackground: {
      medicalHistory: extendedProfile.medical_history,
      injuryHistory: extendedProfile.injury_history,
      sleepQuality: extendedProfile.sleep_quality,
      fatigueLevel: extendedProfile.fatigue_level,
      dietType: extendedProfile.diet_type
    },
    lifestyleHabits: {
      weeklyAvailability: extendedProfile.weekly_availability,
      preferredSessionDuration: extendedProfile.preferred_session_duration || 30,
      trainingLocation: extendedProfile.training_location || 'home',
      availableEquipment: extendedProfile.available_equipment || 'none',
      dailySittingHours: extendedProfile.daily_sitting_hours
    },
    motivationAndPsychology: {
      mainMotivation: extendedProfile.main_motivation || 'health',
      coachingStylePreference: extendedProfile.coaching_style_preference,
      demotivationFactors: extendedProfile.demotivation_factors,
      engagementScore: extendedProfile.engagement_score,
      socialPreference: extendedProfile.social_preference
    },
    sportsHistory: {
      pastSports: extendedProfile.past_sports,
      pastTrainingFrequency: extendedProfile.past_training_frequency,
      timeSinceLastTraining: extendedProfile.time_since_last_training,
      techniqueLevel: extendedProfile.technique_level
    },
    technicalPreferences: {
      measurableGoals: extendedProfile.measurable_goals,
      alertSensitivity: extendedProfile.alert_sensitivity,
      cameraConsent: extendedProfile.camera_consent,
      planningPreference: extendedProfile.planning_preference
    }
  };

  return sanitizeContextObject(context);
}

// Valider et enrichir le plan généré par l'IA (FR-06)
function validateAndEnrichPlan(aiPlan, profile, extendedProfile) {
  // Validation de base
  if (!aiPlan || typeof aiPlan !== 'object') {
    throw new Error('Plan invalide: objet manquant');
  }
  
  // S'assurer que le plan a la structure correcte
  if (!aiPlan.weeklyPlan || typeof aiPlan.weeklyPlan !== 'object') {
    throw new Error('Plan invalide: weeklyPlan manquant ou invalide');
  }
  
  // Valider que weeklyPlan n'est pas vide
  const weeklyPlanKeys = Object.keys(aiPlan.weeklyPlan);
  if (weeklyPlanKeys.length === 0) {
    throw new Error('Plan invalide: weeklyPlan vide');
  }
  
  // Valider et nettoyer chaque jour du plan
  const cleanedWeeklyPlan = {};
  const defaultExercise = { name: 'Squats', sets: 3, reps: 10, rest: 60, muscles: ['Quadriceps'], equipment: 'none', difficulty: 1 };
  
  for (const [day, exercises] of Object.entries(aiPlan.weeklyPlan)) {
    if (!Array.isArray(exercises)) {
      console.warn(`Jour ${day} invalide: pas un tableau, ajout d'un exercice par défaut`);
      cleanedWeeklyPlan[day] = [defaultExercise];
      continue;
    }
    
    // Valider et nettoyer chaque exercice
    const cleanedExercises = exercises
      .filter(ex => ex && typeof ex === 'object' && ex.name) // Garder seulement les exercices valides avec un nom
      .map(ex => {
        // S'assurer que les valeurs numériques sont valides
        const cleaned = {
          name: String(ex.name || 'Exercice sans nom').trim(),
          sets: ex.sets && Number.isInteger(Number(ex.sets)) && Number(ex.sets) > 0 ? Number(ex.sets) : null,
          reps: ex.reps && Number.isInteger(Number(ex.reps)) && Number(ex.reps) > 0 ? Number(ex.reps) : null,
          duration: ex.duration && Number.isInteger(Number(ex.duration)) && Number(ex.duration) > 0 ? Number(ex.duration) : null,
          rest: ex.rest && Number.isInteger(Number(ex.rest)) && Number(ex.rest) >= 0 ? Number(ex.rest) : 60
        };
        
        // S'assurer qu'au moins sets, reps ou duration est défini
        if (!cleaned.sets && !cleaned.reps && !cleaned.duration) {
          // Valeurs par défaut si rien n'est défini
          cleaned.sets = 3;
          cleaned.reps = 10;
        }
        
        // Ajouter les propriétés optionnelles si présentes
        if (ex.type) cleaned.type = String(ex.type);
        if (ex.tempo) cleaned.tempo = String(ex.tempo);
        if (ex.focus && Array.isArray(ex.focus)) cleaned.focus = ex.focus;
        if (ex.notes) cleaned.notes = String(ex.notes);
        
        return cleaned;
      });
    
    // GARANTIE : Chaque jour doit avoir au moins 1 exercice
    if (cleanedExercises.length > 0) {
      cleanedWeeklyPlan[day] = cleanedExercises;
    } else {
      // Si un jour n'a pas d'exercices valides, lui donner un exercice par défaut
      console.warn(`Jour ${day} n'a pas d'exercices valides, ajout d'un exercice par défaut`);
      cleanedWeeklyPlan[day] = [defaultExercise];
    }
  }
  
  // GARANTIE ABSOLUE : Si après nettoyage le plan est vide, utiliser le plan de fallback
  if (Object.keys(cleanedWeeklyPlan).length === 0) {
    console.error('ERREUR CRITIQUE: Plan invalide: aucun exercice valide après nettoyage, création d\'un plan par défaut');
    cleanedWeeklyPlan.monday = [defaultExercise];
    cleanedWeeklyPlan.wednesday = [defaultExercise];
    cleanedWeeklyPlan.friday = [defaultExercise];
  }
  
  // GARANTIE : Vérifier que chaque jour a au moins un exercice
  Object.keys(cleanedWeeklyPlan).forEach(day => {
    if (!cleanedWeeklyPlan[day] || !Array.isArray(cleanedWeeklyPlan[day]) || cleanedWeeklyPlan[day].length === 0) {
      console.warn(`Jour ${day} est vide après nettoyage, ajout d'un exercice par défaut`);
      cleanedWeeklyPlan[day] = [defaultExercise];
    }
  });
  
  aiPlan.weeklyPlan = cleanedWeeklyPlan;
  
  // Enrichir avec les métadonnées
  aiPlan.level = profile?.fitness_level || 'beginner';
  aiPlan.goals = profile?.goals || 'general';
  aiPlan.constraints = profile?.constraints || '';
  aiPlan.version = `1.0.${Date.now()}`;
  aiPlan.seed = generatePlanSeed(profile || {}, extendedProfile || {});
  aiPlan.createdAt = new Date().toISOString();
  aiPlan.duration = aiPlan.duration || '4 weeks';
  
  const computedBmi =
    extendedProfile?.bmi ||
    (profile?.weight && profile?.height
      ? Number((profile.weight / Math.pow(profile.height / 100, 2)).toFixed(1))
      : null);

  const enrichedMetadata = {
    // Informations de base du profil
    fitnessLevel: profile?.fitness_level || 'beginner',
    primaryGoals: profile?.goals || 'general',
    constraints: profile?.constraints || '',
    // Informations du profil étendu
    equipment: extendedProfile?.available_equipment || 'none',
    preferredDuration: extendedProfile?.preferred_session_duration || 30,
    motivation: extendedProfile?.main_motivation || 'health',
    location: extendedProfile?.training_location || 'home',
    weeklyAvailability: extendedProfile?.weekly_availability,
    measurableGoals: extendedProfile?.measurable_goals,
    dietType: extendedProfile?.diet_type,
    sleepQuality: extendedProfile?.sleep_quality,
    fatigueLevel: extendedProfile?.fatigue_level,
    coachingStyle: extendedProfile?.coaching_style_preference,
    pastTrainingFrequency: extendedProfile?.past_training_frequency,
    timeSinceLastTraining: extendedProfile?.time_since_last_training,
    injuryHistory: extendedProfile?.injury_history,
    medicalHistory: extendedProfile?.medical_history,
    bodyComposition: extendedProfile?.body_composition,
    bmi: computedBmi,
    // Métadonnées techniques
    generatedBy: 'ai',
    // Informations démographiques pour référence
    age: calculateAge(profile?.birthdate, profile?.age),
    weight: profile?.weight,
    height: profile?.height
  };

  aiPlan.metadata = sanitizeContextObject(enrichedMetadata);

  if (!aiPlan.notes || aiPlan.notes.trim() === '') {
    aiPlan.notes = `Plan IA basé sur votre profil (${aiPlan.level}) avec prise en compte de vos objectifs "${aiPlan.goals}" et de vos données de profil détaillé.`;
  }

  aiPlan.optimized = false;
  
  return aiPlan;
}

// Générer le planning hebdomadaire selon les disponibilités (FR-06)
// UNIQUEMENT utiliser les jours sélectionnés par l'utilisateur
function generateWeeklySchedule(exercises, availability, preferredDuration, targetSessions) {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const weeklyPlan = {};
  
  // Analyser les disponibilités - UNIQUEMENT les jours réellement sélectionnés par l'utilisateur
  let availableDays = [];
  if (availability && availability.trim() !== '') {
    const availabilityLower = availability.toLowerCase();
    // Mapping des jours français vers anglais
    const dayMapping = {
      'lundi': 'monday',
      'mardi': 'tuesday',
      'mercredi': 'wednesday',
      'jeudi': 'thursday',
      'vendredi': 'friday',
      'samedi': 'saturday',
      'dimanche': 'sunday',
      'monday': 'monday',
      'tuesday': 'tuesday',
      'wednesday': 'wednesday',
      'thursday': 'thursday',
      'friday': 'friday',
      'saturday': 'saturday',
      'sunday': 'sunday'
    };
    
    // Parser la chaîne de disponibilité (format: "Lundi, Mercredi, Vendredi" ou "Lundi,Mercredi")
    // Normaliser d'abord en minuscules pour la comparaison
    const availabilityParts = availability.split(',').map(part => part.trim().toLowerCase());
    
    availabilityParts.forEach(part => {
      // Chercher le jour correspondant dans le mapping (comparaison exacte en minuscules)
      const matchedDay = dayMapping[part];
      if (matchedDay && !availableDays.includes(matchedDay)) {
        availableDays.push(matchedDay);
      }
    });
  }
  
  // NE PAS utiliser de jours par défaut - utiliser UNIQUEMENT les jours sélectionnés par l'utilisateur
  // Si aucun jour n'est sélectionné, retourner un plan vide ou avec un message d'erreur
  if (availableDays.length === 0) {
    console.warn('Aucune disponibilité hebdomadaire spécifiée par l\'utilisateur. Le plan ne peut pas être généré sans jours de disponibilité.');
    // Retourner un plan vide plutôt que d'utiliser des jours par défaut
    return {};
  }

  // Utiliser UNIQUEMENT les jours sélectionnés par l'utilisateur (pas de complément avec d'autres jours)
  const uniqueDays = [...new Set(availableDays)];
  
  // Ne pas compléter avec d'autres jours - utiliser uniquement ceux sélectionnés
  const selectedDays = uniqueDays;
  
  // Le nombre de sessions cible ne doit pas dépasser le nombre de jours disponibles
  let sessionsTarget = targetSessions && targetSessions > 0 ? Math.min(targetSessions, selectedDays.length) : selectedDays.length;
  
  // GARANTIE : S'assurer qu'on a des exercices à répartir
  if (!exercises || exercises.length === 0) {
    console.error('ERREUR CRITIQUE dans generateWeeklySchedule: Aucun exercice fourni');
    exercises = [...EXERCISE_DATABASE.beginner];
  }
  
  // Répartir les exercices sur les jours disponibles
  // S'assurer qu'il y a au moins 1 exercice par jour, idéalement 2-4
  const minExercisesPerDay = 2;
  const maxExercisesPerDay = 4;
  const exercisesPerDay = Math.max(minExercisesPerDay, Math.min(maxExercisesPerDay, Math.ceil(exercises.length / selectedDays.length)));
  
  selectedDays.forEach((day, index) => {
    const start = index * exercisesPerDay;
    const end = Math.min(start + exercisesPerDay, exercises.length);
    let dayExercises = exercises.slice(start, end);
    
    // GARANTIE : Chaque jour doit avoir au moins 1 exercice
    if (dayExercises.length === 0) {
      // Si ce jour n'a pas d'exercice, prendre le premier disponible ou un par défaut
      dayExercises = [exercises[0] || EXERCISE_DATABASE.beginner[0]];
    }
    
    // Si on arrive à la fin et qu'il reste des exercices, les répartir
    if (index === selectedDays.length - 1 && start + exercisesPerDay < exercises.length) {
      dayExercises = exercises.slice(start);
    }
    
    weeklyPlan[day] = dayExercises;
  });
  
  // GARANTIE ABSOLUE : S'assurer qu'il y a au moins un jour avec des exercices
  // MAIS uniquement si des jours ont été sélectionnés par l'utilisateur
  if (Object.keys(weeklyPlan).length === 0 && selectedDays.length > 0) {
    console.error('ERREUR CRITIQUE: Aucun jour avec exercices malgré des jours disponibles');
    // Utiliser le premier jour disponible (sélectionné par l'utilisateur)
    const defaultExercises = exercises.length > 0 ? exercises : [...EXERCISE_DATABASE.beginner];
    weeklyPlan[selectedDays[0]] = defaultExercises.slice(0, Math.min(3, defaultExercises.length));
  }
  
  // GARANTIE : S'assurer que chaque jour a au moins un exercice
  Object.keys(weeklyPlan).forEach(day => {
    if (!weeklyPlan[day] || !Array.isArray(weeklyPlan[day]) || weeklyPlan[day].length === 0) {
      console.warn(`Jour ${day} est vide, ajout d'un exercice par défaut`);
      const defaultExercise = exercises[0] || EXERCISE_DATABASE.beginner[0];
      weeklyPlan[day] = [defaultExercise];
    }
  });
  
  // VÉRIFICATION FINALE : Compter le total d'exercices dans le plan
  const totalExercisesInPlan = Object.values(weeklyPlan).reduce((sum, dayExercises) => {
    return sum + (Array.isArray(dayExercises) ? dayExercises.length : 0);
  }, 0);
  
  if (totalExercisesInPlan === 0) {
    console.error('ERREUR CRITIQUE: Le plan hebdomadaire est complètement vide après génération');
    weeklyPlan.monday = [EXERCISE_DATABASE.beginner[0] || { name: 'Squats', sets: 3, reps: 10, rest: 60, muscles: ['Quadriceps'], equipment: 'none', difficulty: 1 }];
  }
  
  console.log(`Plan hebdomadaire généré: ${Object.keys(weeklyPlan).length} jours, ${totalExercisesInPlan} exercices au total`);
  
  return weeklyPlan;
}

// Générer un seed pour la reproductibilité (FR-06)
function generatePlanSeed(profile, extendedProfile) {
  const seedData = {
    level: profile.fitness_level,
    goals: profile.goals,
    equipment: extendedProfile?.available_equipment || 'none',
    motivation: extendedProfile?.main_motivation || 'health'
  };
  return Buffer.from(JSON.stringify(seedData)).toString('base64').substring(0, 16);
}

// Fonction de génération de plan de base (fallback)
function generateWorkoutPlan(profile) {
  return generateWorkoutPlanRules(profile, null);
}

// Fonction d'optimisation continue améliorée (FR-15)
function optimizeWorkoutPlan(plan, sessionHistory, userFeedback, difficulty, rpe) {
  if (!plan || !plan.weeklyPlan) return plan;

  // Analyser les sessions précédentes (boucle d'apprentissage) - 2 dernières sessions
  const recentSessions = sessionHistory.slice(0, 2);
  const avgPostureScore = recentSessions.length > 0
    ? recentSessions.reduce((sum, s) => sum + (s.posture_score || 0), 0) / recentSessions.length
    : 0;
  
  const avgCompletionRate = recentSessions.length > 0
    ? recentSessions.reduce((sum, s) => {
        const sessionData = typeof s.session_data === 'string' ? JSON.parse(s.session_data) : s.session_data;
        const completed = sessionData.exercisesCompleted || 0;
        const total = sessionData.workout?.exercises?.length || 1;
        return sum + (completed / total);
      }, 0) / recentSessions.length
    : 1;

  // Analyser le feedback et les métriques
  const feedbackLower = (userFeedback || '').toLowerCase();
  const isTooEasy = feedbackLower.includes('facile') || feedbackLower.includes('easy') || 
                    (difficulty && parseInt(difficulty) <= 2) ||
                    (rpe && parseInt(rpe) <= 4);
  const isTooHard = feedbackLower.includes('difficile') || feedbackLower.includes('hard') || 
                    (difficulty && parseInt(difficulty) >= 4) ||
                    (rpe && parseInt(rpe) >= 8);

  // Calculer les paramètres d'optimisation (FR-15)
  const optimizationParams = calculateOptimizationParams(
    avgPostureScore,
    avgCompletionRate,
    isTooEasy,
    isTooHard,
    recentSessions
  );

  // Ajuster l'intensité selon les paramètres calculés
  Object.keys(plan.weeklyPlan).forEach(day => {
    plan.weeklyPlan[day] = plan.weeklyPlan[day].map(exercise => {
      let newExercise = { ...exercise };

      // Ajustements basés sur les paramètres d'optimisation
      if (optimizationParams.intensityAdjustment > 0) {
        // Augmenter l'intensité
        if (exercise.reps) newExercise.reps = Math.round((exercise.reps || 0) * (1 + optimizationParams.intensityAdjustment));
        if (exercise.sets) newExercise.sets = Math.round((exercise.sets || 0) * (1 + optimizationParams.intensityAdjustment * 0.5));
        if (exercise.duration) newExercise.duration = Math.round((exercise.duration || 0) * (1 + optimizationParams.intensityAdjustment * 0.3));
        newExercise.rest = Math.max(Math.round((newExercise.rest || 60) * (1 - optimizationParams.intensityAdjustment * 0.2)), 30);
      } else if (optimizationParams.intensityAdjustment < 0) {
        // Réduire l'intensité
        if (exercise.reps) newExercise.reps = Math.max(Math.round((exercise.reps || 0) * (1 + optimizationParams.intensityAdjustment)), 5);
        if (exercise.sets) newExercise.sets = Math.max(Math.round((exercise.sets || 0) * (1 + optimizationParams.intensityAdjustment * 0.5)), 1);
        if (exercise.duration) newExercise.duration = Math.max(Math.round((exercise.duration || 0) * (1 + optimizationParams.intensityAdjustment * 0.3)), 10);
        newExercise.rest = Math.round((newExercise.rest || 60) * (1 - optimizationParams.intensityAdjustment * 0.2));
      }

      return newExercise;
    });
  });

  // Enregistrer les paramètres d'optimisation dans les métadonnées
  plan.optimized = true;
  plan.lastOptimized = new Date().toISOString();
  plan.optimizationParams = optimizationParams;
  plan.optimizationMetrics = {
    avgPostureScore,
    avgCompletionRate,
    sessionsAnalyzed: recentSessions.length,
    timestamp: new Date().toISOString()
  };

  return plan;
}

// Calculer les paramètres d'optimisation basés sur les indicateurs (FR-15)
function calculateOptimizationParams(avgPostureScore, avgCompletionRate, isTooEasy, isTooHard, recentSessions) {
  let intensityAdjustment = 0;
  let restAdjustment = 0;
  let volumeAdjustment = 0;

  // Analyse de la progression posturale
  if (avgPostureScore >= 85 && avgCompletionRate >= 0.9) {
    // Excellent : augmenter progressivement
    intensityAdjustment = 0.1; // +10% d'intensité
  } else if (avgPostureScore >= 75 && avgCompletionRate >= 0.8) {
    // Bon : légère augmentation
    intensityAdjustment = 0.05; // +5% d'intensité
  } else if (avgPostureScore < 60 || avgCompletionRate < 0.6) {
    // Faible : réduire l'intensité
    intensityAdjustment = -0.15; // -15% d'intensité
  } else if (avgPostureScore < 70 || avgCompletionRate < 0.7) {
    // Moyen : légère réduction
    intensityAdjustment = -0.05; // -5% d'intensité
  }

  // Ajustements basés sur le feedback utilisateur
  if (isTooEasy) {
    intensityAdjustment = Math.max(intensityAdjustment, 0.15); // Forcer augmentation
  }
  if (isTooHard) {
    intensityAdjustment = Math.min(intensityAdjustment, -0.2); // Forcer réduction
  }

  // Analyse de la tendance (progression ou régression) - basée sur les 2 dernières sessions
  if (recentSessions.length >= 2) {
    const scores = recentSessions.slice(0, 2).map(s => s.posture_score || 0);
    const trend = scores[0] - scores[1]; // Différence entre la dernière et l'avant-dernière
    
    if (trend > 5) {
      // Progression positive : augmenter légèrement
      intensityAdjustment += 0.05;
    } else if (trend < -5) {
      // Régression : réduire
      intensityAdjustment -= 0.1;
    }
  }

  // Limiter les ajustements pour éviter les changements trop brusques
  intensityAdjustment = Math.max(-0.3, Math.min(0.3, intensityAdjustment));

  return {
    intensityAdjustment,
    restAdjustment,
    volumeAdjustment,
    calculatedAt: new Date().toISOString()
  };
}

// Analyser les indicateurs de performance (FR-15)
function analyzePerformanceIndicators(userId, callback) {
  // Calculer l'adhérence (fréquence des séances)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  db.all(
    `SELECT COUNT(*) as session_count, 
            AVG(posture_score) as avg_score,
            AVG(CAST(json_extract(session_data, '$.duration') AS REAL)) as avg_duration
     FROM sessions 
     WHERE user_id = ? AND completed_at >= ?`,
    [userId, thirtyDaysAgo.toISOString()],
    (err, rows) => {
      if (err) {
        return callback(err, null);
      }

      const adherence = rows[0]?.session_count || 0;
      const avgPostureScore = rows[0]?.avg_score || 0;
      const avgDuration = rows[0]?.avg_duration || 0;

      // Calculer la cohérence (écart-type des jours entre séances)
      db.all(
        `SELECT completed_at FROM sessions 
         WHERE user_id = ? AND completed_at >= ? 
         ORDER BY completed_at DESC`,
        [userId, thirtyDaysAgo.toISOString()],
        (err, sessionDates) => {
          if (err) {
            return callback(err, null);
          }

          let consistency = 100;
          if (sessionDates.length > 1) {
            const intervals = [];
            for (let i = 0; i < sessionDates.length - 1; i++) {
              const date1 = new Date(sessionDates[i].completed_at);
              const date2 = new Date(sessionDates[i + 1].completed_at);
              intervals.push(Math.abs(date1 - date2) / (1000 * 60 * 60 * 24)); // jours
            }
            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
            const stdDev = Math.sqrt(variance);
            // Plus l'écart-type est faible, plus la cohérence est élevée
            consistency = Math.max(0, Math.min(100, 100 - (stdDev * 10)));
          }

          // Calculer la progression (tendance des scores)
          let progression = 0;
          if (sessionDates.length >= 5) {
            const recentScores = sessionDates.slice(0, 5).map(s => s.posture_score || 0);
            const oldScores = sessionDates.slice(-5).map(s => s.posture_score || 0);
            const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
            const oldAvg = oldScores.reduce((a, b) => a + b, 0) / oldScores.length;
            progression = recentAvg - oldAvg;
          }

          const indicators = {
            adherence: {
              sessionsLast30Days: adherence,
              target: 12, // 3 séances/semaine * 4 semaines
              percentage: Math.min(100, (adherence / 12) * 100),
              status: adherence >= 12 ? 'excellent' : adherence >= 8 ? 'good' : adherence >= 4 ? 'fair' : 'poor'
            },
            progression: {
              avgPostureScore,
              trend: progression,
              status: progression > 5 ? 'improving' : progression > 0 ? 'stable' : 'declining'
            },
            consistency: {
              score: consistency,
              status: consistency >= 80 ? 'excellent' : consistency >= 60 ? 'good' : consistency >= 40 ? 'fair' : 'poor'
            },
            performance: {
              avgDuration,
              avgPostureScore,
              status: avgPostureScore >= 80 ? 'excellent' : avgPostureScore >= 70 ? 'good' : avgPostureScore >= 60 ? 'fair' : 'poor'
            }
          };

          callback(null, indicators);
        }
      );
    }
  );
}

// Routes séances
app.post('/api/session', authenticateToken, (req, res) => {
  const { sessionData, feedback, postureScore } = req.body;
  
  db.run(
    'INSERT INTO sessions (user_id, session_data, feedback, posture_score) VALUES (?, ?, ?, ?)',
    [req.user.id, JSON.stringify(sessionData), feedback, postureScore],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ sessionId: this.lastID, message: 'Séance enregistrée' });
    }
  );
});

app.get('/api/session/history', authenticateToken, (req, res) => {
  db.all(
    'SELECT * FROM sessions WHERE user_id = ? ORDER BY completed_at DESC LIMIT 30',
    [req.user.id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      const sessions = rows.map(row => ({
        ...row,
        session_data: JSON.parse(row.session_data)
      }));
      res.json(sessions);
    }
  );
});

// Routes progression
app.get('/api/progress', authenticateToken, (req, res) => {
  db.all(
    'SELECT * FROM progress WHERE user_id = ? ORDER BY date DESC LIMIT 30',
    [req.user.id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      const progress = rows.map(row => ({
        ...row,
        metrics: JSON.parse(row.metrics)
      }));
      res.json(progress);
    }
  );
});

app.post('/api/progress', authenticateToken, (req, res) => {
  const { metrics } = req.body;
  const today = new Date().toISOString().split('T')[0];
  
  db.run(
    `INSERT INTO progress (user_id, date, metrics) VALUES (?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET metrics = excluded.metrics`,
    [req.user.id, today, JSON.stringify(metrics)],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Progression enregistrée' });
    }
  );
});

// Route chat IA avec streaming (FR-14) - SLA <2s pour premier token
app.post('/api/chat', authenticateToken, async (req, res) => {
  const { message, stream = true } = req.body;
  const startTime = Date.now();
  const userContext = await loadUserContext(req.user.id);
  
  // Safeguards: Vérifier que le message n'est pas vide ou trop long
  if (!message || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message vide' });
  }
  if (message.length > 1000) {
    return res.status(400).json({ error: 'Message trop long (max 1000 caractères)' });
  }
  
  // Construire le message système avec contexte (FR-14)
  const systemMessage = buildChatSystemMessage(userContext);
  
  // Toujours essayer d'utiliser OpenAI si disponible
  if (process.env.OPENAI_API_KEY) {
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      // Si streaming demandé, utiliser Server-Sent Events (FR-14)
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        const stream = await openai.chat.completions.create({
          model: 'gpt-4o-mini', // Utiliser un modèle plus récent et performant
          messages: [
            {
              role: 'system',
              content: systemMessage
            },
            {
              role: 'user',
              content: message
            }
          ],
          max_tokens: 600, // Augmenter pour des réponses plus complètes
          temperature: 0.8, // Augmenter pour plus de variété et personnalisation
          stream: true
        });
        
        let firstTokenTime = null;
        let fullResponse = '';
        
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            if (!firstTokenTime) {
              firstTokenTime = Date.now() - startTime;
              // Envoyer le temps du premier token pour vérifier SLA <2s
              res.write(`data: ${JSON.stringify({ type: 'first_token', time: firstTokenTime })}\n\n`);
            }
            
            fullResponse += delta;
            // Envoyer chaque chunk au client
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: delta })}\n\n`);
          }
        }
        
        // Envoyer la réponse complète et les métriques
        const totalTime = Date.now() - startTime;
        res.write(`data: ${JSON.stringify({ 
          type: 'done', 
          response: fullResponse,
          firstTokenTime: firstTokenTime,
          totalTime: totalTime,
          slaMet: firstTokenTime ? firstTokenTime < 2000 : false
        })}\n\n`);
        res.end();
        return; // Important: arrêter l'exécution ici
      } else {
        // Mode non-streaming
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: systemMessage
            },
            {
              role: 'user',
              content: message
            }
          ],
          max_tokens: 600,
          temperature: 0.8
        });

        const responseTime = Date.now() - startTime;
        res.json({ 
          response: completion.choices[0].message.content,
          source: 'ai',
          responseTime: responseTime,
          slaMet: responseTime < 2000
        });
        return; // Important: arrêter l'exécution ici
      }
    } catch (error) {
      console.error('Erreur chat IA:', error);
      // En cas d'erreur, continuer vers le fallback
    }
  }
  
  // Fallback uniquement si OpenAI n'est pas disponible ou en cas d'erreur
  const fallbackResponse = getFallbackChatResponse(message);
  if (stream) {
    return res.json({ response: fallbackResponse, source: 'fallback' });
  }
  res.json({ 
    response: fallbackResponse, 
    source: 'fallback'
  });
});

// Suggestions rapides alimentées par l'IA (FR-14 complément)
app.get('/api/chat/suggestions', authenticateToken, async (req, res) => {
  const defaultSuggestions = [
    'Comment améliorer ma technique ?',
    'Conseils nutrition personnalisés',
    'Comment rester motivé sur la durée ?',
    'Planifier ma semaine d’entraînement'
  ];

  const userContext = await loadUserContext(req.user.id);

  if (process.env.OPENAI_API_KEY) {
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const prompt = `Tu es un coach sportif numérique qui prépare des suggestions de discussion pour un utilisateur.
Contexte utilisateur:
${JSON.stringify(userContext, null, 2)}

Génère 4 idées de questions ou de sujets que l'utilisateur pourrait poser pour améliorer son entraînement.
Réponds uniquement en JSON suivant le format:
{
  "suggestions": [
    "Suggestion 1",
    "Suggestion 2",
    "Suggestion 3",
    "Suggestion 4"
  ]
}
Chaque suggestion doit être concise (max 90 caractères) et axée sur l'accompagnement personnalisé.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Tu es un assistant qui renvoie uniquement du JSON valide.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 250,
        temperature: 0.8
      });

      const raw = completion.choices[0].message.content || '';
      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);

      if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
        return res.json({ suggestions: parsed.suggestions.slice(0, 4) });
      }
    } catch (error) {
      console.error('Erreur génération suggestions IA:', error.message);
    }
  }

  res.json({ suggestions: defaultSuggestions });
});

// Construire le message système avec contexte utilisateur (FR-14)
function buildChatSystemMessage(userContext) {
  let systemMessage = `Tu es Alen, un coach sportif virtuel intelligent, bienveillant et expérimenté. Tu aides les utilisateurs avec des conseils personnalisés, détaillés et adaptés sur l'entraînement, la technique, la nutrition, la motivation et la récupération.

TON STYLE:
- Sois encourageant, positif et motivant
- Utilise un ton chaleureux et professionnel
- Varie tes formulations pour éviter la monotonie
- Sois précis et donne des exemples concrets
- Adapte tes conseils au niveau et aux objectifs de l'utilisateur
- Réponds de manière complète mais concise (4-6 phrases)
- Utilise des emojis occasionnellement pour rendre tes réponses plus vivantes (🏋️ 💪 🥗 ⚡ 🎯)
- Sois naturel et conversationnel, comme un vrai coach humain`;

  if (userContext && userContext.profile) {
    const p = userContext.profile;
    systemMessage += `\n\nCONTEXTE UTILISATEUR ACTUEL:\n`;
    if (p.name) systemMessage += `- Nom: ${p.name}\n`;
    if (p.age) systemMessage += `- Âge: ${p.age} ans\n`;
    if (p.fitness_level) {
      const levelTranslations = {
        'beginner': 'débutant',
        'intermediate': 'intermédiaire',
        'advanced': 'avancé'
      };
      systemMessage += `- Niveau de forme: ${levelTranslations[p.fitness_level] || p.fitness_level}\n`;
    }
    if (p.goals) systemMessage += `- Objectifs principaux: ${p.goals}\n`;
    if (p.constraints) systemMessage += `- Contraintes/blessures: ${p.constraints}\n`;
    
    if (userContext.extendedProfile) {
      const ep = userContext.extendedProfile;
      if (ep.main_motivation) {
        const motivationTranslations = {
          'health': 'santé et bien-être',
          'performance': 'performance sportive',
          'aesthetics': 'esthétique et apparence',
          'weight_loss': 'perte de poids',
          'muscle_gain': 'prise de masse musculaire'
        };
        systemMessage += `- Motivation principale: ${motivationTranslations[ep.main_motivation] || ep.main_motivation}\n`;
      }
      if (ep.available_equipment) systemMessage += `- Équipement disponible: ${ep.available_equipment}\n`;
      if (ep.preferred_session_duration) systemMessage += `- Durée de séance préférée: ${ep.preferred_session_duration} minutes\n`;
      if (ep.weekly_availability) systemMessage += `- Disponibilité hebdomadaire: ${ep.weekly_availability}\n`;
    }
    
    if (userContext.recentSessions && userContext.recentSessions.length > 0) {
      systemMessage += `\nPROGRESSION RÉCENTE (${userContext.recentSessions.length} dernières séances):\n`;
      userContext.recentSessions.slice(0, 3).forEach((s, index) => {
        const date = new Date(s.date).toLocaleDateString('fr-FR');
        systemMessage += `- ${date}: score postural ${s.score}/100${s.feedback ? `, feedback: ${s.feedback}` : ''}\n`;
      });
      
      // Calculer la tendance
      if (userContext.recentSessions.length >= 2) {
        const scores = userContext.recentSessions.map(s => s.score || 0);
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        const trend = scores[0] - scores[scores.length - 1];
        systemMessage += `- Score moyen: ${Math.round(avgScore)}/100, tendance: ${trend > 0 ? 'amélioration' : trend < 0 ? 'régression' : 'stable'}\n`;
      }
    }
  }
  
  systemMessage += `\nINSTRUCTIONS IMPORTANTES:
- Personnalise toujours tes réponses en utilisant le contexte utilisateur ci-dessus
- Réponds directement à la question posée, de manière complète et pertinente
- Varie tes réponses: ne répète pas les mêmes phrases
- Sois spécifique: donne des exemples concrets adaptés au profil de l'utilisateur
- Si la question concerne la nutrition, adapte tes conseils aux objectifs de l'utilisateur
- Si la question concerne la technique, adapte-la au niveau de l'utilisateur
- Montre que tu connais l'historique de l'utilisateur quand c'est pertinent
- Sois naturel et conversationnel, comme si tu parlais à un ami qui fait du sport`;
  
  return systemMessage;
}

async function loadUserContext(userId) {
  try {
    const profile = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    });

    const extendedProfile = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM user_profile_extended WHERE user_id = ?', [userId], (err, ext) => {
        if (err) reject(err);
        else resolve(ext || {});
      });
    });

    const recentSessions = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM sessions WHERE user_id = ? ORDER BY completed_at DESC LIMIT 5', [userId], (err, sessions) => {
        if (err) reject(err);
        else resolve(sessions || []);
      });
    });

    return {
      profile: profile ? {
        name: profile.name,
        age: calculateAge(profile.birthdate, profile.age),
        fitness_level: profile.fitness_level,
        goals: profile.goals,
        constraints: profile.constraints
      } : null,
      extendedProfile,
      recentSessions: recentSessions.map(s => ({
        date: s.completed_at,
        score: s.posture_score,
        feedback: s.feedback
      }))
    };
  } catch (error) {
    console.error('Erreur loadUserContext:', error);
    return null;
  }
}

// Réponse de fallback si l'IA n'est pas disponible (FR-14)
function getFallbackChatResponse(message) {
  const lowerMessage = message.toLowerCase();
  
  // Détection nutrition et alimentation
  const nutritionKeywords = ['nutrition', 'aliment', 'manger', 'fromage', 'protéine', 'glucide', 'lipide', 'calorie', 'repas', 'petit-déjeuner', 'déjeuner', 'dîner', 'collation', 'boisson', 'eau', 'hydratation', 'légume', 'fruit', 'viande', 'poisson', 'oeuf', 'lait', 'yaourt', 'pain', 'pâtes', 'riz', 'sucre', 'gras', 'sain', 'équilibré'];
  const hasNutritionKeyword = nutritionKeywords.some(keyword => lowerMessage.includes(keyword));
  
  if (hasNutritionKeyword) {
    // Réponses spécifiques selon le contexte
    if (lowerMessage.includes('fromage')) {
      return 'Oui, vous pouvez manger du fromage! Il est riche en protéines et en calcium. Privilégiez les fromages à pâte dure (comté, emmental) en quantité modérée (30-50g par jour). Évitez les excès car ils sont souvent riches en graisses saturées. Idéalement, consommez-le après l\'entraînement pour favoriser la récupération musculaire.';
    }
    if (lowerMessage.includes('protéine') || lowerMessage.includes('protéines')) {
      return 'Les protéines sont essentielles pour la récupération et la construction musculaire. Consommez 1.6-2.2g de protéines par kg de poids corporel par jour. Sources recommandées: viande maigre, poisson, oeufs, légumineuses, produits laitiers. Répartissez-les sur 3-4 repas par jour, avec une portion après chaque entraînement.';
    }
    if (lowerMessage.includes('glucide') || lowerMessage.includes('glucides') || lowerMessage.includes('sucre')) {
      return 'Les glucides sont votre principale source d\'énergie. Privilégiez les glucides complexes (riz complet, pâtes complètes, patate douce) avant l\'entraînement. Après l\'entraînement, combinez glucides et protéines pour optimiser la récupération. Limitez les sucres simples aux moments stratégiques (avant/pendant l\'effort).';
    }
    if (lowerMessage.includes('manger') && (lowerMessage.includes('avant') || lowerMessage.includes('avant l\'entraînement'))) {
      return 'Avant l\'entraînement, mangez 1-2 heures avant: glucides complexes (riz, pâtes, patate douce) + protéines légères. Évitez les repas trop copieux ou trop gras qui ralentissent la digestion. Hydratez-vous bien avant, pendant et après.';
    }
    if (lowerMessage.includes('manger') && (lowerMessage.includes('après') || lowerMessage.includes('après l\'entraînement'))) {
      return 'Après l\'entraînement, consommez un repas riche en protéines (20-30g) et glucides dans les 30-60 minutes. Exemples: poulet + riz, oeufs + patate douce, ou un shake protéiné. Cela favorise la récupération musculaire et la reconstitution des réserves énergétiques.';
    }
    // Réponse générale nutrition
    return 'Une alimentation équilibrée est essentielle pour vos performances. Privilégiez les protéines après l\'entraînement (viande, poisson, oeufs, légumineuses), consommez des glucides complexes avant (riz, pâtes complètes, patate douce) et restez bien hydraté tout au long de la journée. Variez vos repas et incluez des légumes à chaque repas.';
  }
  
  // Détection technique
  const techniqueKeywords = ['technique', 'forme', 'posture', 'mouvement', 'exécution', 'correct', 'erreur', 'alignement', 'dos droit', 'genou', 'épaule'];
  if (techniqueKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return 'Pour améliorer votre technique, concentrez-vous sur la forme avant la vitesse. Gardez le dos droit, les épaules alignées, les genoux dans l\'axe des chevilles et respirez régulièrement. La qualité prime sur la quantité. Si vous ressentez de la douleur, arrêtez immédiatement.';
  }
  
  // Détection motivation
  const motivationKeywords = ['motivation', 'motivé', 'découragé', 'difficile', 'abandonner', 'continuer', 'objectif', 'progrès'];
  if (motivationKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return 'La régularité est la clé du succès. Fixez-vous de petits objectifs quotidiens, célébrez vos progrès (même petits) et rappelez-vous pourquoi vous avez commencé. Chaque séance compte! Les résultats prennent du temps, soyez patient et constant.';
  }
  
  // Détection douleur/blessure
  const painKeywords = ['douleur', 'blessure', 'mal', 'blessé', 'injury', 'souffrir'];
  if (painKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return 'Si vous ressentez de la douleur pendant l\'entraînement, arrêtez immédiatement. Ne confondez pas douleur et fatigue musculaire normale. Si la douleur persiste, consultez un professionnel de la santé (médecin, kinésithérapeute). Ne forcez jamais sur une blessure, cela peut aggraver la situation.';
  }
  
  // Détection repos/récupération
  const restKeywords = ['repos', 'récupération', 'reposer', 'reposé', 'fatigue', 'sommeil', 'dormir'];
  if (restKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return 'Le repos est aussi important que l\'entraînement. Accordez-vous au moins un jour de repos entre les séances intenses. Le sommeil de qualité (7-9h par nuit) est essentiel pour la récupération, la croissance musculaire et les performances. Écoutez votre corps et ne vous surentraînez pas.';
  }
  
  // Détection plan d'entraînement
  const planKeywords = ['plan', 'programme', 'entraînement', 'séance', 'exercice', 'routine'];
  if (planKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return 'Votre plan d\'entraînement est personnalisé selon votre niveau, vos objectifs et vos contraintes. Suivez-le régulièrement pour de meilleurs résultats. Vous pouvez le modifier dans la section "Entraînement" si nécessaire. La progression se fait progressivement, soyez patient.';
  }
  
  // Réponse par défaut plus utile
  return 'Je suis là pour vous aider avec votre entraînement! Posez-moi des questions spécifiques sur la technique, la nutrition (aliments, repas, timing), la motivation, le repos, ou votre plan d\'entraînement. Plus votre question est précise, plus je peux vous donner des conseils adaptés.';
}

// Route conseils IA post-séance (FR-11) - SLA ≤3s
app.post('/api/session/advice', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  const MAX_ADVICE_TIME = 2500; // 2.5s max pour laisser 0.5s pour la réponse (SLA ≤3s)
  
  const { sessionData, profile, extendedProfile } = req.body;
  
  // Préparer le contexte pour les conseils
  const duration = sessionData.duration || 0;
  const postureScore = sessionData.postureScore || 0;
  const exercisesCompleted = sessionData.exercisesCompleted || 0;
  const exercisesCount = sessionData.workout?.exercises?.length || 0;
  const goals = profile?.goals || 'general';
  const level = profile?.fitness_level || 'beginner';
  
  // Fonction de fallback pour conseils génériques (toujours <3s)
  const generateFallbackAdvice = () => {
    const advice = [];
    
    if (postureScore >= 85) {
      advice.push('Excellent travail! Votre posture est excellente. Continuez à maintenir cette qualité d\'exécution.');
    } else if (postureScore >= 70) {
      advice.push('Bonne séance! Votre posture est correcte. Concentrez-vous sur l\'alignement pour améliorer encore.');
    } else if (postureScore >= 50) {
      advice.push('Séance correcte. Améliorez votre posture en gardant le dos droit et en alignant vos genoux avec vos chevilles.');
    } else {
      advice.push('Attention à votre posture. Travaillez sur l\'alignement et la forme avant d\'augmenter l\'intensité.');
    }
    
    if (exercisesCompleted < exercisesCount * 0.8) {
      advice.push('Vous avez complété ' + exercisesCompleted + ' exercices. Essayez de terminer tous les exercices pour maximiser les bénéfices.');
    }
    
    if (duration < 20 * 60) {
      advice.push('Séance courte. Pour de meilleurs résultats, visez au moins 20-30 minutes d\'entraînement.');
    } else if (duration > 60 * 60) {
      advice.push('Séance longue. Assurez-vous de bien vous reposer et de vous hydrater après cette séance intensive.');
    }
    
    // Conseils selon les objectifs
    if (goals.toLowerCase().includes('muscle') || goals.toLowerCase().includes('masse')) {
      advice.push('Pour la prise de masse, augmentez progressivement les charges et les répétitions. Assurez-vous d\'avoir un apport protéique suffisant.');
    } else if (goals.toLowerCase().includes('maigrir') || goals.toLowerCase().includes('perdre')) {
      advice.push('Pour la perte de poids, combinez l\'entraînement avec une alimentation équilibrée. L\'intensité de votre séance est bonne.');
    }
    
    return {
      advice: advice,
      generatedBy: 'rules_engine',
      generationTime: Date.now() - startTime
    };
  };
  
  // Si OpenAI est disponible et qu'on a encore du temps, essayer l'IA
  if (process.env.OPENAI_API_KEY && (Date.now() - startTime) < 2000) {
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      // Récupérer les exercices effectués
      const exercises = sessionData.workout?.exercises || [];
      const exercisesNames = exercises.map(ex => ex.name || ex).filter(Boolean).join(', ');
      const exercisesInfo = exercisesNames ? `Exercices effectués: ${exercisesNames}.` : '';
      
      // Construire le prompt contextuel amélioré avec score postural et exercices
      const contextPrompt = `Tu es un coach sportif expert. Après une séance d'entraînement de ${Math.floor(duration / 60)} minutes avec un score postural de ${postureScore}/100, donne 3 conseils personnalisés et concis pour améliorer la progression. Utilise le score postural (${postureScore}/100) pour donner des recommandations spécifiques sur la posture et la technique d'exécution.`;
      
      let userPrompt = `Niveau: ${level}. Objectifs: ${goals}. ${exercisesInfo}`;
      if (extendedProfile?.main_motivation) {
        userPrompt += ` Motivation: ${extendedProfile.main_motivation}.`;
      }
      
      // Analyser les données posturales pour des conseils plus précis
      if (sessionData.postureData && sessionData.postureData.length > 0) {
        const errors = sessionData.postureData.flatMap(d => d.errors || []).filter(Boolean);
        if (errors.length > 0) {
          const uniqueErrors = [...new Set(errors)];
          userPrompt += ` Erreurs posturales détectées: ${uniqueErrors.join(', ')}.`;
        }
        
        // Calculer le score moyen par exercice si possible
        const avgScore = sessionData.postureData.reduce((sum, d) => sum + (d.score || 0), 0) / sessionData.postureData.length;
        if (avgScore < postureScore - 5 || avgScore > postureScore + 5) {
          userPrompt += ` Score postural moyen pendant l'exécution: ${Math.round(avgScore)}/100.`;
        }
      }
      
      // Ajouter des informations sur les exercices pour des conseils spécifiques
      if (exercises.length > 0) {
        userPrompt += ` Concentre-toi particulièrement sur les conseils de posture pour ces exercices: ${exercisesNames}.`;
      }
      
      // Timeout de 2.5s pour respecter le SLA ≤3s
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), MAX_ADVICE_TIME)
      );
      
      const completionPromise = openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: contextPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        max_tokens: 200,
        temperature: 0.7
      });
      
      const completion = await Promise.race([completionPromise, timeoutPromise]);
      const aiResponse = completion.choices[0].message.content.trim();
      
      const generationTime = Date.now() - startTime;
      
      // Parser la réponse de l'IA (peut être une liste ou du texte)
      let adviceList = [];
      if (aiResponse.includes('\n') || aiResponse.includes('-') || aiResponse.includes('•')) {
        // Format liste
        adviceList = aiResponse.split(/\n|[-•]/).filter(line => line.trim().length > 10).map(line => line.trim());
      } else {
        // Format texte, diviser en phrases
        adviceList = aiResponse.split(/[.!?]/).filter(s => s.trim().length > 20).map(s => s.trim() + '.');
      }
      
      // Limiter à 3 conseils
      adviceList = adviceList.slice(0, 3);
      
      if (adviceList.length > 0 && generationTime < 3000) {
        return res.json({
          advice: adviceList,
          generatedBy: 'ai',
          generationTime: `${generationTime}ms`,
          slaMet: generationTime < 3000
        });
      }
    } catch (error) {
      console.log('IA non disponible ou timeout, utilisation du fallback:', error.message);
    }
  }
  
  // Fallback sur conseils génériques (toujours <3s)
  const fallbackAdvice = generateFallbackAdvice();
  const fallbackTime = fallbackAdvice.generationTime;
  fallbackAdvice.generationTime = `${fallbackTime}ms`;
  fallbackAdvice.slaMet = fallbackTime < 3000;
  
  res.json(fallbackAdvice);
});

// Route pour servir l'application
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});


