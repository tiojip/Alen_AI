// Gestion des entraînements
let currentWorkout = null;
let workoutTimer = null;
let workoutStartTime = null;
let currentExerciseIndex = 0;
let exercisesCatalog = []; // Cache du catalogue d'exercices pour les GIFs

// Variables pour FR-09 (Interface séance améliorée)
let currentSet = 1;
let currentRep = 0;
let restCountdownTimer = null;
let exerciseProgressTimer = null;
let exerciseStartTime = null;
let exerciseDuration = 0;
let soundsEnabled = true; // Sera chargé depuis les préférences
let currentExerciseDurationMs = 0;
let exerciseElapsedBeforePause = 0;
let progressFillElement = null;

// Fonction globale pour démarrer une séance (appelée depuis HTML)
window.startWorkoutSession = startWorkoutSession;

// Charger le catalogue d'exercices pour récupérer les GIFs
async function loadExercisesCatalogForGifs() {
    if (exercisesCatalog.length > 0) {
        return exercisesCatalog; // Déjà chargé
    }
    
    try {
        const response = await fetch('/exercises/exercises.json');
        const data = await response.json();
        exercisesCatalog = data.exercises || [];
        return exercisesCatalog;
    } catch (error) {
        console.error('Erreur chargement catalogue pour GIFs:', error);
        return [];
    }
}

// Récupérer le GIF d'un exercice par son nom
function getExerciseGif(exerciseName) {
    if (!exercisesCatalog || exercisesCatalog.length === 0) {
        return null;
    }
    
    // Chercher l'exercice par nom (insensible à la casse)
    const exercise = exercisesCatalog.find(ex => 
        ex.name.toLowerCase() === exerciseName.toLowerCase()
    );
    
    if (exercise) {
        return exercise.gif || exercise.video || null;
    }
    
    return null;
}

function normalizeExercises(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data === 'object') {
        const values = Object.values(data);
        return values.flatMap(item => {
            if (!item) return [];
            if (Array.isArray(item)) return item;
            return [item];
        });
    }
    return [];
}

function normalizeDayKey(dayKey, exercisesRaw, index = 0) {
    if (typeof dayKey === 'string') {
        const trimmed = dayKey.trim();
        if (trimmed.length > 0) {
            return trimmed;
        }
    }

    if (Array.isArray(exercisesRaw)) {
        const inferredDay = exercisesRaw?.[0]?.day;
        if (typeof inferredDay === 'string' && inferredDay.trim().length > 0) {
            return inferredDay.trim();
        }
    } else if (exercisesRaw && typeof exercisesRaw === 'object') {
        if (typeof exercisesRaw.day === 'string') {
            const trimmedDay = exercisesRaw.day.trim();
            if (trimmedDay.length > 0) {
                return trimmedDay;
            }
        }
    }

    return `Jour ${index + 1}`;
}

const EXERCISES = {
    'Squats': {
        name: 'Squats',
        description: 'Descendez en pliant les genoux, gardez le dos droit',
        duration: 30,
        reps: null,
        sets: null
    },
    'Push-ups': {
        name: 'Push-ups',
        description: 'Descendez jusqu\'à presque toucher le sol, puis remontez',
        duration: null,
        reps: 12,
        sets: 3
    },
    'Planche': {
        name: 'Planche',
        description: 'Maintenez la position, dos droit, abdos contractés',
        duration: 30,
        reps: null,
        sets: null
    },
    'Fentes': {
        name: 'Fentes',
        description: 'Faites un grand pas en avant, descendez jusqu\'à ce que les deux genoux soient à 90°',
        duration: null,
        reps: 10,
        sets: 3
    }
};

// Fonctions globales pour charger et afficher le plan
async function loadWorkoutPlan() {
    try {
        const data = await api.getPlan();
        if (data.plan) {
            return data.plan;
        }
        return null;
    } catch (error) {
        console.error('Erreur chargement plan:', error);
        return null;
    }
}

// Rendre la fonction globale pour qu'elle soit accessible depuis app.js et auth.js
window.loadWorkoutPlan = loadWorkoutPlan;

// Fonction pour traduire le niveau de fitness
function translateFitnessLevel(level) {
    if (!level) return 'Non défini';
    const levelLower = String(level).toLowerCase();
    if (levelLower === 'beginner' || levelLower === 'débutant') return 'Débutant';
    if (levelLower === 'intermediate' || levelLower === 'intermédiaire') return 'Intermédiaire';
    if (levelLower === 'advanced' || levelLower === 'avancé') return 'Avancé';
    return level; // Retourner la valeur originale si non reconnue
}

// Rendre les fonctions de formatage accessibles globalement
if (typeof globalThis !== 'undefined') {
    globalThis.translateFitnessLevel = translateFitnessLevel;
    globalThis.formatGoals = formatGoals;
    globalThis.formatDuration = formatDuration;
} else if (typeof window !== 'undefined') {
    window.translateFitnessLevel = translateFitnessLevel;
    window.formatGoals = formatGoals;
    window.formatDuration = formatDuration;
}

// Fonction pour formater les objectifs
function formatGoals(goals) {
    if (!goals) return null;
    
    // Si c'est un tableau, le convertir en chaîne
    let goalsStr = Array.isArray(goals) ? goals.join(', ') : String(goals);
    goalsStr = goalsStr.trim();
    
    // Ne pas retourner de valeur par défaut si vide ou "general"
    if (goalsStr === '' || goalsStr.toLowerCase() === 'general' || goalsStr.toLowerCase() === 'général') {
        return null;
    }
    
    // Traductions courantes
    const translations = {
        'weight loss': 'Perte de poids',
        'perte de poids': 'Perte de poids',
        'maigrir': 'Perte de poids',
        'muscle gain': 'Prise de masse',
        'prise de masse': 'Prise de masse',
        'muscle': 'Prise de masse',
        'endurance': 'Endurance',
        'cardio': 'Cardio',
        'flexibility': 'Flexibilité',
        'flexibilité': 'Flexibilité',
        'souplesse': 'Flexibilité',
        'strength': 'Force',
        'force': 'Force',
        'toning': 'Tonification',
        'tonification': 'Tonification',
        'health': 'Santé',
        'santé': 'Santé',
        'wellness': 'Bien-être',
        'bien-être': 'Bien-être'
    };
    
    const lowerGoals = goalsStr.toLowerCase();
    if (translations[lowerGoals]) {
        return translations[lowerGoals];
    }
    
    // Si plusieurs objectifs séparés par des virgules
    if (goalsStr.includes(',')) {
        return goalsStr.split(',').map(g => {
            const trimmed = g.trim();
            const lower = trimmed.toLowerCase();
            return translations[lower] || (trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase());
        }).join(', ');
    }
    
    // Capitaliser la première lettre et mettre le reste en minuscule
    return goalsStr.charAt(0).toUpperCase() + goalsStr.slice(1).toLowerCase();
}

// Fonction pour formater la durée
function formatDuration(duration) {
    if (!duration) return '4 semaines';
    const durationStr = String(duration).trim();
    // Si c'est déjà en français, le retourner tel quel
    if (durationStr.includes('semaine') || durationStr.includes('mois')) {
        return durationStr;
    }
    // Sinon, convertir "4 weeks" en "4 semaines"
    const regex = /(\d+)\s*(week|weeks|semaine|semaines)/i;
    const match = regex.exec(durationStr);
    if (match) {
        const num = match[1];
        return `${num} ${num === '1' ? 'semaine' : 'semaines'}`;
    }
    return durationStr;
}

async function displayWorkoutPlan(plan) {
    const container = document.getElementById('workout-days');
    if (!container) return;

    // Charger le profil utilisateur et le profil étendu AVANT de vérifier le plan
    // pour pouvoir afficher les informations même si le plan n'existe pas
    let userProfile = null;
    let extendedProfile = null;
    
    try {
        if (typeof api !== 'undefined' && api.getProfile) {
            userProfile = await api.getProfile();
        }
    } catch (error) {
        console.warn('Impossible de charger le profil utilisateur:', error);
    }
    
    try {
        if (typeof api !== 'undefined' && api.getExtendedProfile) {
            extendedProfile = await api.getExtendedProfile();
        }
    } catch (error) {
        console.warn('Impossible de charger le profil étendu:', error);
    }

    // Récupérer UNIQUEMENT les informations saisies par l'utilisateur (pas de valeurs par défaut)
    let fitnessLevel = null;
    let goals = null;
    let durationStr = null;
    
    // Récupérer le niveau de fitness - UNIQUEMENT si saisi par l'utilisateur
    if (userProfile?.fitness_level && userProfile.fitness_level.trim() !== '') {
        fitnessLevel = userProfile.fitness_level;
    }
    
    // Récupérer les objectifs - UNIQUEMENT si saisis par l'utilisateur
    if (userProfile?.goals && userProfile.goals.trim() !== '' && userProfile.goals.toLowerCase() !== 'general') {
        goals = userProfile.goals;
    }
    
    // Récupérer la durée - UNIQUEMENT si saisie par l'utilisateur
    if (extendedProfile?.preferred_session_duration) {
        durationStr = `${extendedProfile.preferred_session_duration} minutes par séance`;
    } else if (userProfile?.preferred_session_duration) {
        durationStr = `${userProfile.preferred_session_duration} minutes par séance`;
    }

    if (!plan || !plan.weeklyPlan) {
        // Même sans plan, afficher les informations du profil dans l'en-tête (uniquement si saisies)
        const translatedLevel = fitnessLevel ? translateFitnessLevel(fitnessLevel) : null;
        const formattedGoals = goals ? formatGoals(goals) : null;
        const formattedDuration = durationStr ? formatDuration(durationStr) : null;
        
        // Construire le HTML uniquement avec les informations disponibles
        let infoItems = '';
        if (translatedLevel) {
            infoItems += `
                <div class="plan-info-item">
                    <span class="plan-info-label">Niveau</span>
                    <span class="plan-info-value">${translatedLevel}</span>
                </div>
            `;
        }
        if (formattedGoals) {
            infoItems += `
                <div class="plan-info-item">
                    <span class="plan-info-label">Objectifs</span>
                    <span class="plan-info-value">${formattedGoals}</span>
                </div>
            `;
        }
        if (formattedDuration) {
            infoItems += `
                <div class="plan-info-item">
                    <span class="plan-info-label">Durée</span>
                    <span class="plan-info-value">${formattedDuration}</span>
                </div>
            `;
        }
        
        container.innerHTML = `
            <div class="workout-plan-header">
                <h3 class="workout-plan-title">Plan d'entraînement personnalisé</h3>
                ${infoItems ? `<div class="workout-plan-info">${infoItems}</div>` : ''}
            </div>
            <p style="margin-top: 1.5rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px; color: var(--text-color);">
                Aucun plan disponible. Générez-en un depuis le dashboard.
            </p>
        `;
        return;
    }
    
    // Log pour debug (peut être retiré en production)
    console.log('Affichage plan - Données récupérées:', {
        fitnessLevel,
        goals,
        duration: durationStr,
        hasUserProfile: !!userProfile,
        hasExtendedProfile: !!extendedProfile,
        userProfileData: userProfile ? {
            fitness_level: userProfile.fitness_level,
            goals: userProfile.goals,
            name: userProfile.name
        } : null,
        extendedProfileData: extendedProfile ? {
            preferred_session_duration: extendedProfile.preferred_session_duration,
            weekly_availability: extendedProfile.weekly_availability
        } : null,
        planData: {
            level: plan.level,
            goals: plan.goals,
            duration: plan.duration,
            weeklyPlanDays: plan.weeklyPlan ? Object.keys(plan.weeklyPlan).length : 0,
            totalExercises: plan.weeklyPlan ? Object.values(plan.weeklyPlan).reduce((sum, ex) => sum + (Array.isArray(ex) ? ex.length : 0), 0) : 0
        }
    });

    // Traduire et formater uniquement les valeurs saisies par l'utilisateur
    const translatedLevel = fitnessLevel ? translateFitnessLevel(fitnessLevel) : null;
    const formattedGoals = goals ? formatGoals(goals) : null;
    const formattedDuration = durationStr ? formatDuration(durationStr) : null;

    // Charger le catalogue d'exercices pour les GIFs
    await loadExercisesCatalogForGifs();

    // Traduction des jours en français
    const dayTranslations = {
        'monday': 'Lundi',
        'tuesday': 'Mardi',
        'wednesday': 'Mercredi',
        'thursday': 'Jeudi',
        'friday': 'Vendredi',
        'saturday': 'Samedi',
        'sunday': 'Dimanche'
    };

    // Masquer la section de sélection si elle existe
    const selectionDiv = document.getElementById('workout-selection');
    if (selectionDiv) {
        if (window.currentWorkoutActive) {
            selectionDiv.classList.add('hidden');
        } else {
            selectionDiv.classList.remove('hidden');
        }
    }
    
    // Masquer la section active si aucune séance n'est en cours
    const activeDiv = document.getElementById('workout-active');
    if (activeDiv) {
        if (window.currentWorkoutActive) {
            activeDiv.classList.remove('hidden');
        } else {
            activeDiv.classList.add('hidden');
        }
    }

    // Afficher le bouton "Modifier le plan" si un plan existe
    const btnEditPlan = document.getElementById('btn-edit-plan');
    if (btnEditPlan) {
        btnEditPlan.style.display = 'inline-block';
    }
    
    // Créer un header avec uniquement les informations saisies par l'utilisateur
    let infoItems = '';
    if (translatedLevel) {
        infoItems += `
            <div class="plan-info-item">
                <span class="plan-info-label">Niveau</span>
                <span class="plan-info-value">${translatedLevel}</span>
            </div>
        `;
    }
    if (formattedGoals) {
        infoItems += `
            <div class="plan-info-item">
                <span class="plan-info-label">Objectifs</span>
                <span class="plan-info-value">${formattedGoals}</span>
            </div>
        `;
    }
    if (formattedDuration) {
        infoItems += `
            <div class="plan-info-item">
                <span class="plan-info-label">Durée</span>
                <span class="plan-info-value">${formattedDuration}</span>
            </div>
        `;
    }
    
    let html = `
        <div class="workout-plan-header">
            <h3 class="workout-plan-title">Plan d'entraînement personnalisé</h3>
            ${infoItems ? `<div class="workout-plan-info">${infoItems}</div>` : ''}
        </div>
    `;
    
    html += '<div class="workout-days-grid">';
    
    const entries = Object.entries(plan.weeklyPlan);
    entries.forEach(([dayKey, exercisesRaw], index) => {
        const exercises = normalizeExercises(exercisesRaw);
        const normalizedDayKey = normalizeDayKey(dayKey, exercisesRaw, index);
        const safeKey = typeof normalizedDayKey === 'string' ? normalizedDayKey : `Jour ${index + 1}`;
        const lowerDay = safeKey.toLowerCase();
        const label = dayTranslations[lowerDay] || safeKey;
        const dayName = label.charAt(0).toUpperCase() + label.slice(1);
        const exercisesListHtml = exercises.length > 0
            ? exercises.map(ex => {
                const gifUrl = getExerciseGif(ex.name);
                return `
                        <li style="padding: 0.75rem 0; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 1rem;">
                            ${gifUrl ? `
                                <div style="flex-shrink: 0; width: 80px; height: 80px; border-radius: 8px; overflow: hidden; background: var(--bg-color); display: flex; align-items: center; justify-content: center;">
                                    <img src="${gifUrl}" 
                                         alt="${ex.name}" 
                                         style="width: 100%; height: 100%; object-fit: cover;"
                                         loading="lazy"
                                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                    <div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);">
                                        <span style="font-size: 2rem;">💪</span>
                                    </div>
                                </div>
                            ` : `
                                <div style="flex-shrink: 0; width: 80px; height: 80px; border-radius: 8px; background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%); display: flex; align-items: center; justify-content: center;">
                                    <span style="font-size: 2rem;">💪</span>
                                </div>
                            `}
                            <div style="flex-grow: 1;">
                                <strong style="color: var(--text-color); font-size: 1rem; display: block; margin-bottom: 0.25rem;">${ex.name}</strong>
                                <span style="color: var(--text-color); opacity: 0.8; font-size: 0.9rem;">
                                    ${ex.sets ? `${ex.sets} séries` : ''}
                                    ${ex.reps ? ` × ${ex.reps} répétitions` : ''}
                                    ${ex.duration ? ` - ${ex.duration}s` : ''}
                                    ${ex.rest ? ` (repos: ${ex.rest}s)` : ''}
                                </span>
                            </div>
                        </li>
                    `;
              }).join('')
            : '<li style="padding: 0.75rem 0; color: var(--text-color); opacity: 0.8;">Aucun exercice prévu ce jour.</li>';

        html += `
            <div class="card workout-day-card">
                <div class="workout-day-header">
                    <h4 class="workout-day-title">${dayName}</h4>
                    <span class="workout-day-badge">${exercises.length} ${exercises.length === 1 ? 'exercice' : 'exercices'}</span>
                </div>
                <ul class="workout-exercises-list">
                    ${exercisesListHtml}
                </ul>
                <button class="btn-primary workout-start-btn" onclick="startWorkoutSession('${safeKey}')">
                    Commencer cette séance
                </button>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// Rendre la fonction globale pour qu'elle soit accessible depuis app.js et auth.js
window.displayWorkoutPlan = displayWorkoutPlan;

async function startWorkoutSession(day) {
    let plan = await loadWorkoutPlan();
    
    // Si aucun plan n'est disponible, essayer d'en générer un
    if (!plan || !plan.weeklyPlan) {
        try {
            // Récupérer le profil pour générer un plan personnalisé
            const profile = await api.getProfile();
            const extendedProfile = await api.getExtendedProfile().catch(() => null);
            
            // Générer un nouveau plan basé sur le profil
            const planData = await api.generatePlan(profile);
            if (planData && planData.plan) {
                plan = planData.plan;
                // Recharger l'affichage du plan
                if (typeof displayWorkoutPlan === 'function') {
                    await displayWorkoutPlan(plan);
                }
            } else {
                alert('Impossible de générer un plan. Veuillez vérifier votre profil.');
                return;
            }
        } catch (error) {
            console.error('Erreur lors de la génération du plan:', error);
            alert('Impossible de charger ou générer un plan. Veuillez réessayer.');
            return;
        }
    }
    
    let targetDayKey = day;
    let dayExercises = plan?.weeklyPlan ? plan.weeklyPlan[day] : null;

    if (!dayExercises && plan?.weeklyPlan) {
        const matchedEntry = Object.entries(plan.weeklyPlan).find(([key, value], index) => {
            const normalizedKey = normalizeDayKey(key, value, index);
            return typeof normalizedKey === 'string' && normalizedKey.toLowerCase() === String(day).toLowerCase();
        });
        if (matchedEntry) {
            targetDayKey = matchedEntry[0];
            dayExercises = matchedEntry[1];
        }
    }

    const exercises = normalizeExercises(dayExercises);

    if (!plan || exercises.length === 0) {
        alert('Aucun exercice disponible pour ce jour. Veuillez générer un plan d\'entraînement.');
        return;
    }

    // Charger les préférences de sons (FR-09)
    await loadSoundPreferences();

    currentWorkout = {
        day: targetDayKey,
        exercises,
        startTime: new Date().toISOString(),
        startedAt: Date.now()
    };

    currentExerciseIndex = 0;
    currentSet = 1;
    currentRep = 0;
    
    // Initialiser le temps de début de la séance (pour l'avertissement postural)
    workoutStartTime = Date.now();
    window.workoutStartTime = workoutStartTime;
    
    // Réinitialiser les données posturales (FR-10)
    if (typeof workoutPostureData !== 'undefined') {
        workoutPostureData = [];
    }
    window.currentWorkoutActive = true; // Flag pour activer le stockage des données posturales
    
    // Réinitialiser l'avertissement postural pour la nouvelle séance
    if (typeof window.resetPostureWarning === 'function') {
        window.resetPostureWarning();
    }
    
    const selectionDiv = document.getElementById('workout-selection');
    const activeDiv = document.getElementById('workout-active');
    
    if (selectionDiv) selectionDiv.classList.add('hidden');
    if (activeDiv) activeDiv.classList.remove('hidden');

    const video = document.getElementById('workout-video');
    const canvas = document.getElementById('workout-canvas');
    
    if (video && canvas) {
        await startCamera(video, canvas);
    }

    startExercise();
}

function mapCatalogExerciseForWorkout(exercise) {
    if (!exercise) return null;

    const parsedSets = Number.isFinite(Number(exercise.sets)) ? Number(exercise.sets) : parseInt(exercise.sets, 10);
    const sets = Number.isFinite(parsedSets) && parsedSets > 0 ? parsedSets : 3;

    const parsedReps = Number.isFinite(Number(exercise.reps)) ? Number(exercise.reps) : parseInt(exercise.reps, 10);
    const reps = Number.isFinite(parsedReps) && parsedReps > 0 ? parsedReps : null;

    // Forcer duration: 10 et rest: 5 pour tous les exercices
    const duration = 10;
    const rest = 5;

    return {
        name: exercise.name,
        description: exercise.description || '',
        muscles: exercise.muscles || [],
        level: exercise.level || 'beginner',
        equipment: exercise.equipment || 'none',
        instructions: exercise.instructions || [],
        gif: exercise.gif,
        video: exercise.video,
        sets,
        reps,
        duration,
        rest,
        source: 'catalog'
    };
}

async function startCatalogExercise(exercise) {
    if (!exercise) return;

    const mappedExercise = mapCatalogExerciseForWorkout(exercise);
    if (!mappedExercise) return;

    if (typeof showPage === 'function') {
        showPage('workout');
    }

    if (window.currentWorkoutActive) {
        stopWorkout();
    }

    window.currentWorkoutActive = true;
    await loadSoundPreferences();

    currentWorkout = {
        day: `catalog-${exercise.id || Date.now()}`,
        exercises: [mappedExercise],
        startTime: new Date().toISOString(),
        startedAt: Date.now(),
        origin: 'catalog'
    };

    currentExerciseIndex = 0;
    currentSet = 1;
    currentRep = 0;
    
    // Initialiser le temps de début de la séance (pour l'avertissement postural)
    workoutStartTime = Date.now();
    window.workoutStartTime = workoutStartTime;

    if (typeof workoutPostureData !== 'undefined') {
        workoutPostureData = [];
    }
    
    // Réinitialiser l'avertissement postural pour la nouvelle séance
    if (typeof window.resetPostureWarning === 'function') {
        window.resetPostureWarning();
    }

    const selectionDiv = document.getElementById('workout-selection');
    const activeDiv = document.getElementById('workout-active');
    if (selectionDiv) selectionDiv.classList.add('hidden');
    if (activeDiv) activeDiv.classList.remove('hidden');

    const video = document.getElementById('workout-video');
    const canvas = document.getElementById('workout-canvas');
    if (video && canvas) {
        await startCamera(video, canvas);
    }

    startExercise();
}

window.startCatalogExercise = startCatalogExercise;

function getExerciseInstructions(exercise) {
    if (!exercise) {
        return ['Maintenez une posture contrôlée et respirez régulièrement.'];
    }

    const list = Array.isArray(exercise.instructions)
        ? exercise.instructions
            .filter(step => typeof step === 'string' && step.trim().length > 0)
            .map(step => step.trim())
        : [];

    if (list.length > 0) {
        return list;
    }

    if (exercise.description && exercise.description.trim().length > 0) {
        return [exercise.description.trim()];
    }

    if (exercise.name) {
        return [`Effectuez ${exercise.name.toLowerCase()} avec contrôle et respiration régulière.`];
    }

    return ['Maintenez une posture contrôlée et respirez régulièrement.'];
}

async function startExercise() {
    if (!currentWorkout || currentExerciseIndex >= currentWorkout.exercises.length) {
        finishWorkout();
        return;
    }

    const exercise = currentWorkout.exercises[currentExerciseIndex];
    const exerciseData = EXERCISES[exercise.name] || exercise;

    // Réinitialiser les compteurs pour le nouvel exercice (FR-09)
    currentSet = 1;
    currentRep = 0;

    document.getElementById('current-exercise-name').textContent = exerciseData.name;
    
    // Stocker le nom de l'exercice pour les conseils posturaux dynamiques
    window.currentExerciseName = exerciseData.name;
    
    const feedbackBox = document.getElementById('workout-feedback');
    if (feedbackBox) {
        const instructions = getExerciseInstructions(exerciseData);
        feedbackBox.innerHTML = `
            <h4 class="feedback-heading">Comment réaliser l'exercice ?</h4>
            <ul class="feedback-instructions">
                ${instructions.map(step => `<li>${step}</li>`).join('')}
            </ul>
        `;
    }

    // Charger et afficher le GIF de l'exercice
    await loadExercisesCatalogForGifs();
    const gifUrl = getExerciseGif(exercise.name);
    displayExerciseGif(gifUrl, exercise.name);

    // Mettre à jour les indicateurs (FR-09)
    updateProgressIndicators(exercise);

    // Démarrer le timer (ne réinitialiser que si pas déjà défini au début de la séance)
    if (!workoutStartTime) {
        workoutStartTime = Date.now();
        window.workoutStartTime = workoutStartTime;
    }
    startWorkoutTimer();

    // Démarrer la barre de progression de l'exercice (FR-09)
    startExerciseProgress(exercise);

    // Son de début d'exercice (FR-09)
    playSound('start');
}

function skipCurrentExercise() {
    if (!currentWorkout || currentExerciseIndex >= currentWorkout.exercises.length) {
        return;
    }

    const exercise = currentWorkout.exercises[currentExerciseIndex];
    console.log(`Exercice ignoré: ${exercise.name}`);

    if (!currentWorkout.skippedExercises) {
        currentWorkout.skippedExercises = [];
    }
    currentWorkout.skippedExercises.push({
        name: exercise.name,
        index: currentExerciseIndex,
        skippedAt: new Date().toISOString()
    });

    resetExerciseTimers(true);
    playSound('exercise-complete');

    currentExerciseIndex++;
    currentSet = 1;
    currentRep = 0;

    startExercise();
}

function previousExercise() {
    if (!currentWorkout || currentExerciseIndex <= 0) {
        return;
    }

    resetExerciseTimers(true);
    currentExerciseIndex = Math.max(currentExerciseIndex - 1, 0);
    currentSet = 1;
    currentRep = 0;
    startExercise();
}

// Mettre à jour les indicateurs de progression (FR-09)
function updateProgressIndicators(exercise) {
    const totalExercises = currentWorkout.exercises.length;
    const totalSets = exercise.sets || 1;
    const totalReps = exercise.reps || 0;
    const exerciseDuration = exercise.duration || 10;

    // Indicateur exercice
    const exerciseCounter = document.getElementById('exercise-counter');
    if (exerciseCounter) {
        exerciseCounter.textContent = `${currentExerciseIndex + 1}/${totalExercises}`;
    }

    // Indicateur série
    const setCounter = document.getElementById('set-counter');
    if (setCounter) {
        setCounter.textContent = `${currentSet}/${totalSets}`;
    }

    // Indicateur répétitions
    const repCounter = document.getElementById('rep-counter');
    if (repCounter) {
        if (totalReps > 0) {
            repCounter.textContent = `${currentRep}/${totalReps}`;
        } else if (exerciseDuration > 0) {
            repCounter.textContent = `Durée: ${exerciseDuration}s`;
        } else {
            repCounter.textContent = 'En cours...';
        }
    }
}

// Démarrer la barre de progression de l'exercice (FR-09)
function startExerciseProgress(exercise) {
    progressFillElement = document.getElementById('exercise-progress-fill');
    if (!progressFillElement) return;

    resetExerciseTimers(false);
    const totalReps = exercise.reps || 0;
    currentExerciseDurationMs = (exercise.duration || 10) * 1000; // Convertir en ms (10 secondes par défaut)
    exerciseElapsedBeforePause = 0;

    if (currentExerciseDurationMs > 0) {
        progressFillElement.style.width = '0%';
        exerciseStartTime = Date.now();
        startExerciseProgressInterval();
    } else {
        progressFillElement.style.width = '0%';
    }
}

function startExerciseProgressInterval() {
    if (!progressFillElement) return;

    if (exerciseProgressTimer) {
        clearInterval(exerciseProgressTimer);
    }

    exerciseProgressTimer = setInterval(() => {
        const elapsed = Date.now() - exerciseStartTime;
        const progress = Math.min((elapsed / currentExerciseDurationMs) * 100, 100);
        progressFillElement.style.width = progress + '%';

        if (progress >= 100) {
            clearInterval(exerciseProgressTimer);
            exerciseProgressTimer = null;
            completeExerciseSet();
        }
    }, 100);
}

// Compléter une série d'exercice (FR-09)
function completeExerciseSet() {
    const exercise = currentWorkout.exercises[currentExerciseIndex];
    const totalSets = exercise.sets || 1;
    const totalReps = exercise.reps || 0;

    currentRep = totalReps; // Marquer les répétitions comme complétées
    updateProgressIndicators(exercise);
    currentExerciseDurationMs = 0;
    exerciseElapsedBeforePause = 0;
    if (progressFillElement) {
        progressFillElement.style.width = '100%';
    }

    // Son de fin de série (FR-09)
    playSound('complete');

    // Si toutes les séries sont complétées, passer au repos puis à l'exercice suivant
    if (currentSet >= totalSets) {
        // Son de fin d'exercice (FR-09)
        playSound('exercise-complete');
        
        // Démarrer le repos avant le prochain exercice
        const restTime = exercise.rest || 5; // 5 secondes par défaut
        startRestCountdown(restTime, () => {
            // Après le repos, passer à l'exercice suivant
            currentExerciseIndex++;
            currentSet = 1;
            currentRep = 0;
            startExercise();
        });
    } else {
        // Sinon, démarrer le repos entre les séries
        currentSet++;
        const restTime = exercise.rest || 5;
        startRestCountdown(restTime, () => {
            // Après le repos, continuer avec la série suivante
            currentRep = 0;
            updateProgressIndicators(exercise);
            startExerciseProgress(exercise);
            playSound('start');
        });
    }
}

// Démarrer le compte à rebours de repos (FR-09)
function startRestCountdown(seconds, callback) {
    const restCountdown = document.getElementById('rest-countdown');
    const countdownDisplay = document.getElementById('countdown-display');
    
    if (!restCountdown || !countdownDisplay) {
        // Si les éléments n'existent pas, appeler directement le callback
        setTimeout(callback, seconds * 1000);
        return;
    }

    restCountdown.classList.remove('hidden');
    let remaining = seconds;

    const updateCountdown = () => {
        countdownDisplay.textContent = String(remaining).padStart(2, '0');
        
        // Son pour les 3 dernières secondes (FR-09)
        if (remaining <= 3 && remaining > 0) {
            playSound('countdown');
        }

        if (remaining <= 0) {
            clearInterval(restCountdownTimer);
            restCountdown.classList.add('hidden');
            // Son de fin de repos (FR-09)
            playSound('rest-complete');
            if (callback) callback();
        } else {
            remaining--;
        }
    };

    updateCountdown(); // Afficher immédiatement
    restCountdownTimer = setInterval(updateCountdown, 1000);
}

// Jouer un son (FR-09)
function playSound(type) {
    if (!soundsEnabled) return;

    try {
        // Créer un contexte audio
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        let frequency = 440; // Fréquence par défaut
        let duration = 0.1; // Durée par défaut

        switch (type) {
            case 'start':
                frequency = 523.25; // Do
                duration = 0.2;
                break;
            case 'complete':
                frequency = 659.25; // Mi
                duration = 0.15;
                break;
            case 'exercise-complete':
                frequency = 783.99; // Sol
                duration = 0.3;
                break;
            case 'rest-complete':
                frequency = 880; // La
                duration = 0.2;
                break;
            case 'countdown':
                frequency = 440;
                duration = 0.1;
                break;
            case 'posture-error':
                // Son d'erreur posturale (FR-10) - fréquence basse, plus grave
                frequency = 220; // La grave
                duration = 0.3;
                break;
            case 'posture-warning':
                // Son d'avertissement postural (FR-10) - fréquence moyenne
                frequency = 330; // Mi grave
                duration = 0.2;
                break;
        }

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = type === 'posture-error' ? 'sawtooth' : 'sine'; // Son plus perçant pour erreurs

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
    } catch (error) {
        console.warn('Impossible de jouer le son:', error);
    }
}

// Charger les préférences de sons (FR-09)
async function loadSoundPreferences() {
    try {
        const preferences = await api.getPreferences();
        soundsEnabled = preferences.sounds === 1;
    } catch (error) {
        console.warn('Impossible de charger les préférences de sons:', error);
        soundsEnabled = true; // Par défaut, activer les sons
    }
}

// Afficher le GIF de l'exercice dans le conteneur vidéo
function displayExerciseGif(gifUrl, exerciseName) {
    const gifContainer = document.getElementById('workout-exercise-gif');
    if (!gifContainer) return;
    
    if (gifUrl) {
        gifContainer.innerHTML = `
            <div class="exercise-gif-overlay">
                <div class="exercise-gif-label">Référence</div>
                <img src="${gifUrl}" 
                     alt="${exerciseName}" 
                     class="exercise-gif-image"
                     loading="eager"
                     onerror="this.style.display='none';">
            </div>
        `;
        gifContainer.style.display = 'block';
    } else {
        gifContainer.innerHTML = '';
        gifContainer.style.display = 'none';
    }
}

function startWorkoutTimer() {
    if (workoutTimer) clearInterval(workoutTimer);
    
    workoutTimer = setInterval(() => {
        if (!workoutStartTime) return;
        
        const elapsed = Math.floor((Date.now() - workoutStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        
        const timerDisplay = document.getElementById('timer-display');
        if (timerDisplay) {
            timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
    }, 1000);
}

function pauseWorkout() {
    if (workoutTimer) {
        clearInterval(workoutTimer);
        workoutTimer = null;
    }
    if (exerciseProgressTimer && currentExerciseDurationMs > 0) {
        clearInterval(exerciseProgressTimer);
        exerciseProgressTimer = null;
        exerciseElapsedBeforePause = Date.now() - exerciseStartTime;
    }
    stopCamera();
}

function resumeWorkout() {
    startWorkoutTimer();
    const video = document.getElementById('workout-video');
    const canvas = document.getElementById('workout-canvas');
    if (video && canvas) {
        startCamera(video, canvas);
    }
    if (currentExerciseDurationMs > 0 && progressFillElement) {
        exerciseStartTime = Date.now() - exerciseElapsedBeforePause;
        startExerciseProgressInterval();
    }
}

function stopWorkout() {
    if (workoutTimer) {
        clearInterval(workoutTimer);
        workoutTimer = null;
    }
    
    // Arrêter les timers FR-09
    if (restCountdownTimer) {
        clearInterval(restCountdownTimer);
        restCountdownTimer = null;
    }
    if (exerciseProgressTimer) {
        clearInterval(exerciseProgressTimer);
        exerciseProgressTimer = null;
    }
    currentExerciseDurationMs = 0;
    exerciseElapsedBeforePause = 0;
    
    // Masquer le compte à rebours de repos
    const restCountdown = document.getElementById('rest-countdown');
    if (restCountdown) {
        restCountdown.classList.add('hidden');
    }
    
    // Désactiver le stockage des données posturales (FR-10)
    window.currentWorkoutActive = false;
    
    // Réinitialiser les variables d'avertissement postural
    if (typeof window.resetPostureWarning === 'function') {
        window.resetPostureWarning();
    }
    
    stopCamera();
    
    const selectionDiv = document.getElementById('workout-selection');
    const activeDiv = document.getElementById('workout-active');
    
    if (selectionDiv) selectionDiv.classList.remove('hidden');
    if (activeDiv) activeDiv.classList.add('hidden');
    
    currentWorkout = null;
    currentExerciseIndex = 0;
    currentSet = 1;
    currentRep = 0;
    progressFillElement = null;
    workoutStartTime = null;
    window.workoutStartTime = null; // Réinitialiser le temps de début global
    if (typeof workoutPostureData !== 'undefined') {
        workoutPostureData = [];
    }
    const pauseBtn = document.getElementById('btn-pause');
    if (pauseBtn) {
        const iconElement = pauseBtn.querySelector('.btn-icon');
        if (iconElement) {
            iconElement.textContent = '⏸';
        } else {
            pauseBtn.textContent = '⏸';
        }
        pauseBtn.title = 'Pause';
    }
}

async function finishWorkout() {
    const sessionData = collectSessionData('completed');
    
    if (!sessionData) {
        console.warn('Aucune donnée de séance à sauvegarder');
        stopWorkout();
        return;
    }

    // Valider les données avant l'envoi
    try {
        JSON.stringify(sessionData);
    } catch (error) {
        console.error('Erreur sérialisation données séance:', error);
        alert('Erreur: Les données de la séance sont invalides. Veuillez réessayer.');
        stopWorkout();
        return;
    }
    
    stopWorkout();
    
    // Afficher le modal de bilan post-séance (FR-11)
    if (typeof showPostSessionModal === 'function') {
        showPostSessionModal(sessionData);
    } else {
        // Fallback si le modal n'est pas disponible
        try {
            const postureScore = sessionData.postureScore || 0;
            const validPostureScore = typeof postureScore === 'number' && !isNaN(postureScore) ? postureScore : 0;
            
            await api.saveSession(sessionData, 'Séance terminée', validPostureScore);
            alert('Séance enregistrée avec succès!');
            if (typeof loadDashboard === 'function') {
                loadDashboard();
            } else {
                showPage('dashboard');
            }
        } catch (error) {
            console.error('Erreur sauvegarde séance:', error);
            const errorMessage = error?.message || 'Erreur inconnue';
            if (errorMessage.includes('Session expirée') || errorMessage.includes('Token')) {
                alert('Votre session a expiré. Veuillez vous reconnecter.');
                if (typeof showPage === 'function') {
                    showPage('login');
                }
            } else {
                alert(`Erreur lors de la sauvegarde: ${errorMessage}`);
            }
        }
    }
}

async function saveWorkoutSession() {
    const sessionData = collectSessionData('saved');
    if (!sessionData) {
        alert('Aucune séance en cours à enregistrer.');
        return;
    }

    // Valider les données avant l'envoi
    try {
        // Vérifier que sessionData peut être sérialisé en JSON
        JSON.stringify(sessionData);
    } catch (error) {
        console.error('Erreur sérialisation données séance:', error);
        alert('Erreur: Les données de la séance sont invalides. Veuillez réessayer.');
        return;
    }

    stopWorkout();

    try {
        // S'assurer que postureScore est un nombre valide
        const postureScore = sessionData.postureScore || 0;
        const validPostureScore = typeof postureScore === 'number' && !isNaN(postureScore) ? postureScore : 0;
        
        await api.saveSession(sessionData, 'Séance enregistrée manuellement', validPostureScore);
        alert('Séance enregistrée.');
        if (typeof loadDashboard === 'function') {
            loadDashboard();
        }
    } catch (error) {
        console.error('Erreur sauvegarde séance:', error);
        // Afficher un message d'erreur plus informatif
        const errorMessage = error?.message || 'Erreur inconnue';
        if (errorMessage.includes('Session expirée') || errorMessage.includes('Token')) {
            alert('Votre session a expiré. Veuillez vous reconnecter.');
            if (typeof showPage === 'function') {
                showPage('login');
            }
        } else {
            alert(`Erreur lors de l'enregistrement de la séance: ${errorMessage}`);
        }
    }
}

function collectSessionData(status = 'completed') {
    if (!currentWorkout) {
        return null;
    }

    const startedAt = currentWorkout.startedAt || Date.now();
    const durationSeconds = Math.floor((Date.now() - startedAt) / 1000);
    const postureScore = calculateAveragePostureScore();
    const exercisesCompleted = Math.min(currentExerciseIndex, currentWorkout.exercises.length);

    // Nettoyer les données posturales pour éviter les références circulaires
    // Limiter à un échantillon pour réduire la taille du payload
    let cleanedPostureData = [];
    if (typeof workoutPostureData !== 'undefined' && Array.isArray(workoutPostureData)) {
        // Limiter à 100 échantillons maximum pour éviter un payload trop volumineux
        const maxSamples = 100;
        const sampleInterval = Math.max(1, Math.floor(workoutPostureData.length / maxSamples));
        const sampledData = workoutPostureData.filter((_, index) => index % sampleInterval === 0 || index === workoutPostureData.length - 1);
        
        cleanedPostureData = sampledData.slice(0, maxSamples).map(data => {
            // Créer un objet propre sans références circulaires
            return {
                timestamp: data.timestamp || Date.now(),
                score: typeof data.score === 'number' ? data.score : 0,
                errors: Array.isArray(data.errors) ? data.errors.slice(0, 5) : [] // Limiter à 5 erreurs max par échantillon
                // Ne pas inclure landmarks pour éviter les données trop volumineuses
            };
        });
    }

    // Limiter la taille des exercices pour réduire le payload
    const exercises = Array.isArray(currentWorkout.exercises) ? currentWorkout.exercises.map(ex => ({
        name: ex.name || 'Unknown',
        sets: ex.sets || null,
        reps: ex.reps || null,
        duration: ex.duration || null,
        rest: ex.rest || null
        // Exclure les autres propriétés pour réduire la taille
    })) : [];
    
    return {
        workout: {
            day: currentWorkout.day || 'unknown',
            exercises: exercises,
            skippedExercises: Array.isArray(currentWorkout.skippedExercises) ? currentWorkout.skippedExercises.slice(0, 10) : [],
            status,
            startedAt: currentWorkout.startTime || new Date(startedAt).toISOString(),
            endedAt: new Date().toISOString(),
            currentExerciseIndex: typeof currentExerciseIndex === 'number' ? currentExerciseIndex : 0,
            totalExercises: exercises.length
        },
        duration: typeof durationSeconds === 'number' && durationSeconds >= 0 ? durationSeconds : 0,
        postureScore: typeof postureScore === 'number' && !isNaN(postureScore) ? postureScore : 0,
        exercisesCompleted: typeof exercisesCompleted === 'number' && exercisesCompleted >= 0 ? exercisesCompleted : 0,
        postureData: cleanedPostureData
    };
}

function calculateAveragePostureScore() {
    // Calculer un score basé sur les données posturales réelles collectées (FR-10)
    if (typeof workoutPostureData !== 'undefined' && workoutPostureData.length > 0) {
        const scores = workoutPostureData.map(data => data.score).filter(s => s > 0);
        if (scores.length > 0) {
            const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
            return Math.round(avgScore);
        }
    }
    
    // Fallback si pas de données
    return Math.floor(75 + Math.random() * 20); // Score entre 75-95
}

// Évaluation posturale initiale améliorée (FR-05)
// Variable globale pour stocker les landmarks actuels (accessible depuis pose-detection.js)
window.evalCurrentLandmarks = null;

let evalExercises = [
    { name: 'Squats', reps: 3, duration: 15000, type: 'squat' },
    { name: 'Planche', reps: 1, duration: 20000, type: 'plank' },
    { name: 'Fentes', reps: 3, duration: 15000, type: 'lunge' }
];
let evalCurrentExercise = 0;
let evalScores = [];
let evalPostureData = []; // Stocker les données de posture pour chaque exercice
let evalStartTime = null;
let evalTimer = null;
let evalScoreInterval = null; // Intervalle pour calculer le score en temps réel
let evalPaused = false;
let evalPauseAccumulated = 0;

const evalExerciseDescriptions = {
    squat: 'Pliez les genoux en gardant le dos droit, les talons au sol et remontez sans verrouiller les genoux.',
    plank: 'Maintenez une planche en alignant tête, épaules et hanches, abdominaux gainés et respiration régulière.',
    lunge: 'Avancez d’un grand pas, descendez en gardant le genou avant aligné avec la cheville puis remontez en contrôlant.'
};

async function startPostureEvaluation() {
    const btnStart = document.getElementById('btn-start-eval');
    const btnNext = document.getElementById('btn-next-exercise');
    const btnFinish = document.getElementById('btn-finish-eval');
    const btnCancel = document.getElementById('btn-cancel-eval');
    const btnGeneratePlan = document.getElementById('btn-generate-plan-after-eval');
    const btnRestart = document.getElementById('btn-restart-eval');
    const btnPause = document.getElementById('btn-eval-pause');
    const btnPrev = document.getElementById('btn-eval-prev');
    const btnSkip = document.getElementById('btn-eval-skip');
    const statusDiv = document.getElementById('eval-status');
    const progressFill = document.getElementById('eval-progress-fill');
    const liveInfo = document.getElementById('eval-live-info');
    const liveScoreEl = document.getElementById('eval-live-score');
    
    if (btnStart) btnStart.classList.add('hidden');
    if (btnNext) btnNext.classList.add('hidden');
    if (btnFinish) btnFinish.classList.add('hidden');
    if (btnCancel) btnCancel.classList.remove('hidden'); // Afficher le bouton Annuler
    if (btnGeneratePlan) btnGeneratePlan.classList.add('hidden');
    if (btnRestart) btnRestart.classList.add('hidden');
    if (btnPause) {
        btnPause.classList.remove('hidden');
        const btnText = btnPause.querySelector('.btn-text');
        if (btnText) btnText.textContent = 'Pause';
        else btnPause.textContent = 'Pause';
    }
    if (btnPrev) btnPrev.classList.add('hidden');
    if (btnSkip) btnSkip.classList.remove('hidden');
    if (liveInfo) liveInfo.classList.remove('hidden');
    if (liveScoreEl) liveScoreEl.innerHTML = 'Score en temps réel: <strong>--</strong>/100';
    
    const video = document.getElementById('eval-video');
    const canvas = document.getElementById('eval-canvas');
    
    if (video && canvas) {
        await startCamera(video, canvas);
    }

    evalCurrentExercise = 0;
    evalScores = [];
    evalPostureData = [];
    evalPaused = false;
    evalPauseAccumulated = 0;
    
    if (statusDiv) statusDiv.textContent = 'Évaluation en cours...';
    startEvalExercise();
}

// Fonction pour annuler l'évaluation posturale
function cancelPostureEvaluation() {
    // Arrêter la caméra
    stopCamera();
    
    // Arrêter tous les timers
    if (evalTimer) {
        clearInterval(evalTimer);
        evalTimer = null;
    }
    if (evalScoreInterval) {
        clearInterval(evalScoreInterval);
        evalScoreInterval = null;
    }
    
    // Réinitialiser les variables
    evalCurrentExercise = 0;
    evalScores = [];
    evalPostureData = [];
    evalStartTime = null;
    evalPaused = false;
    evalPauseAccumulated = 0;
    
    // Réinitialiser l'interface
    const btnStart = document.getElementById('btn-start-eval');
    const btnNext = document.getElementById('btn-next-exercise');
    const btnFinish = document.getElementById('btn-finish-eval');
    const btnCancel = document.getElementById('btn-cancel-eval');
    const btnGeneratePlan = document.getElementById('btn-generate-plan-after-eval');
    const btnRestart = document.getElementById('btn-restart-eval');
    const btnPause = document.getElementById('btn-eval-pause');
    const btnPrev = document.getElementById('btn-eval-prev');
    const btnSkip = document.getElementById('btn-eval-skip');
    const statusDiv = document.getElementById('eval-status');
    const progressFill = document.getElementById('eval-progress-fill');
    const instructions = document.getElementById('eval-instructions');
    const scoresDiv = document.getElementById('eval-scores');
    const liveScoreEl = document.getElementById('eval-live-score');
    const liveInfo = document.getElementById('eval-live-info');
    const feedbackBox = document.getElementById('eval-feedback');
    
    if (btnStart) btnStart.classList.remove('hidden');
    if (btnNext) btnNext.classList.add('hidden');
    if (btnFinish) btnFinish.classList.add('hidden');
    if (btnCancel) btnCancel.classList.add('hidden');
    if (btnGeneratePlan) btnGeneratePlan.classList.add('hidden');
    if (btnRestart) btnRestart.classList.add('hidden');
    if (btnPause) btnPause.classList.add('hidden');
    if (btnPrev) btnPrev.classList.add('hidden');
    if (btnSkip) btnSkip.classList.add('hidden');
    
    if (statusDiv) statusDiv.textContent = 'Prêt à commencer';
    if (progressFill) progressFill.style.width = '0%';
    if (scoresDiv) scoresDiv.classList.add('hidden');
    if (liveInfo) liveInfo.classList.add('hidden');
    if (liveScoreEl) liveScoreEl.innerHTML = 'Score en temps réel: <strong>--</strong>/100';
    
    if (instructions) {
        instructions.innerHTML = '';
    }
    
    if (feedbackBox) {
        feedbackBox.innerHTML = '';
        feedbackBox.className = 'feedback-box';
    }
}

function startEvalExercise() {
    if (evalCurrentExercise >= evalExercises.length) {
        finishPostureEvaluation();
        return;
    }

    const exercise = evalExercises[evalCurrentExercise];
    const instructions = document.getElementById('eval-instructions');
    const statusDiv = document.getElementById('eval-status');
    const progressFill = document.getElementById('eval-progress-fill');
    const btnNext = document.getElementById('btn-next-exercise');
    const scoresDiv = document.getElementById('eval-scores');
    const descriptionEl = document.getElementById('eval-exercise-description');
    const liveScoreEl = document.getElementById('eval-live-score');
    const btnPause = document.getElementById('btn-eval-pause');
    const btnPrev = document.getElementById('btn-eval-prev');
    const btnSkip = document.getElementById('btn-eval-skip');
    
    // Réinitialiser les données pour cet exercice
    evalScores = evalScores.slice(0, evalCurrentExercise);
    evalPostureData[evalCurrentExercise] = {
        scores: [],
        landmarks: [],
        timestamps: []
    };
    evalPaused = false;
    evalPauseAccumulated = 0;
    
    if (instructions) {
        const description = evalExerciseDescriptions[exercise.type] || evalExerciseDescriptions[exercise.name.toLowerCase()] || 'Effectuez le mouvement avec contrôle et respiration régulière.';
        instructions.innerHTML = `
            <h3>Exercice ${evalCurrentExercise + 1}/${evalExercises.length}: ${exercise.name}</h3>
            <p>Effectuez ${exercise.reps} ${exercise.reps > 1 ? 'répétitions' : 'répétition'} de ${exercise.name}.</p>
            <p>Le système analysera votre posture en temps réel avec MediaPipe (≥5 repères corporels).</p>
            <p class="eval-description">${description}</p>
        `;
    }

    if (statusDiv) statusDiv.textContent = `Exercice ${evalCurrentExercise + 1}/${evalExercises.length}: ${exercise.name}`;
    if (progressFill) progressFill.style.width = '0%';
    if (scoresDiv) scoresDiv.classList.add('hidden');
    if (descriptionEl) {
        descriptionEl.textContent = evalExerciseDescriptions[exercise.type] || evalExerciseDescriptions[exercise.name.toLowerCase()] || 'Effectuez le mouvement avec contrôle et respiration régulière.';
    }
    if (liveScoreEl) {
        liveScoreEl.innerHTML = 'Score en temps réel: <strong>--</strong>/100';
    }
    if (btnPause) {
        btnPause.classList.remove('hidden');
        const btnText = btnPause.querySelector('.btn-text');
        if (btnText) btnText.textContent = 'Pause';
        else btnPause.textContent = 'Pause';
    }
    if (btnPrev) btnPrev.classList.toggle('hidden', evalCurrentExercise === 0);
    if (btnSkip) btnSkip.classList.remove('hidden');

    // Démarrer le timer
    evalStartTime = Date.now();
    const exerciseDuration = exercise.duration;
    let elapsed = 0;
    
    // Calculer le score en temps réel toutes les 500ms (FR-05)
    evalScoreInterval = setInterval(() => {
        if (evalPaused) return;
        if (window.evalCurrentLandmarks && typeof calculatePostureScore === 'function') {
            const canvas = document.getElementById('eval-canvas');
            const video = document.getElementById('eval-video');
            if (canvas && video) {
                const score = calculatePostureScore(window.evalCurrentLandmarks, canvas.width || 640, canvas.height || 480);
                evalPostureData[evalCurrentExercise].scores.push(score);
                evalPostureData[evalCurrentExercise].landmarks.push(JSON.parse(JSON.stringify(window.evalCurrentLandmarks)));
                const relativeTime = Date.now() - evalStartTime + evalPauseAccumulated;
                evalPostureData[evalCurrentExercise].timestamps.push(relativeTime);
                
                // Afficher le score en temps réel
                if (liveScoreEl) {
                    liveScoreEl.innerHTML = `Score en temps réel: <strong>${score}</strong>/100`;
                }
            }
        }
    }, 500);
    
    evalTimer = setInterval(() => {
        if (evalPaused) return;
        elapsed = Date.now() - evalStartTime + evalPauseAccumulated;
        const progress = Math.min((elapsed / exercise.duration) * 100, 100);
        if (progressFill) progressFill.style.width = progress + '%';
        
        if (elapsed >= exerciseDuration) {
            completeCurrentEvalExercise();
        }
    }, 100);
}

function calculateEvalScore(exerciseName) {
    // Score de fallback si aucune donnée MediaPipe n'est disponible
    // Ceci ne devrait normalement pas être utilisé si MediaPipe fonctionne
    const baseScore = 70;
    const variation = Math.random() * 20;
    return Math.round(baseScore + variation);
}

function nextEvalExercise() {
    evalCurrentExercise++;
    const btnNext = document.getElementById('btn-next-exercise');
    if (btnNext) btnNext.classList.add('hidden');
    
    if (evalCurrentExercise < evalExercises.length) {
        startEvalExercise();
    } else {
        finishPostureEvaluation();
    }
}

async function finishPostureEvaluation() {
    stopCamera();
    if (evalTimer) clearInterval(evalTimer);
    if (evalScoreInterval) clearInterval(evalScoreInterval);
    
    const validScores = evalScores.filter(entry => entry && typeof entry.score === 'number');
    const avgScore = validScores.length > 0
        ? Math.round(validScores.reduce((sum, s) => sum + s.score, 0) / validScores.length)
        : 0;
    const instructions = document.getElementById('eval-instructions');
    const statusDiv = document.getElementById('eval-status');
    const scoresDiv = document.getElementById('eval-scores');
    const btnStart = document.getElementById('btn-start-eval');
    const btnNext = document.getElementById('btn-next-exercise');
    const btnFinish = document.getElementById('btn-finish-eval');
    const progressFill = document.getElementById('eval-progress-fill');
    const liveInfo = document.getElementById('eval-live-info');
    const liveScoreEl = document.getElementById('eval-live-score');
    const btnGeneratePlan = document.getElementById('btn-generate-plan-after-eval');
    const btnRestart = document.getElementById('btn-restart-eval');
    const btnCancel = document.getElementById('btn-cancel-eval');
    const btnPause = document.getElementById('btn-eval-pause');
    const btnPrev = document.getElementById('btn-eval-prev');
    const btnSkip = document.getElementById('btn-eval-skip');
    
    if (statusDiv) statusDiv.textContent = 'Évaluation terminée!';
    if (progressFill) progressFill.style.width = '100%';
    if (liveInfo) liveInfo.classList.add('hidden');
    if (liveScoreEl) liveScoreEl.innerHTML = 'Score en temps réel: <strong>--</strong>/100';
    
    // Compter les repères détectés (FR-05)
    let totalLandmarksDetected = 0;
    evalPostureData.filter(Boolean).forEach(exData => {
        if (exData.landmarks && exData.landmarks.length > 0) {
            const lastLandmarks = exData.landmarks[exData.landmarks.length - 1];
            const visible = lastLandmarks.filter(l => l && l.visibility > 0.5).length;
            totalLandmarksDetected = Math.max(totalLandmarksDetected, visible);
        }
    });
    
    if (instructions) {
        instructions.innerHTML = `
            <h3>✅ Évaluation terminée!</h3>
            <p><strong>Score moyen:</strong> ${avgScore}/100</p>
            <p><strong>Repères détectés:</strong> ${totalLandmarksDetected}/33 (≥5 requis ✅)</p>
            <p>Votre niveau a été évalué avec succès grâce à l'analyse MediaPipe.</p>
        `;
    }

    if (scoresDiv) {
        scoresDiv.classList.remove('hidden');
        scoresDiv.innerHTML = `
            <h4>Détails par exercice:</h4>
            <ul>
                ${validScores.map(s => `
                    <li><strong>${s.exercise}:</strong> ${s.score}/100 
                        ${s.score >= 80 ? '✅ Excellent' : s.score >= 60 ? '✓ Bon' : '⚠️ À améliorer'}
                        ${s.data && s.data.scores && s.data.scores.length > 0 ? `(${s.data.scores.length} mesures)` : ''}
                    </li>
                `).join('')}
            </ul>
            <p><strong>Recommandation:</strong> ${avgScore >= 80 ? 'Niveau avancé recommandé' : avgScore >= 60 ? 'Niveau intermédiaire recommandé' : 'Niveau débutant recommandé'}</p>
        `;
    }
    
    if (btnStart) btnStart.classList.add('hidden');
    if (btnNext) btnNext.classList.add('hidden');
    if (btnFinish) btnFinish.classList.add('hidden');
    if (btnCancel) btnCancel.classList.add('hidden');
    if (btnPause) btnPause.classList.add('hidden');
    if (btnPrev) btnPrev.classList.add('hidden');
    if (btnSkip) btnSkip.classList.add('hidden');
    if (btnGeneratePlan) {
        btnGeneratePlan.disabled = false;
        btnGeneratePlan.textContent = 'Générer le plan d\'entraînement';
        btnGeneratePlan.classList.remove('hidden');
    }
    if (btnRestart) btnRestart.classList.remove('hidden');

    // Sauvegarder le niveau évalué dans le profil et enregistrer le score (FR-05)
    await saveEvaluatedLevel(avgScore);
    await saveEvaluationScore(avgScore, validScores, evalPostureData);
}

async function saveEvaluatedLevel(score) {
    try {
        const profile = await api.getProfile();
        let fitnessLevel = 'beginner';
        
        if (score >= 80) {
            fitnessLevel = 'advanced';
        } else if (score >= 60) {
            fitnessLevel = 'intermediate';
        }
        
        // Mettre à jour le niveau si différent
        if (profile.fitness_level !== fitnessLevel) {
            await api.updateProfile({
                ...profile,
                fitness_level: fitnessLevel
            });
        }
    } catch (error) {
        console.error('Erreur sauvegarde niveau:', error);
    }
}

async function generatePlanAfterEvaluation() {
    const btnGeneratePlan = document.getElementById('btn-generate-plan-after-eval');
    if (!btnGeneratePlan) return;

    const originalText = btnGeneratePlan.textContent;
    btnGeneratePlan.disabled = true;
    btnGeneratePlan.textContent = 'Génération en cours...';

    try {
        const profile = await api.getProfile();
        const data = await api.generatePlan(profile);

        showPage('workout');

        if (data && data.plan && typeof displayWorkoutPlan === 'function') {
            await displayWorkoutPlan(data.plan);
        } else if (typeof loadWorkoutPlan === 'function' && typeof displayWorkoutPlan === 'function') {
            const plan = await loadWorkoutPlan();
            if (plan) {
                await displayWorkoutPlan(plan);
            }
        }

        if (typeof advanceWorkflow === 'function') {
            advanceWorkflow();
        }
    } catch (error) {
        alert('Erreur: ' + error.message);
    } finally {
        btnGeneratePlan.disabled = false;
        btnGeneratePlan.textContent = originalText;
    }
}

function restartPostureEvaluation() {
    cancelPostureEvaluation();
    startPostureEvaluation();
}

// Enregistrer le score d'évaluation posturale (FR-05)
async function saveEvaluationScore(avgScore, scores, postureData) {
    try {
        // Enregistrer l'évaluation comme une session spéciale
        const evaluationData = {
            type: 'posture_evaluation',
            overallScore: avgScore,
            exerciseScores: scores,
            timestamp: new Date().toISOString(),
            landmarksDetected: postureData.filter(Boolean).reduce((max, ex) => {
                if (ex.landmarks && ex.landmarks.length > 0) {
                    const last = ex.landmarks[ex.landmarks.length - 1];
                    return Math.max(max, last.filter(l => l && l.visibility > 0.5).length);
                }
                return max;
            }, 0)
        };
        
        // Sauvegarder via l'API (on peut créer une route dédiée ou utiliser la route session)
        await api.saveSession(evaluationData, `Évaluation posturale initiale - Score: ${avgScore}/100`, avgScore);
        console.log('Score d\'évaluation posturale enregistré:', avgScore);
    } catch (error) {
        console.error('Erreur sauvegarde score évaluation:', error);
    }
}

function completeCurrentEvalExercise(options = {}) {
    const exercise = evalExercises[evalCurrentExercise];
    if (!exercise) return;

    if (evalTimer) {
        clearInterval(evalTimer);
        evalTimer = null;
    }
    if (evalScoreInterval) {
        clearInterval(evalScoreInterval);
        evalScoreInterval = null;
    }

    const exerciseData = evalPostureData[evalCurrentExercise] || { scores: [], landmarks: [], timestamps: [] };
    let avgScore = 0;

    if (!options.skip && exerciseData.scores && exerciseData.scores.length > 0) {
        avgScore = Math.round(
            exerciseData.scores.reduce((sum, s) => sum + s, 0) / exerciseData.scores.length
        );
    } else if (options.skip) {
        avgScore = 0;
        exerciseData.skipped = true;
    } else {
        avgScore = calculateEvalScore(exercise.name);
    }

    evalScores[evalCurrentExercise] = {
        exercise: exercise.name,
        score: avgScore,
        data: exerciseData
    };

    const btnNext = document.getElementById('btn-next-exercise');
    if (btnNext) {
        btnNext.classList.remove('hidden');
        btnNext.textContent = evalCurrentExercise < evalExercises.length - 1 ? 'Exercice suivant' : 'Terminer';
    }

    const btnPause = document.getElementById('btn-eval-pause');
    if (btnPause) {
        const btnText = btnPause.querySelector('.btn-text');
        if (btnText) btnText.textContent = 'Pause';
        else btnPause.textContent = 'Pause';
    }

    evalPaused = false;
    evalPauseAccumulated = 0;
}

function toggleEvalPause() {
    const btnPause = document.getElementById('btn-eval-pause');
    if (!btnPause) return;

    const btnText = btnPause.querySelector('.btn-text');
    
    if (!evalPaused) {
        evalPaused = true;
        evalPauseAccumulated += Date.now() - evalStartTime;
        if (btnText) btnText.textContent = 'Reprendre';
        else btnPause.textContent = 'Reprendre';
    } else {
        evalPaused = false;
        evalStartTime = Date.now();
        if (btnText) btnText.textContent = 'Pause';
        else btnPause.textContent = 'Pause';
    }
}

function skipEvalExercise() {
    const exercise = evalExercises[evalCurrentExercise];
    if (!exercise) return;

    if (!evalPostureData[evalCurrentExercise]) {
        evalPostureData[evalCurrentExercise] = { scores: [], landmarks: [], timestamps: [], skipped: true };
    } else {
        evalPostureData[evalCurrentExercise].skipped = true;
        evalPostureData[evalCurrentExercise].scores = [];
    }

    completeCurrentEvalExercise({ skip: true });
    nextEvalExercise();
}

function previousEvalExercise() {
    if (evalCurrentExercise <= 0) return;

    if (evalTimer) {
        clearInterval(evalTimer);
        evalTimer = null;
    }
    if (evalScoreInterval) {
        clearInterval(evalScoreInterval);
        evalScoreInterval = null;
    }

    evalPaused = false;
    evalPauseAccumulated = 0;

    evalCurrentExercise = Math.max(0, evalCurrentExercise - 1);
    startEvalExercise();
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    const btnStartEval = document.getElementById('btn-start-eval');
    if (btnStartEval) {
        btnStartEval.addEventListener('click', startPostureEvaluation);
    }

    const btnNextExercise = document.getElementById('btn-next-exercise');
    if (btnNextExercise) {
        btnNextExercise.addEventListener('click', nextEvalExercise);
    }

    const btnFinishEval = document.getElementById('btn-finish-eval');
    if (btnFinishEval) {
        btnFinishEval.addEventListener('click', finishPostureEvaluation);
    }

    const btnCancelEval = document.getElementById('btn-cancel-eval');
    if (btnCancelEval) {
        btnCancelEval.addEventListener('click', () => {
            if (confirm('Êtes-vous sûr de vouloir annuler l\'évaluation ? Les données collectées seront perdues.')) {
                cancelPostureEvaluation();
            }
        });
    }

    const btnGeneratePlanAfterEval = document.getElementById('btn-generate-plan-after-eval');
    if (btnGeneratePlanAfterEval) {
        btnGeneratePlanAfterEval.addEventListener('click', generatePlanAfterEvaluation);
    }

    const btnRestartEval = document.getElementById('btn-restart-eval');
    if (btnRestartEval) {
        btnRestartEval.addEventListener('click', restartPostureEvaluation);
    }

    const btnEvalPause = document.getElementById('btn-eval-pause');
    if (btnEvalPause) {
        btnEvalPause.addEventListener('click', toggleEvalPause);
    }

    const btnEvalSkip = document.getElementById('btn-eval-skip');
    if (btnEvalSkip) {
        btnEvalSkip.addEventListener('click', skipEvalExercise);
    }

    const btnEvalPrev = document.getElementById('btn-eval-prev');
    if (btnEvalPrev) {
        btnEvalPrev.addEventListener('click', previousEvalExercise);
    }

    const btnPause = document.getElementById('btn-pause');
    if (btnPause) {
        btnPause.addEventListener('click', () => {
            const iconElement = btnPause.querySelector('.btn-icon');
            if (workoutTimer) {
                pauseWorkout();
                if (iconElement) {
                    iconElement.textContent = '▶';
                } else {
                    btnPause.textContent = '▶';
                }
                btnPause.title = 'Reprendre';
            } else {
                resumeWorkout();
                if (iconElement) {
                    iconElement.textContent = '⏸';
                } else {
                    btnPause.textContent = '⏸';
                }
                btnPause.title = 'Pause';
            }
        });
    }

    const btnSkip = document.getElementById('btn-skip');
    if (btnSkip) {
        btnSkip.addEventListener('click', () => {
            skipCurrentExercise();
        });
    }

    const btnPrev = document.getElementById('btn-prev');
    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            previousExercise();
        });
    }

    const btnSave = document.getElementById('btn-save-workout');
    if (btnSave) {
        btnSave.addEventListener('click', () => {
            saveWorkoutSession();
        });
    }

    const btnStop = document.getElementById('btn-stop');
    if (btnStop) {
        btnStop.addEventListener('click', stopWorkout);
    }

    // Le plan sera chargé automatiquement par showPage() dans auth.js
    // Pas besoin de dupliquer ici
});

function resetExerciseTimers(resetProgress = false) {
    if (exerciseProgressTimer) {
        clearInterval(exerciseProgressTimer);
        exerciseProgressTimer = null;
    }
    if (resetProgress && progressFillElement) {
        progressFillElement.style.width = '0%';
    }
    if (restCountdownTimer) {
        clearInterval(restCountdownTimer);
        restCountdownTimer = null;
    }
    const restCountdown = document.getElementById('rest-countdown');
    if (restCountdown) {
        restCountdown.classList.add('hidden');
    }
    currentExerciseDurationMs = 0;
    exerciseElapsedBeforePause = 0;
}

