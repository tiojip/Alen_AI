// Notifications et rappels intelligents (FR-13)
let notificationPermission = false;
let serviceWorkerRegistration = null;
let pushSubscription = null;
let lastNotificationDate = null; // Pour heuristique d'adhérence (1/jour max)

// Initialiser le Service Worker (FR-13)
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js', {
                scope: '/'
            });
            serviceWorkerRegistration = registration;
            console.log('Service Worker enregistré:', registration);
            
            // Vérifier les mises à jour
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('Nouveau Service Worker disponible');
                    }
                });
            });
            
            return registration;
        } catch (error) {
            console.error('Erreur enregistrement Service Worker:', error);
            return null;
        }
    }
    return null;
}

// Demander la permission pour les notifications (FR-13)
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.warn('Ce navigateur ne supporte pas les notifications');
        return false;
    }
    
    if (Notification.permission === 'granted') {
        notificationPermission = true;
        return true;
    }
    
    if (Notification.permission === 'denied') {
        console.warn('Permission de notification refusée');
        return false;
    }
    
    // Demander la permission
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        notificationPermission = true;
        return true;
    }
    
    return false;
}

// Initialiser les notifications (FR-13)
async function initNotifications() {
    // Vérifier si l'utilisateur est connecté
    const token = localStorage.getItem('token');
    if (!token) {
        console.log('Utilisateur non connecté, notifications non initialisées');
        return;
    }
    
    // Enregistrer le Service Worker
    await registerServiceWorker();
    
    // Vérifier les préférences utilisateur
    try {
        const prefs = await api.getPreferences();
        if (!prefs || prefs.notifications !== 1) {
            console.log('Notifications désactivées par l\'utilisateur');
            return; // Notifications désactivées
        }
    } catch (error) {
        // Ne pas bloquer l'initialisation si les préférences ne peuvent pas être chargées
        console.warn('Impossible de charger les préférences, utilisation des valeurs par défaut:', error.message);
        // Continuer avec les notifications activées par défaut
    }

    // Demander la permission
    const hasPermission = await requestNotificationPermission();
    if (hasPermission) {
        // Charger la date de la dernière notification
        loadLastNotificationDate();
        scheduleNotifications();
    }
}

// Charger la date de la dernière notification (heuristique adhérence)
function loadLastNotificationDate() {
    const stored = localStorage.getItem('lastNotificationDate');
    if (stored) {
        lastNotificationDate = new Date(stored);
    }
}

// Sauvegarder la date de la dernière notification (heuristique adhérence)
function saveLastNotificationDate() {
    lastNotificationDate = new Date();
    localStorage.setItem('lastNotificationDate', lastNotificationDate.toISOString());
}

// Vérifier si on peut envoyer une notification (heuristique: 1/jour max) (FR-13)
function canSendNotification() {
    if (!lastNotificationDate) {
        return true; // Première notification
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const lastDate = new Date(lastNotificationDate);
    lastDate.setHours(0, 0, 0, 0);
    
    // Vérifier si une notification a déjà été envoyée aujourd'hui
    return lastDate.getTime() !== today.getTime();
}

// Programmer les notifications selon les préférences (FR-13)
async function scheduleNotifications() {
    if (!notificationPermission) return;

    try {
        // Charger les préférences de notifications
        const prefs = await api.getPreferences();
        const notificationTime = prefs.notification_time || null;
        const notificationDays = prefs.notification_days ? JSON.parse(prefs.notification_days) : [1, 2, 3, 4, 5, 6, 0]; // Tous les jours par défaut
        
        // Si pas de préférence de temps, analyser les habitudes
        let optimalTime = notificationTime ? 
            { hour: parseInt(notificationTime.split(':')[0]), minute: parseInt(notificationTime.split(':')[1]) } :
            await analyzeWorkoutHabits();
        
        if (optimalTime) {
            scheduleDailyReminder(optimalTime, notificationDays);
        }
    } catch (error) {
        console.error('Erreur programmation notifications:', error);
        // Fallback: utiliser l'heure par défaut
        scheduleDailyReminder({ hour: 18, minute: 0 }, [1, 2, 3, 4, 5, 6, 0]);
    }
}

async function analyzeWorkoutHabits() {
    try {
        const sessions = await api.getSessionHistory();
        if (!sessions || sessions.length < 3) {
            // Pas assez de données, utiliser une heure par défaut (18h)
            return { hour: 18, minute: 0 };
        }

        // Analyser les heures des séances précédentes
        const hours = sessions.slice(0, 10).map(s => {
            const date = new Date(s.completed_at);
            return date.getHours();
        });

        // Calculer l'heure moyenne
        const avgHour = Math.round(
            hours.reduce((sum, h) => sum + h, 0) / hours.length
        );

        return { hour: avgHour, minute: 0 };
    } catch (error) {
        console.error('Erreur analyse habitudes:', error);
        return { hour: 18, minute: 0 }; // Défaut: 18h
    }
}

// Programmer un rappel quotidien (FR-13)
function scheduleDailyReminder(time, days = [1, 2, 3, 4, 5, 6, 0]) {
    console.log(`Rappel programmé pour ${time.hour}:${time.minute} les jours:`, days);
    
    // Vérifier si on est dans un jour autorisé
    const today = new Date();
    const todayDay = today.getDay(); // 0 = dimanche, 1 = lundi, etc.
    
    if (!days.includes(todayDay)) {
        console.log('Aujourd\'hui n\'est pas un jour de notification');
        return;
    }
    
    // Vérifier si une séance a été faite aujourd'hui
    checkTodaySession().then(hasSession => {
        if (!hasSession && canSendNotification()) {
            // Pas de séance aujourd'hui, envoyer un rappel
            const now = new Date();
            const reminderTime = new Date();
            reminderTime.setHours(time.hour, time.minute, 0, 0);
            
            // Si l'heure est passée, programmer pour demain (si demain est dans les jours autorisés)
            if (reminderTime < now) {
                reminderTime.setDate(reminderTime.getDate() + 1);
                const tomorrowDay = reminderTime.getDay();
                if (!days.includes(tomorrowDay)) {
                    // Trouver le prochain jour autorisé
                    let nextDay = reminderTime;
                    let attempts = 0;
                    while (!days.includes(nextDay.getDay()) && attempts < 7) {
                        nextDay.setDate(nextDay.getDate() + 1);
                        attempts++;
                    }
                    reminderTime.setTime(nextDay.getTime());
                }
            }
            
            const delay = reminderTime - now;
            
            if (delay > 0 && delay < 24 * 60 * 60 * 1000) { // Max 24h
                console.log(`Notification programmée dans ${Math.round(delay / 1000 / 60)} minutes`);
                setTimeout(() => {
                    if (canSendNotification()) {
                        showWorkoutReminder();
                        saveLastNotificationDate();
                    }
                }, delay);
            }
        }
    });
}

async function checkTodaySession() {
    try {
        const sessions = await api.getSessionHistory();
        if (!sessions || sessions.length === 0) return false;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const lastSession = new Date(sessions[0].completed_at);
        lastSession.setHours(0, 0, 0, 0);
        
        return lastSession.getTime() === today.getTime();
    } catch (error) {
        return false;
    }
}

// Afficher un rappel d'entraînement (FR-13)
async function showWorkoutReminder() {
    if (!notificationPermission) return;
    if (!canSendNotification()) {
        console.log('Notification déjà envoyée aujourd\'hui (heuristique adhérence)');
        return;
    }

    // Utiliser le Service Worker si disponible, sinon Notification API
    if (serviceWorkerRegistration) {
        try {
            await serviceWorkerRegistration.showNotification('Alen', {
                body: 'Il est temps de faire votre séance d\'entraînement! 💪',
                icon: '/icon.png',
                badge: '/icon.png',
                tag: 'workout-reminder',
                requireInteraction: false,
                data: {
                    url: '/workout'
                },
                actions: [
                    {
                        action: 'open',
                        title: 'Commencer l\'entraînement'
                    },
                    {
                        action: 'dismiss',
                        title: 'Plus tard'
                    }
                ]
            });
            saveLastNotificationDate();
        } catch (error) {
            console.error('Erreur notification Service Worker:', error);
            // Fallback vers Notification API
            showNotificationFallback();
        }
    } else {
        showNotificationFallback();
    }
}

// Fallback vers Notification API si Service Worker indisponible
function showNotificationFallback() {
    const notification = new Notification('Alen', {
        body: 'Il est temps de faire votre séance d\'entraînement! 💪',
        icon: '/icon.png',
        tag: 'workout-reminder',
        requireInteraction: false
    });

    notification.onclick = () => {
        window.focus();
        if (typeof showPage === 'function') {
            showPage('workout');
        }
        notification.close();
    };

    // Fermer après 5 secondes
    setTimeout(() => notification.close(), 5000);
    saveLastNotificationDate();
}

// Notification de motivation basée sur la progression
function showMotivationNotification(message) {
    if (!notificationPermission) return;

    new Notification('Alen', {
        body: message,
        icon: '/icon.png',
        tag: 'motivation'
    });
}

// Fonction globale pour activer/désactiver les notifications (FR-13)
window.toggleNotifications = async function(enabled) {
    try {
        const prefs = await api.getPreferences();
        await api.updatePreferences({
            ...prefs,
            notifications: enabled ? 1 : 0
        });
        
        if (enabled) {
            await initNotifications();
        } else {
            // Désactiver les notifications
            if (serviceWorkerRegistration) {
                const subscriptions = await serviceWorkerRegistration.pushManager.getSubscription();
                if (subscriptions) {
                    await subscriptions.unsubscribe();
                }
            }
        }
    } catch (error) {
        console.error('Erreur toggle notifications:', error);
    }
};

// Initialiser au chargement (FR-13)
document.addEventListener('DOMContentLoaded', () => {
    // Attendre que l'utilisateur soit connecté
    setTimeout(() => {
        if (localStorage.getItem('token')) {
            initNotifications();
        }
    }, 2000);
});

