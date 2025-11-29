// Gestion du profil étendu (FR-04)
let extendedProfile = null;

async function loadExtendedProfile() {
    try {
        extendedProfile = await api.getExtendedProfile();
        if (extendedProfile) {
            populateExtendedProfileForm(extendedProfile);
        }
    } catch (error) {
        console.error('Erreur chargement profil étendu:', error);
    }
}

function populateExtendedProfileForm(profile) {
    // Données physiques et biométriques
    if (profile.resting_heart_rate) document.getElementById('profile-resting-hr').value = profile.resting_heart_rate;
    if (profile.blood_pressure) document.getElementById('profile-blood-pressure').value = profile.blood_pressure;
    if (profile.bmi) document.getElementById('profile-bmi').value = profile.bmi;
    if (profile.body_composition) document.getElementById('profile-body-comp').value = profile.body_composition;
    if (profile.waist_circumference) document.getElementById('profile-waist').value = profile.waist_circumference;
    if (profile.hip_circumference) document.getElementById('profile-hip').value = profile.hip_circumference;
    if (profile.arm_circumference) document.getElementById('profile-arm').value = profile.arm_circumference;
    if (profile.thigh_circumference) document.getElementById('profile-thigh').value = profile.thigh_circumference;
    if (profile.medical_history) document.getElementById('profile-medical-history').value = profile.medical_history;
    if (profile.injury_history) document.getElementById('profile-injury-history').value = profile.injury_history;
    if (profile.sleep_quality) document.getElementById('profile-sleep-quality').value = profile.sleep_quality;
    if (profile.fatigue_level) document.getElementById('profile-fatigue').value = profile.fatigue_level;
    
    // Habitudes de vie - Disponibilité hebdomadaire
    // UNIQUEMENT afficher les jours réellement sélectionnés par l'utilisateur (pas de valeurs par défaut)
    const checkboxes = document.querySelectorAll('.availability-day');
    
    // D'abord, réinitialiser toutes les checkboxes
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    
    // Ensuite, cocher UNIQUEMENT les jours qui ont été réellement saisis par l'utilisateur
    if (profile.weekly_availability && profile.weekly_availability.trim() !== '') {
        // Charger les jours sélectionnés depuis la valeur sauvegardée
        // Gérer différents formats : "Lundi, Mercredi" ou "Lundi,Mercredi" ou "lundi, mercredi"
        const availabilityDays = profile.weekly_availability
            .split(',')
            .map(d => d.trim())
            .filter(d => d !== '') // Filtrer les chaînes vides
            .map(d => {
                // Normaliser : première lettre en majuscule, reste en minuscule
                return d.charAt(0).toUpperCase() + d.slice(1).toLowerCase();
            });
        
        // Cocher uniquement les jours qui sont dans la liste des jours sélectionnés
        checkboxes.forEach(checkbox => {
            checkbox.checked = availabilityDays.includes(checkbox.value);
        });
    }
    if (profile.preferred_session_duration) document.getElementById('profile-session-duration').value = profile.preferred_session_duration;
    if (profile.training_location) document.getElementById('profile-location').value = profile.training_location;
    if (profile.available_equipment) document.getElementById('profile-equipment').value = profile.available_equipment;
    if (profile.daily_sitting_hours) document.getElementById('profile-sitting-hours').value = profile.daily_sitting_hours;
    if (profile.diet_type) document.getElementById('profile-diet').value = profile.diet_type;
    
    // Motivation
    if (profile.main_motivation) document.getElementById('profile-motivation').value = profile.main_motivation;
    if (profile.coaching_style_preference) document.getElementById('profile-coaching-style').value = profile.coaching_style_preference;
    if (profile.demotivation_factors) document.getElementById('profile-demotivation').value = profile.demotivation_factors;
    if (profile.engagement_score) document.getElementById('profile-engagement').value = profile.engagement_score;
    if (profile.social_preference) document.getElementById('profile-social').value = profile.social_preference;
    
    // Historique
    if (profile.past_sports) document.getElementById('profile-past-sports').value = profile.past_sports;
    if (profile.past_training_frequency) document.getElementById('profile-past-frequency').value = profile.past_training_frequency;
    if (profile.time_since_last_training) document.getElementById('profile-time-since').value = profile.time_since_last_training;
    if (profile.technique_level) document.getElementById('profile-technique').value = profile.technique_level;
    
    // Techniques
    if (profile.measurable_goals) document.getElementById('profile-measurable-goals').value = profile.measurable_goals;
    if (profile.alert_sensitivity) document.getElementById('profile-alert-sensitivity').value = profile.alert_sensitivity;
    if (profile.camera_consent !== undefined) document.getElementById('profile-camera-consent').checked = profile.camera_consent === 1;
    if (profile.planning_preference) document.getElementById('profile-planning-pref').value = profile.planning_preference;
}

async function saveExtendedProfile(options = {}) {
    const { silent = false } = options;
    const profileData = {
        // Données physiques
        resting_heart_rate: parseInt(document.getElementById('profile-resting-hr').value) || null,
        blood_pressure: document.getElementById('profile-blood-pressure').value || null,
        bmi: parseFloat(document.getElementById('profile-bmi').value) || null,
        body_composition: document.getElementById('profile-body-comp').value || null,
        waist_circumference: parseFloat(document.getElementById('profile-waist').value) || null,
        hip_circumference: parseFloat(document.getElementById('profile-hip').value) || null,
        arm_circumference: parseFloat(document.getElementById('profile-arm').value) || null,
        thigh_circumference: parseFloat(document.getElementById('profile-thigh').value) || null,
        medical_history: document.getElementById('profile-medical-history').value || null,
        injury_history: document.getElementById('profile-injury-history').value || null,
        sleep_quality: parseInt(document.getElementById('profile-sleep-quality').value) || null,
        fatigue_level: parseInt(document.getElementById('profile-fatigue').value) || null,
        
        // Habitudes - Disponibilité hebdomadaire
        // Sauvegarder UNIQUEMENT les jours réellement cochés par l'utilisateur
        weekly_availability: (() => {
            const selectedDays = Array.from(document.querySelectorAll('.availability-day:checked'))
                .map(cb => cb.value)
                .filter(day => day && day.trim() !== ''); // Filtrer les valeurs vides
            // Retourner null si aucun jour n'est sélectionné (pas de valeur par défaut)
            return selectedDays.length > 0 ? selectedDays.join(', ') : null;
        })(),
        preferred_session_duration: parseInt(document.getElementById('profile-session-duration').value) || null,
        training_location: document.getElementById('profile-location').value || null,
        available_equipment: document.getElementById('profile-equipment').value || null,
        daily_sitting_hours: parseFloat(document.getElementById('profile-sitting-hours').value) || null,
        diet_type: document.getElementById('profile-diet').value || null,
        
        // Motivation
        main_motivation: document.getElementById('profile-motivation').value || null,
        coaching_style_preference: document.getElementById('profile-coaching-style').value || null,
        demotivation_factors: document.getElementById('profile-demotivation').value || null,
        engagement_score: parseInt(document.getElementById('profile-engagement').value) || null,
        social_preference: document.getElementById('profile-social').value || null,
        
        // Historique
        past_sports: document.getElementById('profile-past-sports').value || null,
        past_training_frequency: document.getElementById('profile-past-frequency').value || null,
        time_since_last_training: document.getElementById('profile-time-since').value || null,
        technique_level: document.getElementById('profile-technique').value || null,
        
        // Techniques
        measurable_goals: document.getElementById('profile-measurable-goals').value || null,
        alert_sensitivity: parseInt(document.getElementById('profile-alert-sensitivity').value) || null,
        camera_consent: document.getElementById('profile-camera-consent').checked ? 1 : 0,
        planning_preference: document.getElementById('profile-planning-pref').value || null
    };
    
    try {
        await api.updateExtendedProfile(profileData);
        if (!silent) {
            alert('Profil étendu enregistré avec succès!');
        }
        return profileData;
    } catch (error) {
        if (silent) {
            throw error;
        }
        alert('Erreur: ' + error.message);
        return null;
    }
}

// Initialiser les onglets du profil étendu
function initExtendedProfileTabs() {
    const tabs = document.querySelectorAll('.profile-tab-btn');
    const sections = document.querySelectorAll('.profile-tab-section');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.dataset.tab;
            
            // Désactiver tous les onglets
            tabs.forEach(t => t.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            
            // Activer l'onglet et la section sélectionnés
            tab.classList.add('active');
            document.getElementById(`profile-section-${targetId}`).classList.add('active');
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initExtendedProfileTabs();
    
    document.getElementById('extended-profile-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveExtendedProfile();
    });
});

