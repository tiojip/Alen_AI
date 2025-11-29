// Gestion de l'authentification
let currentUser = null;
let isNewUser = false; // Flag pour indiquer si c'est un nouvel utilisateur

function resetConsentState() {
    localStorage.removeItem('consent-data');
    localStorage.removeItem('consent-given');
    const consentModal = document.getElementById('consent-modal');
    if (consentModal) {
        consentModal.classList.remove('active');
        consentModal.scrollTop = 0;
    }
    const consentCheckbox = document.getElementById('consent-checkbox');
    const consentAccept = document.getElementById('consent-accept');
    if (consentCheckbox) {
        consentCheckbox.checked = false;
    }
    if (consentAccept) {
        consentAccept.disabled = true;
    }
}

// Vérifier si le profil est complet (workflow nouveau utilisateur)
async function isProfileComplete() {
    try {
        const profile = await api.getProfile();
        // Vérifier les champs essentiels (utiliser birthdate au lieu de age)
        return !!(
            (profile.birthdate || profile.age) &&
            profile.weight &&
            profile.height &&
            profile.fitness_level &&
            profile.goals
        );
    } catch (error) {
        console.error('Erreur vérification profil:', error);
        return false;
    }
}

// Vérifier si l'évaluation posturale a été faite (workflow nouveau utilisateur)
async function hasPostureEvaluation() {
    try {
        const sessions = await api.getSessionHistory();
        // Chercher une session d'évaluation posturale
        return sessions.some(session => {
            if (session.session_data) {
                try {
                    const data = JSON.parse(session.session_data);
                    return data.type === 'posture_evaluation';
                } catch (e) {
                    return false;
                }
            }
            return false;
        });
    } catch (error) {
        console.error('Erreur vérification évaluation:', error);
        return false;
    }
}

// Déterminer la prochaine étape du workflow (workflow nouveau utilisateur)
async function getNextWorkflowStep() {
    // Si ce n'est pas un nouvel utilisateur, accéder directement au dashboard
    if (!isNewUser) {
        return 'dashboard';
    }

    const consentData = typeof getConsentData === 'function' ? getConsentData() : null;
    const consentVersion = typeof CONSENT_VERSION !== 'undefined' ? CONSENT_VERSION : null;

    if (!consentData || !consentData.given || (consentVersion && consentData.version !== consentVersion)) {
        return 'consent';
    }

    const profileComplete = await isProfileComplete();
    if (!profileComplete) {
        return 'profile'; // Étape 1: Compléter le profil
    }
    
    const evaluationDone = await hasPostureEvaluation();
    if (!evaluationDone) {
        return 'posture-eval'; // Étape 2: Faire l'évaluation posturale
    }
    
    return 'dashboard'; // Étape 3: Accéder au dashboard
}

async function initAuth() {
    console.log('initAuth appelé');
    
    // Attendre que le DOM soit complètement chargé
    if (document.readyState === 'loading') {
        await new Promise(resolve => {
            if (document.readyState === 'complete') {
                resolve();
            } else {
                document.addEventListener('DOMContentLoaded', resolve);
            }
        });
    }
    
    const token = localStorage.getItem('token');
    console.log('Token présent:', !!token);
    
    // Vérifier que les éléments existent
    const loginPage = document.getElementById('login-page');
    const appContainer = document.getElementById('app-container');
    
    if (!loginPage) {
        console.error('Élément login-page non trouvé dans initAuth!');
        return;
    }
    
    if (!appContainer) {
        console.error('Élément app-container non trouvé dans initAuth!');
        return;
    }
    
    // TOUJOURS commencer par la page de connexion/inscription au démarrage
    // Ne plus vérifier le token automatiquement - l'utilisateur doit se connecter manuellement
    console.log('Affichage de la page de connexion/inscription au démarrage');
    showLogin();
}

function showLogin() {
    console.log('showLogin appelé');
    const loginPage = document.getElementById('login-page');
    const appContainer = document.getElementById('app-container');
    
    if (!loginPage) {
        console.error('Élément login-page non trouvé!');
        return;
    }
    
    if (!appContainer) {
        console.error('Élément app-container non trouvé!');
        return;
    }
    
    // Masquer complètement l'application
    appContainer.classList.add('hidden');
    appContainer.style.display = 'none';
    appContainer.style.setProperty('display', 'none', 'important');
    
    // Afficher la page de login
    loginPage.style.display = 'flex';
    loginPage.style.setProperty('display', 'flex', 'important');
    loginPage.classList.add('active');
    loginPage.classList.remove('hidden');
    
    // Masquer toutes les pages de l'application
    hideAllPages();
    
    // Réinitialiser l'état du workflow
    isNewUser = false;
    
    // Nettoyer les messages de workflow s'ils existent
    const workflowMessage = document.getElementById('workflow-message');
    if (workflowMessage) {
        workflowMessage.remove();
    }
    
    console.log('Page de login affichée');
}

async function showApp() {
    console.log('showApp appelé');
    const loginPage = document.getElementById('login-page');
    const appContainer = document.getElementById('app-container');
    
    if (!loginPage) {
        console.error('Élément login-page non trouvé!');
        return;
    }
    
    if (!appContainer) {
        console.error('Élément app-container non trouvé!');
        return;
    }
    
    console.log('Masquage de la page de login...');
    // Masquer complètement la page de login
    loginPage.style.display = 'none';
    loginPage.classList.remove('active');
    loginPage.classList.add('hidden');
    
    console.log('Affichage de l\'application...');
    // Afficher l'application
    appContainer.classList.remove('hidden');
    appContainer.style.display = 'block';
    
    // Forcer l'affichage avec !important via style inline
    appContainer.style.setProperty('display', 'block', 'important');
    
    // Déterminer la prochaine étape du workflow (workflow nouveau utilisateur)
    const nextStep = await getNextWorkflowStep();
    console.log('Prochaine étape du workflow:', nextStep);
    
    if (nextStep === 'consent') {
        console.log('Affichage du consentement requis');
        showPage('profile');
        if (typeof loadProfile === 'function') {
            loadProfile();
        }
        if (typeof loadExtendedProfile === 'function') {
            loadExtendedProfile();
        }
        showWorkflowMessage('Bienvenue ! Merci de lire et accepter le formulaire de consentement pour continuer.');
        if (typeof initConsent === 'function') {
            initConsent();
        }
    } else if (nextStep === 'profile') {
        // Étape 1: Compléter le profil
        console.log('Redirection vers le profil (nouvel utilisateur)');
        showPage('profile');
        if (typeof loadProfile === 'function') {
            loadProfile();
        }
        if (typeof loadExtendedProfile === 'function') {
            loadExtendedProfile();
        }
        // Afficher un message d'aide
        showWorkflowMessage('Bienvenue ! Commencez par compléter votre profil pour personnaliser votre expérience.');
    } else if (nextStep === 'posture-eval') {
        // Étape 2: Faire l'évaluation posturale
        console.log('Redirection vers l\'évaluation posturale');
        showPage('posture-eval');
        showWorkflowMessage('Excellent ! Maintenant, effectuez une évaluation posturale pour que nous puissions adapter votre plan d\'entraînement.');
    } else {
        // Étape 3: Accéder au dashboard
        console.log('Affichage de la page dashboard...');
        isNewUser = false;
        showPage('dashboard');
        
        // Charger le dashboard après authentification
        if (typeof loadDashboard === 'function') {
            console.log('Chargement du dashboard...');
            loadDashboard();
        } else {
            console.warn('loadDashboard n\'est pas une fonction');
        }
    }
    
    console.log('showApp terminé');
}

// Afficher un message d'aide pour le workflow (workflow nouveau utilisateur)
function showWorkflowMessage(message) {
    // Supprimer le message précédent s'il existe
    const existingMessage = document.getElementById('workflow-message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // Créer le message
    const messageDiv = document.createElement('div');
    messageDiv.id = 'workflow-message';
    messageDiv.className = 'workflow-message';
    messageDiv.innerHTML = `
        <div class="workflow-message-content">
            <span class="workflow-message-text">${message}</span>
            <button class="workflow-message-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
    `;
    
    // Ajouter au début du conteneur de l'application
    const appContainer = document.getElementById('app-container');
    if (appContainer) {
        appContainer.insertBefore(messageDiv, appContainer.firstChild);
    }
    
    // Disparaître automatiquement après 5 secondes
    setTimeout(() => {
        if (messageDiv && messageDiv.parentElement) {
            messageDiv.style.animation = 'slideUp 0.3s ease';
            setTimeout(() => {
                messageDiv.remove();
            }, 300);
        }
    }, 5000);
}

// Fonction globale pour passer à l'étape suivante du workflow
window.advanceWorkflow = async function() {
    if (!isNewUser) {
        showPage('dashboard');
        if (typeof loadDashboard === 'function') {
            loadDashboard();
        }
        const existingMessage = document.getElementById('workflow-message');
        if (existingMessage) {
            existingMessage.remove();
        }
        return;
    }

    const nextStep = await getNextWorkflowStep();
    
    if (nextStep === 'consent') {
        showPage('profile');
        if (typeof loadProfile === 'function') {
            loadProfile();
        }
        if (typeof loadExtendedProfile === 'function') {
            loadExtendedProfile();
        }
        showWorkflowMessage('Merci d\'accepter le formulaire de consentement pour continuer.');
        if (typeof initConsent === 'function') {
            initConsent();
        }
    } else if (nextStep === 'profile') {
        showPage('profile');
        if (typeof loadProfile === 'function') {
            loadProfile();
        }
        if (typeof loadExtendedProfile === 'function') {
            loadExtendedProfile();
        }
        showWorkflowMessage('Bienvenue ! Commencez par compléter votre profil pour personnaliser votre expérience.');
    } else if (nextStep === 'posture-eval') {
        showPage('posture-eval');
        showWorkflowMessage('Excellent ! Maintenant, effectuez une évaluation posturale pour que nous puissions adapter votre plan d\'entraînement.');
    } else if (nextStep === 'dashboard') {
        isNewUser = false;
        showPage('dashboard');
        if (typeof loadDashboard === 'function') {
            loadDashboard();
        }
        // Supprimer le message de workflow
        const existingMessage = document.getElementById('workflow-message');
        if (existingMessage) {
            existingMessage.remove();
        }
    }
};

function hideAllPages() {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
}

function showPage(pageId) {
    hideAllPages();
    const pageElement = document.getElementById(`${pageId}-page`);
    if (pageElement) {
        pageElement.classList.add('active');
    }
    
    // Mettre à jour la navigation active
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    let navBtn = document.getElementById(`nav-${pageId}`);
    if (!navBtn) {
        navBtn = document.querySelector(`.nav-btn[data-page="${pageId}"]`);
    }
    if (navBtn) {
        navBtn.classList.add('active');
    }
    
    // Charger automatiquement le plan quand on affiche la page workout
    if (pageId === 'workout') {
        // Attendre un peu pour que la page soit visible
        setTimeout(async () => {
            if (typeof loadWorkoutPlan === 'function' && typeof displayWorkoutPlan === 'function') {
                const plan = await loadWorkoutPlan();
                await displayWorkoutPlan(plan);
            }
        }, 50);
    }
}

// Gestion des formulaires d'authentification
document.addEventListener('DOMContentLoaded', () => {
    const forgotPasswordLink = document.getElementById('link-forgot-password');
    const passwordResetModal = document.getElementById('password-reset-modal');
    const passwordResetClose = document.getElementById('password-reset-close');
    const resetRequestSection = document.getElementById('password-reset-request');
    const resetConfirmSection = document.getElementById('password-reset-confirm');
    const resetFeedback = document.getElementById('password-reset-feedback');
    const resetRequestForm = document.getElementById('password-reset-request-form');
    const resetConfirmForm = document.getElementById('password-reset-confirm-form');
    const resetEmailInput = document.getElementById('password-reset-email');
    const resetTokenInput = document.getElementById('password-reset-token');
    const resetNewPasswordInput = document.getElementById('password-reset-new-password');
    const resetConfirmPasswordInput = document.getElementById('password-reset-confirm-password');
    function showResetFeedback(message, isError = false) {
        if (!resetFeedback) return;
        resetFeedback.innerHTML = message.replace(/\n/g, '<br>');
        resetFeedback.classList.add('show');
        resetFeedback.classList.toggle('error', isError);
    }

    function clearResetFeedback() {
        if (!resetFeedback) return;
        resetFeedback.innerHTML = '';
        resetFeedback.classList.remove('show', 'error');
    }

    function openPasswordResetModal() {
        if (!passwordResetModal) return;
        clearResetFeedback();
        resetRequestForm?.reset();
        resetConfirmForm?.reset();
        passwordResetModal.style.display = 'flex';
        passwordResetModal.classList.add('active');
        passwordResetModal.scrollTop = 0;
        if (resetEmailInput) {
            setTimeout(() => resetEmailInput.focus(), 100);
        }
    }

    function closePasswordResetModal() {
        if (!passwordResetModal) return;
        passwordResetModal.classList.remove('active');
        passwordResetModal.style.display = 'none';
        clearResetFeedback();
        resetRequestForm?.reset();
        resetConfirmForm?.reset();
    }

    forgotPasswordLink?.addEventListener('click', (e) => {
        e.preventDefault();
        openPasswordResetModal();
    });

    passwordResetClose?.addEventListener('click', closePasswordResetModal);

    passwordResetModal?.addEventListener('click', (e) => {
        if (e.target === passwordResetModal) {
            closePasswordResetModal();
        }
    });

    resetRequestForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = resetEmailInput?.value?.trim();
        if (!email) {
            showResetFeedback('Veuillez saisir votre adresse email.', true);
            return;
        }

        try {
            const response = await api.requestPasswordReset(email);
            let message = response.message || 'Si un compte existe, un email vient de lui être envoyé avec les instructions.';
            if (response.debugToken) {
                message += `\nCode temporaire: ${response.debugToken}`;
                if (resetTokenInput) {
                    resetTokenInput.value = response.debugToken;
                }
                resetNewPasswordInput?.focus();
            } else {
                resetTokenInput?.focus();
            }
            showResetFeedback(message, false);
        } catch (error) {
            showResetFeedback(error.message || 'Erreur lors de la demande de réinitialisation.', true);
        }
    });

    resetConfirmForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const token = resetTokenInput?.value?.trim();
        const newPassword = resetNewPasswordInput?.value || '';
        const confirmPassword = resetConfirmPasswordInput?.value || '';

        if (!token || !newPassword || !confirmPassword) {
            showResetFeedback('Merci de renseigner tous les champs.', true);
            return;
        }

        if (newPassword !== confirmPassword) {
            showResetFeedback('Les mots de passe ne correspondent pas.', true);
            return;
        }

        if (newPassword.length < 6) {
            showResetFeedback('Le mot de passe doit contenir au moins 6 caractères.', true);
            return;
        }

        try {
            const response = await api.confirmPasswordReset(token, newPassword);
            showResetFeedback(response.message || 'Mot de passe mis à jour avec succès.', false);
            resetConfirmForm.reset();
            setTimeout(() => {
                closePasswordResetModal();
            }, 2000);
        } catch (error) {
            showResetFeedback(error.message || 'Erreur lors de la mise à jour du mot de passe.', true);
        }
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
            document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
        });
    });

    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');
    navToggle?.addEventListener('click', () => {
        navLinks?.classList.toggle('open');
        navToggle.classList.toggle('open');
    });
    
    // Fermer automatiquement le menu lors du scroll
    let scrollTimeout = null;
    let isScrolling = false;
    
    window.addEventListener('scroll', () => {
        // Détecter le début du scroll et fermer immédiatement le menu
        if (!isScrolling) {
            isScrolling = true;
            // Fermer immédiatement le menu au début du scroll
            if (navLinks?.classList.contains('open')) {
                navLinks.classList.remove('open');
                navToggle?.classList.remove('open');
            }
        }
        
        // Réinitialiser le flag après un court délai
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            isScrolling = false;
        }, 150);
    }, { passive: true });

    // Login
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('auth-error');

        try {
            console.log('Tentative de connexion...');
            const data = await api.login(email, password);
            currentUser = data.user;
            isNewUser = false; // Connexion = utilisateur existant
            console.log('Connexion réussie, affichage de l\'application...');
            // Attendre un peu pour s'assurer que le token est bien stocké
            setTimeout(() => {
                showApp();
            }, 50);
            errorDiv.classList.remove('show');
        } catch (error) {
            console.error('Erreur de connexion:', error);
            errorDiv.textContent = error.message;
            errorDiv.classList.add('show');
        }
    });

    // Register
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const errorDiv = document.getElementById('auth-error');

        try {
            console.log('Tentative d\'inscription...');
            const data = await api.register(email, password, name);
            currentUser = data.user;
            isNewUser = true; // Inscription = nouvel utilisateur
            resetConsentState(); // Forcer l'affichage du formulaire de consentement après inscription
            console.log('Inscription réussie, affichage de l\'application...');
            // Attendre un peu pour s'assurer que le token est bien stocké
            setTimeout(() => {
                showApp();
            }, 50);
            errorDiv.classList.remove('show');
        } catch (error) {
            console.error('Erreur d\'inscription:', error);
            errorDiv.textContent = error.message;
            errorDiv.classList.add('show');
        }
    });

    // Navigation
    document.getElementById('nav-dashboard').addEventListener('click', () => showPage('dashboard'));
    document.getElementById('nav-workout').addEventListener('click', () => showPage('workout'));
    document.getElementById('nav-progress').addEventListener('click', () => showPage('progress'));
    document.getElementById('nav-chat').addEventListener('click', () => showPage('chat'));
    document.getElementById('nav-exercises')?.addEventListener('click', () => showPage('exercises-catalog'));
    document.getElementById('nav-profile').addEventListener('click', () => showPage('profile'));
    document.getElementById('nav-logout').addEventListener('click', () => {
        console.log('Déconnexion demandée');
        
        // Afficher un avertissement de confirmation
        const confirmed = confirm('Êtes-vous sûr de vouloir vous déconnecter ?\n\nVous devrez vous reconnecter pour accéder à nouveau à votre compte.');
        
        // Si l'utilisateur annule, ne rien faire
        if (!confirmed) {
            console.log('Déconnexion annulée par l\'utilisateur');
            return;
        }
        
        console.log('Déconnexion confirmée par l\'utilisateur');
        
        // Nettoyer toutes les données utilisateur
        api.logout();
        currentUser = null;
        isNewUser = false;
        
        // Nettoyer complètement le localStorage
        localStorage.removeItem('token');
        localStorage.removeItem('userProfile');
        localStorage.removeItem('extendedProfile');
        localStorage.removeItem('userPreferences');
        localStorage.removeItem('workoutPlan');
        localStorage.removeItem('consent-data');
        localStorage.removeItem('consent-given');
        
        // Réinitialiser les formulaires de connexion/inscription
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        if (loginForm) {
            loginForm.reset();
            loginForm.classList.remove('hidden');
        }
        if (registerForm) {
            registerForm.reset();
            registerForm.classList.add('hidden');
        }
        
        // Réinitialiser les onglets de connexion/inscription pour afficher "Connexion" par défaut
        const loginTab = document.querySelector('.tab-btn[data-tab="login"]');
        const registerTab = document.querySelector('.tab-btn[data-tab="register"]');
        if (loginTab) {
            loginTab.classList.add('active');
        }
        if (registerTab) {
            registerTab.classList.remove('active');
        }
        
        // Masquer tous les messages d'erreur
        const errorMessages = document.querySelectorAll('.error-message, .form-feedback, #auth-error');
        errorMessages.forEach(msg => {
            msg.classList.remove('show', 'error');
            msg.textContent = '';
            msg.innerHTML = '';
        });
        
        // Masquer le modal de réinitialisation de mot de passe s'il est ouvert
        const passwordResetModal = document.getElementById('password-reset-modal');
        if (passwordResetModal) {
            passwordResetModal.style.display = 'none';
            passwordResetModal.classList.remove('active');
        }
        
        // Masquer le modal de consentement s'il est ouvert
        const consentModal = document.getElementById('consent-modal');
        if (consentModal) {
            consentModal.classList.remove('active');
            consentModal.style.display = 'none';
        }
        
        // Nettoyer l'état du consentement
        resetConsentState();
        
        // Masquer le menu de navigation mobile s'il est ouvert
        const navLinks = document.querySelector('.nav-links');
        const navToggle = document.querySelector('.nav-toggle');
        if (navLinks) {
            navLinks.classList.remove('open');
        }
        if (navToggle) {
            navToggle.classList.remove('open');
        }
        
        // Afficher la page de connexion
        showLogin();
        
        console.log('Déconnexion terminée, retour à la page de connexion');
    });

    // Initialisation
    initAuth();
});


