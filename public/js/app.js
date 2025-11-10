// Application principale
let userProfile = null;
let userPreferences = null;

async function loadDashboard() {
    // Vérifier qu'on a un token avant de faire des requêtes
    if (!localStorage.getItem('token')) {
        return; // Ne rien faire si pas de token
    }
    
    try {
        // Charger le profil
        userProfile = await api.getProfile();
        const username = userProfile?.name || 'Athlète';
        const usernameEl = document.getElementById('dashboard-username');
        if (usernameEl) {
            usernameEl.textContent = username;
        }
        
        // Charger le plan d'entraînement
        try {
            const planData = await api.getPlan();
            
            // Afficher le plan
            const preview = document.getElementById('workout-plan-preview');
            const planDays = document.getElementById('dashboard-plan-days');
            const heroPlan = document.getElementById('dashboard-hero-plan');
            if (preview) {
                if (planData && planData.plan) {
                    const plan = planData.plan;
                    const levelLabel = capitalize(plan.level);
                    preview.innerHTML = `
                        <p><strong>Niveau:</strong> ${levelLabel}</p>
                        <p><strong>Objectif clé:</strong> ${plan.goals || 'Personnalisation globale'}</p>
                        <p><strong>Durée:</strong> ${plan.duration || '4 semaines'}</p>
                    `;
                    if (heroPlan) {
                        heroPlan.textContent = levelLabel || 'Personnalisé';
                    }
                    if (planDays) {
                        planDays.innerHTML = buildPlanDays(plan.weeklyPlan);
                    }
                } else {
                    preview.innerHTML = '<p>Aucun plan généré. Créez-en un pour commencer!</p>';
                    if (heroPlan) heroPlan.textContent = 'Aucun';
                    if (planDays) planDays.innerHTML = `<p class="muted">Génère ton plan pour visualiser les séances de la semaine.</p>`;
                }
            }
        } catch (planError) {
            // Si erreur de chargement du plan, afficher message
            const preview = document.getElementById('workout-plan-preview');
            if (preview) {
                preview.innerHTML = '<p>Aucun plan généré. Créez-en un pour commencer!</p>';
            }
            const planDays = document.getElementById('dashboard-plan-days');
            if (planDays) {
                planDays.innerHTML = `<p class="muted">Impossible de charger le plan. Réessaie plus tard.</p>`;
            }
        }

        // Charger l'historique des séances
        try {
            const sessions = await api.getSessionHistory();
            const totalSessions = sessions ? sessions.length : 0;
            const heroSessions = document.getElementById('dashboard-hero-sessions');
            const heroLast = document.getElementById('dashboard-hero-last');
            const heroMessage = document.getElementById('dashboard-hero-message');

            if (heroSessions) {
                heroSessions.textContent = totalSessions;
            }

            let lastSessionDate = null;
            if (sessions && sessions.length > 0) {
                lastSessionDate = new Date(sessions[0].completed_at);
                if (heroLast) {
                    heroLast.textContent = lastSessionDate.toLocaleDateString('fr-FR');
                }
            } else if (heroLast) {
                heroLast.textContent = '-';
            }

            if (heroMessage) {
                if (totalSessions === 0) {
                    heroMessage.textContent = 'Tu n’as pas encore lancé de séance. Génère un plan ou explore le catalogue pour démarrer 💥';
                } else if (lastSessionDate) {
                    const daysSince = Math.floor((Date.now() - lastSessionDate.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysSince === 0) {
                        heroMessage.textContent = 'Super séance aujourd’hui ! Tu peux en planifier une autre ou laisser ton corps récupérer intelligemment.';
                    } else if (daysSince === 1) {
                        heroMessage.textContent = 'Dernière séance hier – parfait pour garder le rythme. On remet ça ?';
                    } else {
                        heroMessage.textContent = `Il y a ${daysSince} jours depuis ta dernière séance. Relance une session pour rester constant 🔥`;
                    }
                }
            }

            updateProgressSummaryFromSessions(sessions);
        } catch (sessionError) {
            const heroSessions = document.getElementById('dashboard-hero-sessions');
            const heroLast = document.getElementById('dashboard-hero-last');
            const heroMessage = document.getElementById('dashboard-hero-message');
            if (heroSessions) heroSessions.textContent = '0';
            if (heroLast) heroLast.textContent = '-';
            if (heroMessage) heroMessage.textContent = 'Impossible de charger ta progression pour le moment. Réessaie plus tard.';
        }

        await updateProgressSummaryFromHistory();
    } catch (error) {
        // Si erreur d'authentification, rediriger vers login
        if (error.message.includes('Session expirée') || error.message.includes('Token')) {
            api.logout();
            showLogin();
        } else {
            console.error('Erreur chargement dashboard:', error);
        }
    }
}

function capitalize(value) {
    if (!value || typeof value !== 'string') return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildPlanDays(weeklyPlan = {}) {
    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayMap = {
        monday: 'Lundi',
        tuesday: 'Mardi',
        wednesday: 'Mercredi',
        thursday: 'Jeudi',
        friday: 'Vendredi',
        saturday: 'Samedi',
        sunday: 'Dimanche'
    };

    const upcoming = dayOrder
        .filter(day => weeklyPlan[day] && weeklyPlan[day].length > 0)
        .slice(0, 3);

    if (upcoming.length === 0) {
        return `<p class="muted">Ton plan est prêt. Lance une séance pour débloquer tes prochaines recommandations.</p>`;
    }

    return upcoming.map(day => {
        const exercises = weeklyPlan[day];
        const titles = exercises.slice(0, 2).map(ex => ex.name).join(', ');
        const more = exercises.length > 2 ? ` +${exercises.length - 2}` : '';
        return `
            <div class="plan-day">
                <strong>${dayMap[day]}</strong>
                <span>${titles}${more}</span>
            </div>
        `;
    }).join('');
}

function updateProgressSummaryFromSessions(sessions = []) {
    if (!Array.isArray(sessions) || sessions.length === 0) {
        setProgressSummary('--', '--', '--');
        return;
    }

    let postureSum = 0;
    let durationSum = 0;
    let sessionsLastWeek = 0;
    const now = Date.now();
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);

    sessions.forEach(session => {
        const date = new Date(session.completed_at);
        const data = safeSessionData(session);
        postureSum += session.posture_score || 0;
        durationSum += data.duration || 0;
        if (date.getTime() >= weekAgo) {
            sessionsLastWeek += 1;
        }
    });

    const avgPosture = Math.round(postureSum / sessions.length) || 0;
    const durationLabel = formatDurationLabel(Math.round(durationSum / 60));
    const frequencyLabel = sessionsLastWeek > 0 ? `${sessionsLastWeek}/7j` : 'Occasionnel';

    setProgressSummary(`${avgPosture}/100`, durationLabel, frequencyLabel);
}

async function updateProgressSummaryFromHistory() {
    try {
        const progress = await api.getProgress();
        if (Array.isArray(progress) && progress.length > 0) {
            const metrics = progress[0]?.metrics || {};
            if (metrics.avgPostureScore || metrics.totalDuration || metrics.sessionsCount) {
                const avg = metrics.avgPostureScore ? `${Math.round(metrics.avgPostureScore)}/100` : null;
                const totalDuration = metrics.totalDuration ? formatDurationLabel(Math.round(metrics.totalDuration / 60)) : null;
                const frequency = metrics.sessionsCount ? `${metrics.sessionsCount}/jour` : null;
                setProgressSummary(avg, totalDuration, frequency);
            }
        }
    } catch (error) {
        console.warn('Impossible de charger les métriques de progression détaillées:', error);
    }
}

function setProgressSummary(score, volume, frequency) {
    const scoreEl = document.getElementById('dashboard-progress-score');
    const volumeEl = document.getElementById('dashboard-progress-volume');
    const freqEl = document.getElementById('dashboard-progress-frequency');
    if (scoreEl) scoreEl.textContent = score || '--';
    if (volumeEl) volumeEl.textContent = volume || '--';
    if (freqEl) freqEl.textContent = frequency || '--';
}

function formatDurationLabel(totalMinutes) {
    if (!totalMinutes || totalMinutes <= 0) {
        return '0 min';
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
        return `${hours}h ${minutes} min`;
    }
    return `${minutes} min`;
}

function safeSessionData(session) {
    if (!session) return {};
    if (typeof session.session_data === 'object') {
        return session.session_data || {};
    }
    if (typeof session.session_data === 'string') {
        try {
            return JSON.parse(session.session_data);
        } catch (error) {
            return {};
        }
    }
    return {};
}

// Fonction pour appliquer la langue (FR-03)
function applyLanguage(lang) {
    if (!lang) return;
    
    const translations = {
        fr: {
            'nav-dashboard': 'Tableau de bord',
            'nav-exercises': 'Exercices',
            'nav-profile': 'Profil',
            'nav-progress': 'Progression',
            'nav-chat': 'Chat Coach',
            'nav-logout': 'Déconnexion',
            'dashboard-title': 'Tableau de bord',
            'profile-title': 'Profil',
            'preferences-title': 'Préférences',
            'pref-dark-mode-label': 'Mode sombre',
            'pref-sounds-label': 'Sons',
            'pref-notifications-label': 'Notifications',
            'pref-weight-unit-label': 'Unités de poids',
            'pref-height-unit-label': 'Unités de taille',
            'pref-language-label': 'Langue',
            'btn-save': 'Enregistrer',
            'btn-generate-plan': 'Générer un plan',
            'btn-view-plan': 'Voir le plan',
            'btn-start-workout': 'Commencer une séance',
            'btn-evaluate-posture': 'Évaluation posturale'
        },
        en: {
            'nav-dashboard': 'Dashboard',
            'nav-exercises': 'Exercises',
            'nav-profile': 'Profile',
            'nav-progress': 'Progress',
            'nav-chat': 'Coach Chat',
            'nav-logout': 'Logout',
            'dashboard-title': 'Dashboard',
            'profile-title': 'Profile',
            'preferences-title': 'Preferences',
            'pref-dark-mode-label': 'Dark mode',
            'pref-sounds-label': 'Sounds',
            'pref-notifications-label': 'Notifications',
            'pref-weight-unit-label': 'Weight units',
            'pref-height-unit-label': 'Height units',
            'pref-language-label': 'Language',
            'btn-save': 'Save',
            'btn-generate-plan': 'Generate plan',
            'btn-view-plan': 'View plan',
            'btn-start-workout': 'Start workout',
            'btn-evaluate-posture': 'Posture evaluation'
        }
    };
    
    const texts = translations[lang] || translations.fr;
    
    // Mettre à jour les éléments avec des data-i18n ou des IDs spécifiques
    Object.keys(texts).forEach(key => {
        const element = document.getElementById(key);
        if (element) {
            if (element.tagName === 'LABEL' || element.tagName === 'BUTTON' || element.tagName === 'A') {
                element.textContent = texts[key];
            } else if (element.tagName === 'H2' || element.tagName === 'H3') {
                element.textContent = texts[key];
            }
        }
    });
    
    // Mettre à jour l'attribut lang du document
    document.documentElement.lang = lang;
    
    // Stocker la langue dans localStorage pour persistance
    localStorage.setItem('app_language', lang);
}

async function loadProfile() {
    try {
        userProfile = await api.getProfile();
        userPreferences = await api.getPreferences();

        // Remplir le formulaire de profil
        if (userProfile) {
            const nameInput = document.getElementById('profile-name');
            const ageInput = document.getElementById('profile-age');
            const weightInput = document.getElementById('profile-weight');
            const heightInput = document.getElementById('profile-height');
            const levelSelect = document.getElementById('profile-level');
            const goalsInput = document.getElementById('profile-goals');
            const constraintsInput = document.getElementById('profile-constraints');

            if (nameInput && userProfile.name != null) nameInput.value = userProfile.name;
            if (ageInput && userProfile.age != null) ageInput.value = userProfile.age;
            if (weightInput && userProfile.weight != null) weightInput.value = userProfile.weight;
            if (heightInput && userProfile.height != null) heightInput.value = userProfile.height;
            if (levelSelect && userProfile.fitness_level) levelSelect.value = userProfile.fitness_level;
            if (goalsInput && userProfile.goals != null) goalsInput.value = userProfile.goals;
            if (constraintsInput && userProfile.constraints != null) constraintsInput.value = userProfile.constraints;
        }

        // Remplir les préférences
        if (userPreferences) {
            document.getElementById('pref-dark-mode').checked = userPreferences.dark_mode === 1;
            document.getElementById('pref-sounds').checked = userPreferences.sounds === 1;
            const notificationsEnabled = userPreferences.notifications === 1;
            document.getElementById('pref-notifications').checked = notificationsEnabled;
            
            // Afficher/masquer les paramètres de notifications
            const notificationSettings = document.getElementById('notification-settings');
            if (notificationSettings) {
                notificationSettings.style.display = notificationsEnabled ? 'block' : 'none';
            }
            
            // Remplir les préférences de notifications (FR-13)
            if (userPreferences.notification_time) {
                document.getElementById('pref-notification-time').value = userPreferences.notification_time;
            }
            if (userPreferences.notification_days) {
                try {
                    const days = JSON.parse(userPreferences.notification_days);
                    document.querySelectorAll('.notification-day').forEach(checkbox => {
                        checkbox.checked = days.includes(parseInt(checkbox.value));
                    });
                } catch (e) {
                    console.error('Erreur parsing notification_days:', e);
                }
            }
            
            if (userPreferences.weight_unit) {
                document.getElementById('pref-weight-unit').value = userPreferences.weight_unit;
            }
            if (userPreferences.height_unit) {
                document.getElementById('pref-height-unit').value = userPreferences.height_unit;
            }
            if (userPreferences.language) {
                document.getElementById('pref-language').value = userPreferences.language;
                applyLanguage(userPreferences.language);
            }
        }

        // Appliquer le mode sombre
        if (userPreferences && userPreferences.dark_mode === 1) {
            document.body.classList.add('dark-mode');
        }

        // Afficher les informations de consentement (Loi 25)
        displayConsentInfo();
    } catch (error) {
        console.error('Erreur chargement profil:', error);
    }
}

function displayConsentInfo() {
    const consentInfo = document.getElementById('consent-info');
    if (!consentInfo) return;

    const consentData = getConsentData();
    if (consentData && consentData.given) {
        const consentDate = new Date(consentData.date);
        consentInfo.innerHTML = `
            <p><strong>Consentement donné le :</strong> ${consentDate.toLocaleDateString('fr-FR')} à ${consentDate.toLocaleTimeString('fr-FR')}</p>
            <p><strong>Version du formulaire :</strong> ${consentData.version || 'N/A'}</p>
            <p><strong>Conforme Loi 25 :</strong> Oui</p>
        `;
    } else {
        consentInfo.innerHTML = '<p>Aucun consentement enregistré.</p>';
    }
}

function getConsentData() {
    const consentStr = localStorage.getItem('consent-data');
    if (!consentStr) return null;
    try {
        return JSON.parse(consentStr);
    } catch (error) {
        return null;
    }
}

async function loadProgress() {
    // La fonction loadProgressCharts() gère maintenant l'affichage complet (FR-12)
    // Cette fonction est conservée pour compatibilité mais peut être supprimée
    if (typeof loadProgressCharts === 'function') {
        await loadProgressCharts();
    }
}

// Chat IA avec streaming (FR-14)
function initChat() {
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const btnSend = document.getElementById('btn-send-chat');
    let currentMessageDiv = null; // Pour le streaming (FR-14)

    function addMessage(text, isUser, isStreaming = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${isUser ? 'user' : 'coach'}`;
        if (isStreaming) {
            messageDiv.classList.add('streaming');
        }
        messageDiv.textContent = text;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return messageDiv;
    }

    function updateMessage(messageDiv, text) {
        if (messageDiv) {
            messageDiv.textContent = text;
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    async function loadQuickSuggestions() {
        const existing = document.querySelector('.chat-quick-suggestions');
        if (existing) {
            existing.remove();
        }

        let suggestions = [
            'Comment améliorer ma technique ?',
            'Conseils nutrition personnalisés',
            'Comment rester motivé ?',
            'Plan d’entraînement optimal'
        ];

        try {
            const data = await api.getChatSuggestions();
            if (data && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
                suggestions = data.suggestions;
            }
        } catch (error) {
            console.warn('Suggestions IA indisponibles, utilisation du fallback:', error.message);
        }

        const suggestionsDiv = document.createElement('div');
        suggestionsDiv.className = 'chat-quick-suggestions';
        suggestionsDiv.innerHTML = '<div class="suggestions-label">Suggestions rapides:</div>';

        suggestions.forEach(suggestion => {
            const btn = document.createElement('button');
            btn.className = 'suggestion-btn';
            btn.textContent = suggestion;
            btn.addEventListener('click', () => {
                chatInput.value = suggestion;
                sendMessage();
            });
            suggestionsDiv.appendChild(btn);
        });

        chatMessages.appendChild(suggestionsDiv);
    }

    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) {
            console.warn('Message vide, envoi annulé');
            return;
        }

        console.log('Envoi du message:', message);

        // Désactiver l'input pendant l'envoi
        chatInput.disabled = true;
        btnSend.disabled = true;

        // Afficher le message de l'utilisateur
        addMessage(message, true);
        chatInput.value = '';

        // Retirer les suggestions rapides après le premier message
        const suggestionsDiv = chatMessages.querySelector('.chat-quick-suggestions');
        if (suggestionsDiv) {
            suggestionsDiv.remove();
        }

        // Créer un div pour la réponse en streaming (FR-14)
        currentMessageDiv = addMessage('', false, true);
        const startTime = Date.now();
        let responseReceived = false;

        try {
            console.log('Appel API sendChatMessage...');
            const result = await api.sendChatMessage(
                message,
                // Callback pour chaque chunk (streaming) (FR-14)
                (chunk, fullText) => {
                    console.log('Chunk reçu:', chunk);
                    responseReceived = true;
                    if (currentMessageDiv) {
                        updateMessage(currentMessageDiv, fullText);
                    }
                },
                // Callback quand terminé (FR-14)
                (result) => {
                    console.log('Réponse complète reçue:', result);
                    responseReceived = true;
                    if (currentMessageDiv) {
                        currentMessageDiv.classList.remove('streaming');
                        const responseText = result.response || result.message || 'Aucune réponse reçue';
                        updateMessage(currentMessageDiv, responseText);
                        
                        // Afficher les métriques si disponibles
                        if (result.firstTokenTime) {
                            const metricsDiv = document.createElement('div');
                            metricsDiv.className = 'chat-metrics';
                            metricsDiv.textContent = `Premier token: ${result.firstTokenTime}ms (SLA <2s: ${result.slaMet ? '✅' : '❌'})`;
                            currentMessageDiv.appendChild(metricsDiv);
                        }
                    }
                }
            );
            
            // Si onComplete n'a pas été appelé mais qu'on a un résultat, l'afficher
            if (result && result.response && currentMessageDiv && !responseReceived) {
                console.log('Affichage résultat direct:', result);
                currentMessageDiv.classList.remove('streaming');
                updateMessage(currentMessageDiv, result.response);
                responseReceived = true;
            }
        } catch (error) {
            console.error('Erreur chat:', error);
            if (currentMessageDiv) {
                currentMessageDiv.classList.remove('streaming');
                const errorMsg = error.message || 'Désolé, une erreur est survenue. Veuillez réessayer.';
                updateMessage(currentMessageDiv, errorMsg);
            } else {
                addMessage('Désolé, une erreur est survenue. Veuillez réessayer.', false);
            }
        } finally {
            // S'assurer qu'on affiche quelque chose si aucune réponse n'a été reçue
            if (!responseReceived && currentMessageDiv) {
                console.warn('Aucune réponse reçue, affichage message par défaut');
                currentMessageDiv.classList.remove('streaming');
                updateMessage(currentMessageDiv, 'En attente de réponse...');
            }
            
            // Réactiver l'input
            chatInput.disabled = false;
            btnSend.disabled = false;
            chatInput.focus();
            currentMessageDiv = null;
        }
    }

    btnSend.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Message de bienvenue
    addMessage('Bonjour! Je suis Alen, votre coach virtuel. Comment puis-je vous aider aujourd\'hui?', false);
    
    loadQuickSuggestions();
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Dashboard
    document.getElementById('nav-dashboard')?.addEventListener('click', loadDashboard);
    document.getElementById('btn-generate-plan')?.addEventListener('click', async () => {
        try {
            const btn = document.getElementById('btn-generate-plan');
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Génération en cours...';
            }
            
            const profile = await api.getProfile();
            const extendedProfile = await api.getExtendedProfile().catch(() => null);
            
            const startTime = Date.now();
            const data = await api.generatePlan(profile);
            const generationTime = Date.now() - startTime;
            
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Générer un plan';
            }
            
            const slaMet = generationTime <= 5000;
            
            // Afficher automatiquement la page d'entraînement avec le plan généré
            if (data && data.plan) {
                showPage('workout');
                // Charger et afficher le plan
                if (typeof displayWorkoutPlan === 'function') {
                    await displayWorkoutPlan(data.plan);
                } else {
                    // Si la fonction n'est pas encore chargée, attendre un peu
                    setTimeout(async () => {
                        const plan = await loadWorkoutPlan();
                        if (plan && typeof displayWorkoutPlan === 'function') {
                            await displayWorkoutPlan(plan);
                        }
                    }, 100);
                }
            } else {
                alert(`Plan généré avec succès en ${generationTime}ms! ${slaMet ? '✅' : '⚠️'}`);
                loadDashboard();
            }
        } catch (error) {
            const btn = document.getElementById('btn-generate-plan');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Générer un plan';
            }
            alert('Erreur: ' + error.message);
        }
    });
    document.getElementById('btn-view-plan')?.addEventListener('click', async () => {
        showPage('workout');
        // Charger et afficher le plan
        if (typeof loadWorkoutPlan === 'function' && typeof displayWorkoutPlan === 'function') {
            const plan = await loadWorkoutPlan();
            await displayWorkoutPlan(plan);
        } else {
            // Si les fonctions ne sont pas encore chargées, attendre un peu
            setTimeout(async () => {
                if (typeof loadWorkoutPlan === 'function' && typeof displayWorkoutPlan === 'function') {
                    const plan = await loadWorkoutPlan();
                    await displayWorkoutPlan(plan);
                }
            }, 100);
        }
    });
    document.getElementById('btn-start-workout')?.addEventListener('click', () => {
        showPage('workout');
    });
    document.getElementById('btn-evaluate-posture')?.addEventListener('click', () => {
        showPage('posture-eval');
    });
    document.getElementById('btn-open-catalog')?.addEventListener('click', () => {
        showPage('exercises-catalog');
    });
    document.getElementById('btn-open-chat')?.addEventListener('click', () => {
        showPage('chat');
    });
    document.getElementById('btn-go-progress')?.addEventListener('click', () => {
        showPage('progress');
    });

    // Profil
    document.getElementById('nav-profile')?.addEventListener('click', () => {
        loadProfile();
        if (typeof loadExtendedProfile === 'function') {
            loadExtendedProfile();
        }
    });
    // Toggle des paramètres de notifications (FR-13)
    document.getElementById('pref-notifications')?.addEventListener('change', (e) => {
        const notificationSettings = document.getElementById('notification-settings');
        if (notificationSettings) {
            notificationSettings.style.display = e.target.checked ? 'block' : 'none';
        }
    });

    const collectProfileFormData = () => {
        const parseIntOrNull = (value) => {
            if (value === undefined || value === null || value === '') return null;
            const parsed = parseInt(value, 10);
            return Number.isNaN(parsed) ? null : parsed;
        };
        const parseFloatOrNull = (value) => {
            if (value === undefined || value === null || value === '') return null;
            const parsed = parseFloat(value);
            return Number.isNaN(parsed) ? null : parsed;
        };
        const sanitizeText = (value) => {
            if (value === undefined || value === null) return null;
            const trimmed = value.trim();
            return trimmed.length ? trimmed : null;
        };

        return {
            name: sanitizeText(document.getElementById('profile-name').value),
            age: parseIntOrNull(document.getElementById('profile-age').value),
            weight: parseFloatOrNull(document.getElementById('profile-weight').value),
            height: parseIntOrNull(document.getElementById('profile-height').value),
            fitness_level: document.getElementById('profile-level').value,
            goals: sanitizeText(document.getElementById('profile-goals').value),
            constraints: sanitizeText(document.getElementById('profile-constraints').value)
        };
    };

    const collectPreferencesFormData = () => {
        const notificationsEnabled = document.getElementById('pref-notifications').checked;
        const notificationDays = Array.from(document.querySelectorAll('.notification-day:checked'))
            .map(cb => parseInt(cb.value, 10));
        const notificationTime = document.getElementById('pref-notification-time').value;
        const language = document.getElementById('pref-language').value;

        return {
            dark_mode: document.getElementById('pref-dark-mode').checked ? 1 : 0,
            weight_unit: document.getElementById('pref-weight-unit').value,
            height_unit: document.getElementById('pref-height-unit').value,
            language,
            sounds: document.getElementById('pref-sounds').checked ? 1 : 0,
            notifications: notificationsEnabled ? 1 : 0,
            notification_time: notificationsEnabled ? notificationTime : null,
            notification_days: notificationsEnabled ? notificationDays : null
        };
    };

    const applyPreferenceSideEffects = (preferences) => {
        if (preferences.dark_mode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }

        if (preferences.language && typeof applyLanguage === 'function') {
            applyLanguage(preferences.language);
        }

        if (preferences.notifications && typeof initNotifications === 'function') {
            setTimeout(() => {
                initNotifications();
            }, 500);
        }
    };

    document.getElementById('btn-save-profile-all')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-save-profile-all');
        if (!btn) return;

        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Enregistrement en cours...';

        try {
            const profileData = collectProfileFormData();
            await api.updateProfile(profileData);

            const preferencesData = collectPreferencesFormData();
            await api.updatePreferences(preferencesData);
            applyPreferenceSideEffects(preferencesData);

            if (typeof saveExtendedProfile === 'function') {
                await saveExtendedProfile({ silent: true });
            }

            await loadProfile();
            if (typeof loadExtendedProfile === 'function') {
                await loadExtendedProfile();
            }

            if (typeof advanceWorkflow === 'function') {
                setTimeout(() => {
                    advanceWorkflow();
                }, 300);
            }

            btn.textContent = 'Génération du plan...';

            const profile = await api.getProfile();
            const startTime = Date.now();
            const data = await api.generatePlan(profile);
            const generationTime = Date.now() - startTime;
            const slaMet = generationTime <= 5000;

            btn.textContent = originalText;
            btn.disabled = false;

            if (data && data.plan) {
                showPage('workout');
                if (typeof displayWorkoutPlan === 'function') {
                    await displayWorkoutPlan(data.plan);
                } else {
                    setTimeout(async () => {
                        const plan = await loadWorkoutPlan();
                        if (plan && typeof displayWorkoutPlan === 'function') {
                            await displayWorkoutPlan(plan);
                        }
                    }, 100);
                }
            } else {
                alert(`Profil enregistré et plan généré en ${generationTime}ms ! ${slaMet ? '✅' : '⚠️'}`);
                loadDashboard();
            }
        } catch (error) {
            console.error('Erreur sauvegarde profil complet:', error);
            alert('Erreur: ' + (error?.message || 'Impossible de sauvegarder le profil'));
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });

    // Gestion des droits Loi 25
    document.getElementById('btn-access-data')?.addEventListener('click', () => {
        if (typeof accessPersonalData === 'function') {
            accessPersonalData();
        } else {
            alert('Fonctionnalité en cours de chargement...');
        }
    });

    document.getElementById('btn-withdraw-consent')?.addEventListener('click', () => {
        if (typeof withdrawConsent === 'function') {
            withdrawConsent();
        } else {
            alert('Fonctionnalité en cours de chargement...');
        }
    });

    document.getElementById('btn-delete-account')?.addEventListener('click', async () => {
        if (confirm('⚠️ ATTENTION: Cette action est irréversible. Toutes vos données seront supprimées définitivement conformément à la Loi 25. Êtes-vous sûr ?')) {
            if (confirm('Dernière confirmation: Supprimer définitivement votre compte et toutes vos données ?')) {
                try {
                    const response = await fetch('/api/user/account', {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${localStorage.getItem('token')}`
                        }
                    });
                    
                    if (response.ok) {
                        alert('Votre compte et toutes vos données ont été supprimés.');
                        api.logout();
                        showLogin();
                    } else {
                        const error = await response.json();
                        alert('Erreur: ' + (error.error || 'Impossible de supprimer le compte'));
                    }
                } catch (error) {
                    alert('Erreur: ' + error.message);
                }
            }
        }
    });


    // Progression
    document.getElementById('nav-progress')?.addEventListener('click', () => {
        loadProgress();
        if (typeof loadProgressCharts === 'function') {
            loadProgressCharts();
        }
    });

    // Chat
    document.getElementById('nav-chat')?.addEventListener('click', initChat);

    // Ne pas charger le dashboard automatiquement - sera chargé après authentification
    // loadDashboard() sera appelé par showApp() dans auth.js
});


