// Bilan post-séance et conseils IA (FR-11)
let currentSessionData = null;

async function showPostSessionModal(sessionData) {
    currentSessionData = sessionData;
    const modal = document.getElementById('post-session-modal');
    const statsDiv = document.getElementById('session-stats');
    const adviceContent = document.getElementById('ai-advice-content');
    
    if (!modal) return;

    // Afficher le modal immédiatement
    modal.style.display = 'flex';
    modal.classList.add('active');

    // Calculer les statistiques détaillées (FR-11)
    const duration = sessionData.duration || 0;
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    const exercisesCount = sessionData.workout?.exercises?.length || 0;
    const exercisesCompleted = sessionData.exercisesCompleted || 0;
    const postureScore = sessionData.postureScore || 0;
    const completionRate = exercisesCount > 0 ? Math.round((exercisesCompleted / exercisesCount) * 100) : 0;

    // Résumé automatique amélioré (FR-11)
    if (statsDiv) {
        let summaryText = '';
        if (completionRate >= 100) {
            summaryText = '✅ Séance complète! Excellent travail.';
        } else if (completionRate >= 80) {
            summaryText = '✓ Bonne séance, presque complète.';
        } else if (completionRate >= 50) {
            summaryText = '⚠️ Séance partielle. Continuez vos efforts.';
        } else {
            summaryText = '💪 Début de séance. Persévérez!';
        }

        statsDiv.innerHTML = `
            <div class="session-summary-header">
                <h4>${summaryText}</h4>
            </div>
            <div class="session-stats-grid">
                <div class="stat-item">
                    <span class="stat-label">Durée</span>
                    <span class="stat-value">${minutes}min ${seconds}s</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Exercices</span>
                    <span class="stat-value">${exercisesCompleted}/${exercisesCount}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Score postural</span>
                    <span class="stat-value ${postureScore >= 80 ? 'excellent' : postureScore >= 60 ? 'good' : 'fair'}">${postureScore}/100</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Taux de complétion</span>
                    <span class="stat-value">${completionRate}%</span>
                </div>
            </div>
        `;
    }

    // Générer des conseils IA avec SLA ≤3s (FR-11)
    await generateAIAdvice(sessionData);

    // Gérer le slider de difficulté
    const difficultySlider = document.getElementById('difficulty-level');
    const difficultyText = document.getElementById('difficulty-text');
    
    if (difficultySlider && difficultyText) {
        const labels = ['Très facile', 'Facile', 'Moyen', 'Difficile', 'Très difficile'];
        difficultySlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            difficultyText.textContent = labels[value - 1];
        });
    }

    // Gérer le slider RPE (Rate of Perceived Exertion) - FR-11
    const rpeSlider = document.getElementById('rpe-level');
    const rpeText = document.getElementById('rpe-text');
    
    if (rpeSlider && rpeText) {
        const rpeLabels = ['1 - Très facile', '2 - Facile', '3 - Modéré', '4 - Un peu dur', '5 - Dur', 
                          '6 - Très dur', '7 - Extrêmement dur', '8 - Maximum', '9 - Maximum+', '10 - Maximum absolu'];
        rpeSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            rpeText.textContent = rpeLabels[value - 1];
        });
    }
}

async function generateAIAdvice(sessionData) {
    const adviceContent = document.getElementById('ai-advice-content');
    if (!adviceContent) return;

    const startTime = Date.now();
    adviceContent.innerHTML = '<div class="advice-loading"><p>Génération des conseils personnalisés...</p><div class="loading-spinner"></div></div>';

    try {
        // Récupérer le profil et le profil étendu pour le contexte
        const [profile, extendedProfile] = await Promise.all([
            api.getProfile().catch(() => null),
            api.getExtendedProfile().catch(() => null)
        ]);

        // Générer les conseils IA avec SLA ≤3s (FR-11)
        const adviceResponse = await api.generatePostSessionAdvice(
            sessionData,
            profile || {},
            extendedProfile || {}
        );

        const generationTime = Date.now() - startTime;
        
        // Afficher les conseils
        if (adviceResponse.advice && adviceResponse.advice.length > 0) {
            const adviceList = Array.isArray(adviceResponse.advice) 
                ? adviceResponse.advice 
                : [adviceResponse.advice];
            
            adviceContent.innerHTML = `
                <div class="advice-header">
                    <p><strong>Conseils personnalisés</strong> 
                    ${adviceResponse.generatedBy === 'ai' ? '🤖' : '📋'}
                    <span class="advice-time">(${adviceResponse.generationTime || generationTime}ms)</span>
                    </p>
                </div>
                <ul class="advice-list">
                    ${adviceList.map(advice => `<li>${advice}</li>`).join('')}
                </ul>
                ${adviceResponse.slaMet === false ? '<p class="advice-warning">⚠️ Génération plus lente que prévu</p>' : ''}
            `;
        } else {
            throw new Error('Aucun conseil généré');
        }
    } catch (error) {
        console.error('Erreur génération conseils:', error);
        
        // Fallback avec conseils génériques basés sur les données de la séance
        const postureScore = sessionData.postureScore || 0;
        const duration = sessionData.duration || 0;
        const exercisesCompleted = sessionData.exercisesCompleted || 0;
        
        let fallbackAdvice = [];
        
        if (postureScore >= 85) {
            fallbackAdvice.push('Excellent travail! Votre posture est excellente. Continuez à maintenir cette qualité d\'exécution.');
        } else if (postureScore >= 70) {
            fallbackAdvice.push('Bonne séance! Votre posture est correcte. Concentrez-vous sur l\'alignement pour améliorer encore.');
        } else {
            fallbackAdvice.push('Améliorez votre posture en gardant le dos droit et en alignant vos genoux avec vos chevilles.');
        }
        
        if (duration < 20 * 60) {
            fallbackAdvice.push('Séance courte. Pour de meilleurs résultats, visez au moins 20-30 minutes d\'entraînement.');
        }
        
        fallbackAdvice.push('Reposez-vous suffisamment entre les séances et restez hydraté.');
        
        adviceContent.innerHTML = `
            <div class="advice-header">
                <p><strong>Conseils généraux</strong> 📋</p>
            </div>
            <ul class="advice-list">
                ${fallbackAdvice.map(advice => `<li>${advice}</li>`).join('')}
            </ul>
        `;
    }
}

async function savePostSession() {
    const feeling = document.getElementById('session-feeling')?.value || '';
    const difficulty = document.getElementById('difficulty-level')?.value || 3;
    const rpe = document.getElementById('rpe-level')?.value || null; // RPE (FR-11)
    
    if (!currentSessionData) return;

    try {
        // Construire le feedback complet (FR-11)
        let fullFeedback = feeling;
        if (rpe) {
            fullFeedback += ` [RPE: ${rpe}/10]`;
        }
        if (difficulty) {
            fullFeedback += ` [Difficulté: ${difficulty}/5]`;
        }

        // Sauvegarder la séance avec le feedback complet
        await api.saveSession(
            currentSessionData,
            fullFeedback,
            currentSessionData.postureScore || 0
        );

        // Enregistrer les métriques de progression
        try {
            await api.saveProgress({
                sessionsCount: 1,
                totalDuration: currentSessionData.duration || 0,
                avgPostureScore: currentSessionData.postureScore || 0,
                rpe: rpe ? parseInt(rpe) : null,
                difficulty: parseInt(difficulty)
            });
        } catch (error) {
            console.error('Erreur sauvegarde progression:', error);
        }

        // Optimiser le plan si nécessaire (FR-15) avec tous les paramètres
        const optimizedPlan = await optimizeWorkoutPlan(difficulty, feeling, rpe);
        if (optimizedPlan) {
            console.log('Plan d\'entraînement optimisé selon vos retours');
        }

        // Fermer le modal
        const modal = document.getElementById('post-session-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active');
        }

        // Retourner au dashboard
        showPage('dashboard');
        if (typeof loadDashboard === 'function') {
            loadDashboard();
        }
        
        alert('Séance enregistrée avec succès!');
    } catch (error) {
        console.error('Erreur sauvegarde:', error);
        alert('Erreur lors de la sauvegarde');
    }
}

// Optimisation continue du plan améliorée (FR-15)
async function optimizeWorkoutPlan(difficulty, feedback, rpe) {
    try {
        // Appeler l'API d'optimisation avec tous les paramètres
        const response = await fetch('/api/workout/optimize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ feedback, difficulty, rpe })
        });

        if (response.ok) {
            const data = await response.json();
            console.log('Plan optimisé:', data);
            if (data.optimizationParams) {
                console.log('Paramètres d\'optimisation:', data.optimizationParams);
                console.log('Métriques:', data.metrics);
            }
            return data.plan;
        }
    } catch (error) {
        console.error('Erreur optimisation plan:', error);
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    const btnSaveSession = document.getElementById('btn-save-session');
    if (btnSaveSession) {
        btnSaveSession.addEventListener('click', savePostSession);
    }
});

// Fonction globale
window.showPostSessionModal = showPostSessionModal;

