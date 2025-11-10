// Service Worker pour les notifications push (FR-13)
const CACHE_NAME = 'alen-v1';
const NOTIFICATION_TAG = 'alen-notification';

// Installation du Service Worker
self.addEventListener('install', (event) => {
    console.log('Service Worker installé');
    self.skipWaiting();
});

// Activation du Service Worker
self.addEventListener('activate', (event) => {
    console.log('Service Worker activé');
    event.waitUntil(self.clients.claim());
});

// Gestion des notifications push (FR-13)
self.addEventListener('push', (event) => {
    console.log('Notification push reçue:', event);
    
    let notificationData = {
        title: 'Alen',
        body: 'Il est temps de faire votre séance d\'entraînement! 💪',
        icon: '/icon.png',
        badge: '/icon.png',
        tag: NOTIFICATION_TAG,
        requireInteraction: false,
        data: {
            url: '/workout'
        }
    };
    
    // Si des données sont envoyées avec la notification
    if (event.data) {
        try {
            const data = event.data.json();
            notificationData = { ...notificationData, ...data };
        } catch (e) {
            notificationData.body = event.data.text();
        }
    }
    
    event.waitUntil(
        self.registration.showNotification(notificationData.title, notificationData)
    );
});

// Gestion du clic sur une notification (FR-13)
self.addEventListener('notificationclick', (event) => {
    console.log('Notification cliquée:', event);
    event.notification.close();
    
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Si une fenêtre est déjà ouverte, la focus
                for (let i = 0; i < clientList.length; i++) {
                    const client = clientList[i];
                    if (client.url === urlToOpen && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Sinon, ouvrir une nouvelle fenêtre
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// Gestion des messages depuis le client (FR-13)
self.addEventListener('message', (event) => {
    console.log('Message reçu dans Service Worker:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

