// Catalogue d'exercices (FR-08)
let allExercises = [];
let preloadedMedia = new Map(); // Cache pour les médias préchargés

async function loadExercisesCatalog() {
    const startTime = Date.now();
    try {
        const response = await fetch('/exercises/exercises.json');
        const data = await response.json();
        allExercises = data.exercises || [];
        
        // Précharger les médias pour latence <1s (FR-08)
        preloadMedia(allExercises);
        
        displayExercises(allExercises);
        
        const loadTime = Date.now() - startTime;
        console.log(`Catalogue chargé en ${loadTime}ms (${allExercises.length} exercices)`);
    } catch (error) {
        console.error('Erreur chargement catalogue:', error);
        // Utiliser les exercices par défaut
        allExercises = getDefaultExercises();
        preloadMedia(allExercises);
        displayExercises(allExercises);
    }
}

// Précharger les médias (vidéos/GIF) pour latence <1s (FR-08)
function preloadMedia(exercises) {
    exercises.forEach(exercise => {
        const mediaUrl = exercise.gif || exercise.video;
        if (mediaUrl && !preloadedMedia.has(mediaUrl)) {
            // Précharger l'image/GIF
            const img = new Image();
            img.onload = () => {
                preloadedMedia.set(mediaUrl, img);
            };
            img.onerror = () => {
                // Si l'image ne charge pas, on utilisera un placeholder
                preloadedMedia.set(mediaUrl, null);
            };
            img.src = mediaUrl;
        }
    });
}

function getDefaultExercises() {
    return [
        {
            id: 1,
            name: 'Squats',
            description: 'Descendez en pliant les genoux jusqu\'à ce que vos cuisses soient parallèles au sol',
            muscles: ['Quadriceps', 'Fessiers'],
            level: 'beginner',
            equipment: 'none',
            instructions: ['Tenez-vous debout', 'Descendez en pliant les genoux', 'Gardez le dos droit', 'Remontez']
        },
        {
            id: 2,
            name: 'Push-ups',
            description: 'Exercice de renforcement du haut du corps',
            muscles: ['Pectoraux', 'Triceps'],
            level: 'beginner',
            equipment: 'none',
            instructions: ['Position de planche', 'Descendez en pliant les bras', 'Remontez']
        },
        {
            id: 3,
            name: 'Planche',
            description: 'Maintenez la position de planche',
            muscles: ['Abdominaux', 'Épaules'],
            level: 'beginner',
            equipment: 'none',
            instructions: ['Position de planche', 'Corps aligné', 'Maintenez la position']
        },
        {
            id: 4,
            name: 'Fentes',
            description: 'Exercice pour les jambes',
            muscles: ['Quadriceps', 'Fessiers'],
            level: 'beginner',
            equipment: 'none',
            instructions: ['Faites un grand pas', 'Descendez', 'Remontez']
        },
        {
            id: 5,
            name: 'Burpees',
            description: 'Exercice complet du corps',
            muscles: ['Tout le corps'],
            level: 'intermediate',
            equipment: 'none',
            instructions: ['Accroupissez-vous', 'Sautez en planche', 'Push-up', 'Revenez', 'Sautez']
        },
        {
            id: 6,
            name: 'Mountain Climbers',
            description: 'Cardio et renforcement',
            muscles: ['Abdominaux', 'Cardio'],
            level: 'intermediate',
            equipment: 'none',
            instructions: ['Position de planche', 'Alternez les genoux rapidement']
        },
        {
            id: 7,
            name: 'Pompes inclinées',
            description: 'Push-ups plus faciles',
            muscles: ['Pectoraux', 'Triceps'],
            level: 'beginner',
            equipment: 'chair',
            instructions: ['Mains sur surface surélevée', 'Descendez et remontez']
        },
        {
            id: 8,
            name: 'Planche latérale',
            description: 'Renforcement des obliques',
            muscles: ['Abdominaux obliques'],
            level: 'intermediate',
            equipment: 'none',
            instructions: ['Couché sur le côté', 'Appui sur avant-bras', 'Maintenez']
        }
    ];
}

function displayExercises(exercises) {
    const container = document.getElementById('exercises-list');
    if (!container) return;

    if (exercises.length === 0) {
        container.innerHTML = '<p>Aucun exercice trouvé</p>';
        return;
    }

    // Afficher avec préchargement optimisé (FR-08)
    container.innerHTML = exercises.map(exercise => {
        const mediaUrl = exercise.gif || exercise.video;
        const hasMedia = !!mediaUrl;
        
        return `
        <div class="exercise-card" onclick="showExerciseDetail(${exercise.id})">
            ${hasMedia ? `
                <div class="exercise-media-container">
                    <img src="${mediaUrl}" 
                         alt="${exercise.name}" 
                         class="exercise-media"
                         loading="lazy"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <div class="exercise-placeholder" style="display: none;">
                        <span class="exercise-icon">💪</span>
                    </div>
                </div>
            ` : `
                <div class="exercise-placeholder">
                    <span class="exercise-icon">💪</span>
                </div>
            `}
            <div class="exercise-info">
                <h4>${exercise.name}</h4>
                <p class="exercise-description">${exercise.description}</p>
                <div class="exercise-meta">
                    <span class="badge badge-level-${exercise.level}">${getLevelLabel(exercise.level)}</span>
                    <span class="badge badge-equipment">${getEquipmentLabel(exercise.equipment)}</span>
                </div>
                <div class="exercise-actions">
                    <button class="btn-start-exercise" onclick="startExerciseFromCatalog(event, ${exercise.id})">
                        Lancer
                    </button>
                </div>
            </div>
        </div>
    `;
    }).join('');
}

function getLevelLabel(level) {
    const labels = {
        'beginner': 'Débutant',
        'intermediate': 'Intermédiaire',
        'advanced': 'Avancé'
    };
    return labels[level] || level;
}

function getEquipmentLabel(equipment) {
    const labels = {
        'none': 'Sans matériel',
        'chair': 'Chaise',
        'mat': 'Tapis'
    };
    return labels[equipment] || equipment;
}

function showExerciseDetail(exerciseId) {
    const exercise = allExercises.find(e => e.id === exerciseId);
    if (!exercise) return;

    const modal = document.getElementById('exercise-detail-modal');
    const content = document.getElementById('exercise-detail-content');
    
    if (!modal || !content) return;

    const mediaUrl = exercise.gif || exercise.video;
    const hasMedia = !!mediaUrl;

    content.innerHTML = `
        <div class="exercise-detail-header">
            <h2>${exercise.name}</h2>
            ${hasMedia ? `
                <div class="exercise-detail-media">
                    <img src="${mediaUrl}" 
                         alt="${exercise.name}" 
                         class="exercise-detail-image"
                         loading="eager"
                         onerror="this.style.display='none';">
                </div>
            ` : ''}
        </div>
        <div class="exercise-detail-info">
            <p class="exercise-detail-description"><strong>Description:</strong> ${exercise.description}</p>
            <div class="exercise-detail-meta">
                <p><strong>Muscles sollicités:</strong> ${exercise.muscles ? exercise.muscles.join(', ') : 'N/A'}</p>
                <p><strong>Niveau:</strong> <span class="badge badge-level-${exercise.level}">${getLevelLabel(exercise.level)}</span></p>
                <p><strong>Matériel:</strong> <span class="badge badge-equipment">${getEquipmentLabel(exercise.equipment)}</span></p>
            </div>
            <div class="exercise-detail-instructions">
                <h3>Instructions:</h3>
                <ol>
                    ${exercise.instructions ? exercise.instructions.map(inst => `<li>${inst}</li>`).join('') : '<li>Aucune instruction disponible</li>'}
                </ol>
            </div>
            <div class="exercise-detail-actions">
                <button class="btn-start-exercise" onclick="startExerciseFromCatalog(event, ${exercise.id})">
                    Lancer
                </button>
            </div>
        </div>
    `;

    modal.classList.add('active');
    modal.style.display = 'flex';
}

// Filtres optimisés pour latence <1s (FR-08)
function initFilters() {
    const filterLevel = document.getElementById('filter-level');
    const filterEquipment = document.getElementById('filter-equipment');
    const filterSearch = document.getElementById('filter-search');

    // Debounce pour la recherche (optimisation)
    let searchTimeout;
    const applyFilters = () => {
        const startTime = Date.now();
        const level = filterLevel?.value || '';
        const equipment = filterEquipment?.value || '';
        const search = filterSearch?.value.toLowerCase() || '';

        const filtered = allExercises.filter(ex => {
            const matchLevel = !level || ex.level === level;
            const matchEquipment = !equipment || ex.equipment === equipment;
            const matchSearch = !search || 
                ex.name.toLowerCase().includes(search) ||
                ex.description.toLowerCase().includes(search) ||
                (ex.muscles && ex.muscles.some(m => m.toLowerCase().includes(search)));

            return matchLevel && matchEquipment && matchSearch;
        });

        displayExercises(filtered);
        
        const filterTime = Date.now() - startTime;
        if (filterTime > 50) {
            console.log(`Filtres appliqués en ${filterTime}ms`);
        }
    };

    filterLevel?.addEventListener('change', applyFilters);
    filterEquipment?.addEventListener('change', applyFilters);
    filterSearch?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(applyFilters, 150); // Debounce 150ms
    });
}

// Fermer modal
document.addEventListener('DOMContentLoaded', () => {
    const exerciseModal = document.getElementById('exercise-detail-modal');
    
    // Fermer avec le bouton X
    exerciseModal?.querySelector('.close-modal')?.addEventListener('click', () => {
        exerciseModal.classList.remove('active');
        exerciseModal.style.display = 'none';
    });

    // Fermer en cliquant en dehors
    window.addEventListener('click', (e) => {
        if (e.target === exerciseModal) {
            exerciseModal.classList.remove('active');
            exerciseModal.style.display = 'none';
        }
    });

    // Charger le catalogue quand on arrive sur la page
    document.getElementById('nav-exercises')?.addEventListener('click', () => {
        loadExercisesCatalog();
        initFilters();
    });
    
    // Charger aussi au chargement initial si on est déjà sur la page
    if (document.getElementById('exercises-catalog-page')?.classList.contains('active')) {
        loadExercisesCatalog();
        initFilters();
    }
});

// Fonction globale
window.showExerciseDetail = showExerciseDetail;
window.startExerciseFromCatalog = startExerciseFromCatalog;

function startExerciseFromCatalog(event, exerciseId) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const exercise = allExercises.find(ex => ex.id === exerciseId);
    if (!exercise) return;

    try {
        if (typeof window.startCatalogExercise === 'function') {
            const result = window.startCatalogExercise(exercise);
            if (result && typeof result.then === 'function') {
                result.catch(err => console.error('Erreur lors du lancement de l’exercice depuis le catalogue:', err));
            }
        } else {
            console.warn('startCatalogExercise non disponible');
        }
    } catch (error) {
        console.error('Erreur lors du lancement de l’exercice depuis le catalogue:', error);
    }
    closeExerciseModal();
}

function closeExerciseModal() {
    const modal = document.getElementById('exercise-detail-modal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.style.display = 'none';
}

