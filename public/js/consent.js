// Gestion du consentement conforme Loi 25 (FR-02)
const CONSENT_VERSION = '1.0'; // Version du formulaire de consentement

function initConsent() {
    const consentData = getConsentData();
    const consentModal = document.getElementById('consent-modal');
    const consentCheckbox = document.getElementById('consent-checkbox');
    const consentAccept = document.getElementById('consent-accept');
    const consentDecline = document.getElementById('consent-decline');

    if (!consentModal || !consentCheckbox || !consentAccept || !consentDecline) {
        return; // Éléments non trouvés
    }

    // Si le consentement n'a pas été donné ou si la version a changé, afficher le modal
    if (!consentData || consentData.version !== CONSENT_VERSION) {
        consentModal.classList.add('active');
        // Scroll vers le haut du modal
        consentModal.scrollTop = 0;
    }

    // Activer le bouton quand la checkbox est cochée
    consentCheckbox.addEventListener('change', () => {
        consentAccept.disabled = !consentCheckbox.checked;
    });

    // Accepter le consentement (Loi 25 - consentement explicite et éclairé)
    consentAccept.addEventListener('click', () => {
        if (consentCheckbox.checked) {
            const consentRecord = {
                given: true,
                date: new Date().toISOString(),
                version: CONSENT_VERSION,
                loi25: true,
                ipAddress: null, // À remplir côté serveur si nécessaire
                userAgent: navigator.userAgent
            };
            
            localStorage.setItem('consent-data', JSON.stringify(consentRecord));
            localStorage.setItem('consent-given', 'true'); // Pour compatibilité
            
            // Enregistrer côté serveur si utilisateur connecté
            if (localStorage.getItem('token')) {
                saveConsentToServer(consentRecord);
            }
            
            consentModal.classList.remove('active');
            console.log('Consentement donné conformément à la Loi 25');

            if (typeof advanceWorkflow === 'function') {
                setTimeout(() => advanceWorkflow(), 200);
            }
        }
    });

    // Refuser le consentement (Loi 25 - droit de refus)
    consentDecline.addEventListener('click', () => {
        const declineRecord = {
            given: false,
            date: new Date().toISOString(),
            version: CONSENT_VERSION,
            loi25: true
        };
        
        localStorage.setItem('consent-data', JSON.stringify(declineRecord));
        localStorage.setItem('consent-given', 'false');
        
        alert('Vous avez refusé le consentement. L\'application nécessite votre consentement pour fonctionner. Vous serez redirigé.');
        
        // Rediriger après un délai
        setTimeout(() => {
            window.location.href = 'about:blank';
        }, 2000);
    });
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

async function saveConsentToServer(consentRecord) {
    try {
        // Envoyer au serveur pour enregistrement (si route disponible)
        const response = await fetch('/api/user/consent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(consentRecord)
        });
        
        if (!response.ok) {
            console.warn('Erreur sauvegarde consentement serveur');
        }
    } catch (error) {
        console.error('Erreur envoi consentement:', error);
    }
}

// Retirer le consentement (droit Loi 25)
function withdrawConsent() {
    if (confirm('Êtes-vous sûr de vouloir retirer votre consentement ? Cela désactivera certaines fonctionnalités de l\'application.')) {
        localStorage.removeItem('consent-data');
        localStorage.removeItem('consent-given');
        
        // Déconnecter l'utilisateur
        if (typeof api !== 'undefined') {
            api.logout();
        }
        
        // Réafficher le modal
        initConsent();
        
        alert('Votre consentement a été retiré. Vous devrez le redonner pour utiliser l\'application.');
    }
}

// Accéder aux données personnelles (droit Loi 25)
async function accessPersonalData() {
    try {
        if (!localStorage.getItem('token')) {
            alert('Veuillez vous connecter pour accéder à vos données.');
            return;
        }
        
        // Utiliser l'API d'export
        const response = await fetch('/api/user/data-export', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Erreur lors de l\'export des données');
        }
        
        const allData = await response.json();
        allData.consent = getConsentData();
        
        // Télécharger les données en JSON
        const dataStr = JSON.stringify(allData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `mes-donnees-loi25-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
        
        alert('Vos données ont été téléchargées au format JSON (conforme Loi 25).');
    } catch (error) {
        console.error('Erreur accès données:', error);
        alert('Erreur lors de l\'accès à vos données: ' + error.message);
    }
}

// Vérifier le consentement avant d'accéder aux fonctionnalités
function checkConsent() {
    const consentData = getConsentData();
    if (!consentData || !consentData.given || consentData.version !== CONSENT_VERSION) {
        initConsent();
        return false;
    }
    return true;
}

// Exposer les fonctions globalement pour accès depuis le profil
window.withdrawConsent = withdrawConsent;
window.accessPersonalData = accessPersonalData;

// Initialiser au chargement
document.addEventListener('DOMContentLoaded', () => {
    // Attendre un peu pour que les autres scripts se chargent
    setTimeout(() => {
        if (document.getElementById('consent-modal')) {
            initConsent();
        }
    }, 500);
});

