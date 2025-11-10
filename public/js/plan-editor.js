// Gestion de l'édition du plan d'entraînement (FR-07)
let editingPlan = null;
let originalPlan = null;

function normalizeWeeklyPlan(weeklyPlan) {
    if (!weeklyPlan || typeof weeklyPlan !== 'object') return {};
    const normalized = {};

    Object.entries(weeklyPlan).forEach(([day, exercises], index) => {
        const normalizedDay = normalizeDayKey(day, exercises, index);

        if (!exercises) {
            normalized[normalizedDay] = [];
            return;
        }

        if (Array.isArray(exercises)) {
            normalized[normalizedDay] = exercises;
            return;
        }

        if (typeof exercises === 'object') {
            const list = Object.values(exercises).flatMap(entry => {
                if (!entry) return [];
                if (Array.isArray(entry)) return entry;
                return [entry];
            });
            normalized[normalizedDay] = list;
            return;
        }

        normalized[normalizedDay] = [];
    });

    return normalized;
}

function normalizeDayKey(dayKey, exercisesRaw, index = 0) {
    if (typeof dayKey === 'string' && dayKey.trim().length > 0) {
        return dayKey.trim();
    }

    if (Array.isArray(exercisesRaw)) {
        const inferredDay = exercisesRaw?.[0]?.day;
        if (typeof inferredDay === 'string' && inferredDay.trim().length > 0) {
            return inferredDay.trim();
        }
    } else if (exercisesRaw && typeof exercisesRaw === 'object') {
        if (typeof exercisesRaw.day === 'string' && exercisesRaw.day.trim().length > 0) {
            return exercisesRaw.day.trim();
        }
    }

    return `jour_${index + 1}`;
}

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

// Ouvrir le modal d'édition
async function openEditPlanModal() {
    const modal = document.getElementById('edit-plan-modal');
    const loadingDiv = document.getElementById('edit-plan-loading');
    const formDiv = document.getElementById('edit-plan-form');
    
    if (!modal || !loadingDiv || !formDiv) return;
    
    // Afficher le modal
    modal.classList.add('active');
    modal.style.display = 'flex';
    loadingDiv.style.display = 'block';
    formDiv.style.display = 'none';
    
    try {
        // Charger le plan actuel
        const response = await api.getPlan();
        if (!response.plan) {
            alert('Aucun plan disponible. Générez-en un d\'abord.');
            closeEditPlanModal();
            return;
        }
        
        editingPlan = JSON.parse(JSON.stringify(response.plan)); // Deep copy
        editingPlan.weeklyPlan = normalizeWeeklyPlan(editingPlan.weeklyPlan);
        originalPlan = JSON.parse(JSON.stringify(editingPlan)); // Sauvegarde pour annulation
        
        // Afficher le formulaire d'édition
        renderEditPlanForm(editingPlan);
        
        loadingDiv.style.display = 'none';
        formDiv.style.display = 'block';
    } catch (error) {
        console.error('Erreur chargement plan:', error);
        alert('Erreur lors du chargement du plan: ' + error.message);
        closeEditPlanModal();
    }
}

// Fermer le modal d'édition
function closeEditPlanModal() {
    const modal = document.getElementById('edit-plan-modal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    editingPlan = null;
    originalPlan = null;
}

// Rendre le formulaire d'édition
function renderEditPlanForm(plan) {
    const container = document.getElementById('edit-plan-days');
    if (!container || !plan || !plan.weeklyPlan) return;
    
    let html = '';
    
    // Informations générales
    html += `
        <div class="card" style="margin-bottom: 1.5rem; background: var(--card-bg);">
            <h3 style="color: var(--primary-color); margin-bottom: 1rem;">Informations générales</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                <div>
                    <label><strong>Niveau:</strong></label>
                    <select id="edit-plan-level" class="form-input">
                        <option value="beginner" ${plan.level === 'beginner' ? 'selected' : ''}>Débutant</option>
                        <option value="intermediate" ${plan.level === 'intermediate' ? 'selected' : ''}>Intermédiaire</option>
                        <option value="advanced" ${plan.level === 'advanced' ? 'selected' : ''}>Avancé</option>
                    </select>
                </div>
                <div>
                    <label><strong>Durée:</strong></label>
                    <input type="text" id="edit-plan-duration" class="form-input" value="${plan.duration || '4 weeks'}">
                </div>
            </div>
        </div>
    `;
    
    // Plan hebdomadaire
    html += '<h3 style="margin-bottom: 1rem; color: var(--primary-color);">Plan hebdomadaire</h3>';
    
    const entries = Object.entries(plan.weeklyPlan);
    entries.forEach(([dayKey, exercises], index) => {
        const normalizedDayKey = normalizeDayKey(dayKey, exercises, index);
        const lowerDay = normalizedDayKey.toLowerCase();
        const dayName = dayTranslations[lowerDay] || (typeof normalizedDayKey === 'string' ? normalizedDayKey : `Jour ${index + 1}`);
        const exerciseList = Array.isArray(exercises) ? exercises : [];
        html += `
            <div class="card" style="margin-bottom: 1.5rem; border-left: 4px solid var(--primary-color);">
                <h4 style="color: var(--primary-color); margin-bottom: 1rem;">${dayName}</h4>
                <div id="edit-exercises-${normalizedDayKey}" class="edit-exercises-list">
                    ${exerciseList.map((ex, exIndex) => renderExerciseEditor(normalizedDayKey, exIndex, ex)).join('')}
                </div>
                <button class="btn-secondary" onclick="addExercise('${normalizedDayKey}')" style="margin-top: 1rem; width: 100%;">
                    + Ajouter un exercice
                </button>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Rendre l'éditeur d'un exercice
function renderExerciseEditor(day, index, exercise) {
    return `
        <div class="edit-exercise-item" data-day="${day}" data-index="${index}" style="padding: 1rem; margin-bottom: 1rem; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                <h5 style="margin: 0; color: var(--text-color);">Exercice ${index + 1}</h5>
                <button class="btn-danger" onclick="removeExercise('${day}', ${index})" style="padding: 0.25rem 0.5rem; font-size: 0.875rem;">Supprimer</button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                <div>
                    <label>Nom de l'exercice:</label>
                    <input type="text" class="form-input exercise-name" value="${exercise.name || ''}" 
                           onchange="updateExercise('${day}', ${index}, 'name', this.value)">
                </div>
                <div>
                    <label>Séries:</label>
                    <input type="number" class="form-input exercise-sets" value="${exercise.sets || ''}" min="0"
                           onchange="updateExercise('${day}', ${index}, 'sets', parseInt(this.value) || null)">
                </div>
                <div>
                    <label>Répétitions:</label>
                    <input type="number" class="form-input exercise-reps" value="${exercise.reps || ''}" min="0"
                           onchange="updateExercise('${day}', ${index}, 'reps', parseInt(this.value) || null)">
                </div>
                <div>
                    <label>Durée (secondes):</label>
                    <input type="number" class="form-input exercise-duration" value="${exercise.duration || ''}" min="0"
                           onchange="updateExercise('${day}', ${index}, 'duration', parseInt(this.value) || null)">
                </div>
                <div>
                    <label>Repos (secondes):</label>
                    <input type="number" class="form-input exercise-rest" value="${exercise.rest || ''}" min="0"
                           onchange="updateExercise('${day}', ${index}, 'rest', parseInt(this.value) || null)">
                </div>
            </div>
        </div>
    `;
}

// Mettre à jour un exercice
window.updateExercise = function(day, index, field, value) {
    if (!editingPlan || !editingPlan.weeklyPlan[day] || !editingPlan.weeklyPlan[day][index]) return;
    
    if (value === null || value === '') {
        delete editingPlan.weeklyPlan[day][index][field];
    } else {
        editingPlan.weeklyPlan[day][index][field] = value;
    }
};

// Ajouter un exercice
window.addExercise = function(day) {
    if (!editingPlan || !editingPlan.weeklyPlan[day]) return;
    
    const newExercise = {
        name: 'Nouvel exercice',
        sets: 3,
        reps: 10,
        rest: 60
    };
    
    editingPlan.weeklyPlan[day].push(newExercise);
    
    // Re-rendre le formulaire
    renderEditPlanForm(editingPlan);
};

// Supprimer un exercice
window.removeExercise = function(day, index) {
    if (!editingPlan || !editingPlan.weeklyPlan[day] || !editingPlan.weeklyPlan[day][index]) return;
    
    if (confirm('Êtes-vous sûr de vouloir supprimer cet exercice ?')) {
        editingPlan.weeklyPlan[day].splice(index, 1);
        renderEditPlanForm(editingPlan);
    }
};

// Sauvegarder le plan modifié
async function saveEditedPlan() {
    if (!editingPlan) return;
    
    // Mettre à jour les informations générales
    const levelSelect = document.getElementById('edit-plan-level');
    const durationInput = document.getElementById('edit-plan-duration');
    
    if (levelSelect) {
        editingPlan.level = levelSelect.value;
    }
    if (durationInput) {
        editingPlan.duration = durationInput.value;
    }
    
    // Mettre à jour la version
    editingPlan.version = `1.${Date.now()}`;
    editingPlan.updatedAt = new Date().toISOString();
    
    const btnSave = document.getElementById('btn-save-plan');
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.textContent = 'Enregistrement...';
    }
    
    try {
        const startTime = Date.now();
        const response = await api.updatePlan(editingPlan);
        const saveTime = Date.now() - startTime;
        
        if (response.saveTime) {
            console.log(`Plan sauvegardé en ${response.saveTime} (SLA <3s: ${response.slaMet ? '✅' : '❌'})`);
        }
        
        alert(`Plan modifié avec succès ! (${saveTime}ms)`);
        
        // Fermer le modal et recharger le plan
        closeEditPlanModal();
        
        // Recharger l'affichage du plan
        if (typeof displayWorkoutPlan === 'function') {
            const planResponse = await api.getPlan();
            if (planResponse.plan) {
                await displayWorkoutPlan(planResponse.plan);
            }
        }
    } catch (error) {
        console.error('Erreur sauvegarde plan:', error);
        alert('Erreur lors de la sauvegarde: ' + error.message);
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.textContent = 'Enregistrer les modifications';
        }
    }
}

// Afficher l'historique des versions
async function showPlanHistory() {
    const modal = document.getElementById('plan-history-modal');
    const listContainer = document.getElementById('plan-history-list');
    
    if (!modal || !listContainer) return;
    
    modal.classList.add('active');
    modal.style.display = 'flex';
    listContainer.innerHTML = '<p>Chargement de l\'historique...</p>';
    
    try {
        const response = await api.getPlanHistory();
        const history = response.history || [];
        
        if (history.length === 0) {
            listContainer.innerHTML = '<p>Aucune version précédente disponible.</p>';
            return;
        }
        
        let html = '<div style="display: flex; flex-direction: column; gap: 1rem;">';
        
        history.forEach((entry, index) => {
            const date = new Date(entry.createdAt);
            html += `
                <div class="card" style="padding: 1rem; border-left: 4px solid var(--primary-color);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>Version ${entry.version || 'N/A'}</strong>
                            <p style="margin: 0.5rem 0 0 0; color: var(--text-secondary); font-size: 0.875rem;">
                                ${date.toLocaleDateString('fr-FR')} à ${date.toLocaleTimeString('fr-FR')}
                            </p>
                        </div>
                        <button class="btn-primary" onclick="rollbackToVersion(${entry.id})" style="padding: 0.5rem 1rem;">
                            Restaurer cette version
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        listContainer.innerHTML = html;
    } catch (error) {
        console.error('Erreur chargement historique:', error);
        listContainer.innerHTML = '<p style="color: var(--error-color);">Erreur lors du chargement de l\'historique.</p>';
    }
}

// Fermer le modal d'historique
function closeHistoryModal() {
    const modal = document.getElementById('plan-history-modal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
}

// Roll-back vers une version précédente
window.rollbackToVersion = async function(historyId) {
    if (!confirm('Êtes-vous sûr de vouloir restaurer cette version ? La version actuelle sera sauvegardée dans l\'historique.')) {
        return;
    }
    
    try {
        const startTime = Date.now();
        const response = await api.rollbackPlan(historyId);
        const rollbackTime = Date.now() - startTime;
        
        if (response.rollbackTime) {
            console.log(`Plan restauré en ${response.rollbackTime} (SLA <3s: ${response.slaMet ? '✅' : '❌'})`);
        }
        
        alert(`Plan restauré avec succès ! (${rollbackTime}ms)`);
        
        // Fermer les modals
        closeHistoryModal();
        closeEditPlanModal();
        
        // Recharger l'affichage du plan
        if (typeof displayWorkoutPlan === 'function') {
            if (response.plan) {
                await displayWorkoutPlan(response.plan);
            } else {
                const planResponse = await api.getPlan();
                if (planResponse.plan) {
                    await displayWorkoutPlan(planResponse.plan);
                }
            }
        }
    } catch (error) {
        console.error('Erreur roll-back:', error);
        alert('Erreur lors de la restauration: ' + error.message);
    }
};

// Initialisation des event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Bouton modifier le plan
    const btnEditPlan = document.getElementById('btn-edit-plan');
    if (btnEditPlan) {
        btnEditPlan.addEventListener('click', openEditPlanModal);
    }
    
    // Bouton sauvegarder
    const btnSavePlan = document.getElementById('btn-save-plan');
    if (btnSavePlan) {
        btnSavePlan.addEventListener('click', saveEditedPlan);
    }
    
    // Bouton annuler
    const btnCancelEdit = document.getElementById('btn-cancel-edit');
    if (btnCancelEdit) {
        btnCancelEdit.addEventListener('click', closeEditPlanModal);
    }
    
    // Bouton voir historique
    const btnViewHistory = document.getElementById('btn-view-history');
    if (btnViewHistory) {
        btnViewHistory.addEventListener('click', showPlanHistory);
    }
    
    // Fermer les modals avec le bouton X
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    // Fermer les modals en cliquant en dehors
    window.addEventListener('click', function(event) {
        const editModal = document.getElementById('edit-plan-modal');
        const historyModal = document.getElementById('plan-history-modal');
        
        if (event.target === editModal) {
            closeEditPlanModal();
        }
        if (event.target === historyModal) {
            closeHistoryModal();
        }
    });
});

// Exposer les fonctions globalement
window.openEditPlanModal = openEditPlanModal;
window.closeEditPlanModal = closeEditPlanModal;
window.showPlanHistory = showPlanHistory;

