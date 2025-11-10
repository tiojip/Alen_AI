// Graphiques de progression (FR-12)
let progressChart = null;
let allSessions = [];
let currentPeriod = 30; // Période par défaut : 30 jours
let periodFilterEl = null;
let periodChipGroupEl = null;
let periodLabelEl = null;
let heroScoreEl = null;
let heroVolumeEl = null;
let heroFrequencyEl = null;
let heroConsistencyEl = null;
let heroSessionsEl = null;

const PERIOD_LABELS = {
    '7': '7 derniers jours',
    '30': '30 derniers jours',
    '90': '3 derniers mois',
    '180': '6 derniers mois',
    '365': '12 derniers mois',
    'all': 'toutes vos séances enregistrées'
};

function getSessionData(session) {
    if (!session || session.session_data === undefined || session.session_data === null) {
        return {};
    }

    if (typeof session.session_data === 'object') {
        return session.session_data;
    }

    try {
        return JSON.parse(session.session_data);
    } catch (error) {
        console.warn('Impossible de parser session_data:', error);
        return {};
    }
}

async function loadProgressCharts() {
    const startTime = performance.now();
    
    try {
        syncPeriodControls();

        // Charger toutes les séances une seule fois
        allSessions = await api.getSessionHistory();
        const progress = await api.getProgress();
        
        // Filtrer selon la période sélectionnée
        const filteredSessions = filterSessionsByPeriod(allSessions, currentPeriod);
        
        // Afficher l'historique des séances
        displaySessionsList(filteredSessions);
        
        // Afficher les graphiques et métriques
        displayProgressChart(filteredSessions);
        displayVolumeChart(filteredSessions);
        displayFrequencyChart(filteredSessions);
        displayProgressMetrics(filteredSessions, progress);
        
        const loadTime = performance.now() - startTime;
        console.log(`Progression chargée en ${loadTime.toFixed(2)}ms (SLA <3s: ${loadTime < 3000 ? '✅' : '❌'})`);
        
        if (loadTime > 3000) {
            console.warn('Temps de chargement >3s, optimisation nécessaire');
        }
    } catch (error) {
        console.error('Erreur chargement progression:', error);
    }
}

// Filtrer les séances selon la période (FR-12)
function filterSessionsByPeriod(sessions, days) {
    if (!sessions || sessions.length === 0) return [];
    if (days === 'all') return sessions;
    
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
    
    return sessions.filter(session => {
        const sessionDate = new Date(session.completed_at);
        return sessionDate >= cutoffDate;
    });
}

function displayProgressChart(sessions) {
    const canvas = document.getElementById('progress-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 800;
    canvas.height = 300;

    // Effacer le canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!sessions || sessions.length === 0) {
        ctx.fillStyle = '#999';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Aucune donnée disponible', canvas.width / 2, canvas.height / 2);
        return;
    }

    // Trier les sessions par date (plus ancienne en premier)
    const sortedSessions = [...sessions].sort((a, b) => 
        new Date(a.completed_at) - new Date(b.completed_at)
    );

    // Préparer les données
    const dates = sortedSessions.map(s => {
        const d = new Date(s.completed_at);
        return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    });
    const scores = sortedSessions.map(s => s.posture_score || 0);
    const maxScore = Math.max(...scores, 100);

    // Dessiner le graphique
    const padding = 50;
    const chartWidth = canvas.width - 2 * padding;
    const chartHeight = canvas.height - 2 * padding;
    const stepX = dates.length > 1 ? chartWidth / (dates.length - 1) : chartWidth;
    const stepY = chartHeight / maxScore;

    // Grille
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const y = padding + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(canvas.width - padding, y);
        ctx.stroke();
    }

    // Ligne de progression
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 3;
    ctx.beginPath();
    dates.forEach((date, i) => {
        const x = padding + i * stepX;
        const y = canvas.height - padding - scores[i] * stepY;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();

    // Points
    ctx.fillStyle = '#4CAF50';
    dates.forEach((date, i) => {
        const x = padding + i * stepX;
        const y = canvas.height - padding - scores[i] * stepY;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fill();
    });

    // Labels des dates (afficher seulement quelques dates pour éviter la surcharge)
    ctx.fillStyle = '#666';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    const labelInterval = Math.max(1, Math.floor(dates.length / 8));
    dates.forEach((date, i) => {
        if (i % labelInterval === 0 || i === dates.length - 1) {
            const x = padding + i * stepX;
            ctx.fillText(date, x, canvas.height - padding + 20);
        }
    });

    // Échelle Y
    ctx.textAlign = 'right';
    ctx.fillStyle = '#666';
    for (let i = 0; i <= 5; i++) {
        const value = Math.round((maxScore / 5) * (5 - i));
        const y = padding + (chartHeight / 5) * i;
        ctx.fillText(value, padding - 10, y + 4);
    }

    // Titre de l'axe Y
    ctx.save();
    ctx.translate(15, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#333';
    ctx.font = '12px Arial';
    ctx.fillText('Score postural', 0, 0);
    ctx.restore();
}

// Afficher l'historique des séances (FR-12)
function displaySessionsList(sessions) {
    const list = document.getElementById('sessions-list');
    if (!list) return;

    if (!sessions || sessions.length === 0) {
        list.innerHTML = '<p>Aucune séance enregistrée pour cette période</p>';
        return;
    }

    // Trier par date (plus récente en premier)
    const sortedSessions = [...sessions].sort((a, b) => 
        new Date(b.completed_at) - new Date(a.completed_at)
    );

    list.innerHTML = sortedSessions.map(session => {
        const date = new Date(session.completed_at);
        const sessionData = getSessionData(session);
        const duration = sessionData.duration || 0;
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        const exercisesCompleted = sessionData.exercisesCompleted || 0;
        const exercisesCount = sessionData.workout?.exercises?.length || 0;
        
        return `
            <div class="session-item">
                <div class="session-item-header">
                    <h4>${date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h4>
                    <span class="session-time">${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="session-item-content">
                    <div class="session-stat">
                        <span class="session-stat-label">Score postural:</span>
                        <span class="session-stat-value ${session.posture_score >= 80 ? 'excellent' : session.posture_score >= 60 ? 'good' : 'fair'}">${session.posture_score || 'N/A'}/100</span>
                    </div>
                    <div class="session-stat">
                        <span class="session-stat-label">Durée:</span>
                        <span class="session-stat-value">${minutes}min ${seconds}s</span>
                    </div>
                    ${exercisesCount > 0 ? `
                    <div class="session-stat">
                        <span class="session-stat-label">Exercices:</span>
                        <span class="session-stat-value">${exercisesCompleted}/${exercisesCount}</span>
                    </div>
                    ` : ''}
                    ${session.feedback ? `
                    <div class="session-feedback-text">
                        <span class="session-stat-label">Feedback:</span>
                        <span>${session.feedback}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function displayProgressMetrics(sessions, progress) {
    const metricsDiv = document.getElementById('progress-metrics');
    if (!metricsDiv) return;

    if (!sessions || sessions.length === 0) {
        metricsDiv.innerHTML = '<p>Aucune métrique disponible</p>';
        updateHeroMetrics(null);
        return;
    }

    // Calculer les métriques (FR-12)
    const totalSessions = sessions.length;
    const avgPostureScore = Math.round(
        sessions.reduce((sum, s) => sum + (s.posture_score || 0), 0) / totalSessions
    );
    
    // Volume total (durée totale)
    const totalDuration = sessions.reduce((sum, s) => {
        const data = getSessionData(s);
        const duration = data.duration || 0;
        return sum + duration;
    }, 0);
    const totalMinutes = Math.floor(totalDuration / 60);
    const totalDurationLabel = formatDurationLabel(totalMinutes);

    // Fréquence (séances par semaine)
    const sortedSessions = [...sessions].sort((a, b) => 
        new Date(a.completed_at) - new Date(b.completed_at)
    );
    const firstSession = sortedSessions.length > 0 ? new Date(sortedSessions[0].completed_at) : new Date();
    const lastSession = sortedSessions.length > 0 ? new Date(sortedSessions[sortedSessions.length - 1].completed_at) : new Date();
    const daysDiff = Math.max((lastSession - firstSession) / (1000 * 60 * 60 * 24), 1);
    const weeks = Math.max(daysDiff / 7, 1);
    const frequency = Math.round((totalSessions / weeks) * 10) / 10;
    const frequencyLabel = Number.isFinite(frequency) ? (frequency % 1 === 0 ? frequency.toFixed(0) : frequency.toFixed(1)) : '0';

    // Cohérence (pourcentage de jours avec séance sur la période)
    const uniqueDays = new Set();
    sessions.forEach(s => {
        const date = new Date(s.completed_at);
        const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        uniqueDays.add(dayKey);
    });
    const consistencyRaw = Math.round((uniqueDays.size / Math.max(daysDiff, 1)) * 100);
    const consistency = Math.min(consistencyRaw, 100);

    updateHeroMetrics({
        avgPostureScore,
        totalMinutes,
        frequency: frequencyLabel,
        consistency,
        totalSessions
    });

    metricsDiv.innerHTML = `
        <div class="metrics-grid">
            <div class="metric-item">
                <h4>Score postural moyen</h4>
                <p class="metric-value ${avgPostureScore >= 80 ? 'excellent' : avgPostureScore >= 60 ? 'good' : 'fair'}">${avgPostureScore}/100</p>
            </div>
            <div class="metric-item">
                <h4>Volume total</h4>
                <p class="metric-value">${totalDurationLabel}</p>
            </div>
            <div class="metric-item">
                <h4>Fréquence</h4>
                <p class="metric-value">${frequencyLabel} séances/semaine</p>
            </div>
            <div class="metric-item">
                <h4>Cohérence</h4>
                <p class="metric-value ${consistency >= 70 ? 'excellent' : consistency >= 50 ? 'good' : 'fair'}">${consistency}%</p>
            </div>
            <div class="metric-item">
                <h4>Total séances</h4>
                <p class="metric-value">${totalSessions}</p>
            </div>
        </div>
    `;
}

// Graphique de volume d'entraînement (FR-12)
function displayVolumeChart(sessions) {
    const canvas = document.getElementById('volume-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 800;
    canvas.height = 250;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!sessions || sessions.length === 0) {
        ctx.fillStyle = '#999';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Aucune donnée disponible', canvas.width / 2, canvas.height / 2);
        return;
    }

    // Grouper par jour
    const dailyVolume = {};
    sessions.forEach(s => {
        const date = new Date(s.completed_at);
        const dayKey = date.toLocaleDateString('fr-FR');
        const duration = getSessionData(s).duration || 0;
        dailyVolume[dayKey] = (dailyVolume[dayKey] || 0) + duration;
    });

    const sortedDays = Object.keys(dailyVolume).sort((a, b) => 
        new Date(a.split('/').reverse().join('-')) - new Date(b.split('/').reverse().join('-'))
    );
    const volumes = sortedDays.map(day => dailyVolume[day] / 60); // Convertir en minutes
    const maxVolume = Math.max(...volumes, 60);

    const padding = 50;
    const chartWidth = canvas.width - 2 * padding;
    const chartHeight = canvas.height - 2 * padding;
    const barWidth = chartWidth / sortedDays.length;
    const stepY = chartHeight / maxVolume;

    // Grille
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const y = padding + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(canvas.width - padding, y);
        ctx.stroke();
    }

    // Barres
    sortedDays.forEach((day, i) => {
        const x = padding + i * barWidth;
        const barHeight = volumes[i] * stepY;
        const y = canvas.height - padding - barHeight;

        // Gradient pour les barres
        const gradient = ctx.createLinearGradient(x, y, x, canvas.height - padding);
        gradient.addColorStop(0, '#4CAF50');
        gradient.addColorStop(1, '#66BB6A');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x + 2, y, barWidth - 4, barHeight);

        // Valeur sur la barre
        if (barHeight > 20) {
            ctx.fillStyle = '#fff';
            ctx.font = '11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(Math.round(volumes[i]) + 'min', x + barWidth / 2, y - 5);
        }
    });

    // Labels des dates
    ctx.fillStyle = '#666';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    const labelInterval = Math.max(1, Math.floor(sortedDays.length / 8));
    sortedDays.forEach((day, i) => {
        if (i % labelInterval === 0 || i === sortedDays.length - 1) {
            const x = padding + i * barWidth + barWidth / 2;
            ctx.fillText(day, x, canvas.height - padding + 20);
        }
    });

    // Échelle Y
    ctx.textAlign = 'right';
    ctx.fillStyle = '#666';
    for (let i = 0; i <= 5; i++) {
        const value = Math.round((maxVolume / 5) * (5 - i));
        const y = padding + (chartHeight / 5) * i;
        ctx.fillText(value + 'min', padding - 10, y + 4);
    }
}

// Graphique de fréquence et cohérence (FR-12)
function displayFrequencyChart(sessions) {
    const canvas = document.getElementById('frequency-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 800;
    canvas.height = 250;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!sessions || sessions.length === 0) {
        ctx.fillStyle = '#999';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Aucune donnée disponible', canvas.width / 2, canvas.height / 2);
        return;
    }

    // Grouper par semaine
    const weeklyData = {};
    sessions.forEach(s => {
        const date = new Date(s.completed_at);
        const weekKey = getWeekKey(date);
        weeklyData[weekKey] = (weeklyData[weekKey] || 0) + 1;
    });

    const sortedWeeks = Object.keys(weeklyData).sort();
    const frequencies = sortedWeeks.map(week => weeklyData[week]);
    const maxFreq = Math.max(...frequencies, 7);

    const padding = 50;
    const chartWidth = canvas.width - 2 * padding;
    const chartHeight = canvas.height - 2 * padding;
    const barWidth = chartWidth / sortedWeeks.length;
    const stepY = chartHeight / maxFreq;

    // Grille
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 7; i++) {
        const y = padding + (chartHeight / 7) * i;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(canvas.width - padding, y);
        ctx.stroke();
    }

    // Barres
    sortedWeeks.forEach((week, i) => {
        const x = padding + i * barWidth;
        const barHeight = frequencies[i] * stepY;
        const y = canvas.height - padding - barHeight;

        // Couleur selon la fréquence (vert si ≥3, orange si 1-2, rouge si 0)
        let color = '#4CAF50';
        if (frequencies[i] < 2) color = '#FF9800';
        if (frequencies[i] === 0) color = '#f44336';

        ctx.fillStyle = color;
        ctx.fillRect(x + 2, y, barWidth - 4, barHeight);

        // Valeur sur la barre
        if (barHeight > 15) {
            ctx.fillStyle = '#fff';
            ctx.font = '11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(frequencies[i], x + barWidth / 2, y - 5);
        }
    });

    // Labels des semaines
    ctx.fillStyle = '#666';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    sortedWeeks.forEach((week, i) => {
        const x = padding + i * barWidth + barWidth / 2;
        ctx.fillText(week, x, canvas.height - padding + 15);
    });

    // Échelle Y
    ctx.textAlign = 'right';
    ctx.fillStyle = '#666';
    for (let i = 0; i <= 7; i++) {
        const value = Math.round((maxFreq / 7) * (7 - i));
        const y = padding + (chartHeight / 7) * i;
        ctx.fillText(value, padding - 10, y + 4);
    }
}

// Fonction helper pour obtenir la clé de semaine (FR-12)
function getWeekKey(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const week = getWeekNumber(d);
    return `S${week} ${year}`;
}

// Fonction helper pour obtenir le numéro de semaine (FR-12)
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Event listener pour le filtre de période (FR-12)
document.addEventListener('DOMContentLoaded', () => {
    periodFilterEl = document.getElementById('period-filter');
    periodChipGroupEl = document.getElementById('period-chip-group');
    periodLabelEl = document.getElementById('progress-period-label');
    heroScoreEl = document.getElementById('hero-score');
    heroVolumeEl = document.getElementById('hero-volume');
    heroFrequencyEl = document.getElementById('hero-frequency');
    heroConsistencyEl = document.getElementById('hero-consistency');
    heroSessionsEl = document.getElementById('hero-sessions');

    if (periodFilterEl) {
        periodFilterEl.addEventListener('change', (e) => {
            currentPeriod = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
            syncPeriodControls();
            loadProgressCharts();
        });
    }

    if (periodChipGroupEl) {
        periodChipGroupEl.addEventListener('click', (event) => {
            const button = event.target.closest('.period-chip');
            if (!button) return;

            const value = button.dataset.period;
            currentPeriod = value === 'all' ? 'all' : parseInt(value, 10);
            syncPeriodControls();
            loadProgressCharts();
        });
    }

    syncPeriodControls();
});

// Rendre la fonction globale
window.loadProgressCharts = loadProgressCharts;

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

function updateHeroMetrics(metrics) {
    if (!heroScoreEl || !heroVolumeEl || !heroFrequencyEl || !heroConsistencyEl || !heroSessionsEl) {
        return;
    }

    const cleanClasses = (element) => {
        if (!element) return;
        element.classList.remove('excellent', 'good', 'fair');
    };

    if (!metrics) {
        cleanClasses(heroScoreEl);
        cleanClasses(heroConsistencyEl);
        heroScoreEl.textContent = '--';
        heroVolumeEl.textContent = '0 min';
        heroFrequencyEl.textContent = '--';
        heroConsistencyEl.textContent = '--';
        heroSessionsEl.textContent = '0 séance analysée';
        return;
    }

    cleanClasses(heroScoreEl);
    cleanClasses(heroConsistencyEl);

    heroScoreEl.textContent = `${metrics.avgPostureScore}/100`;
    if (metrics.avgPostureScore >= 80) {
        heroScoreEl.classList.add('excellent');
    } else if (metrics.avgPostureScore >= 60) {
        heroScoreEl.classList.add('good');
    } else {
        heroScoreEl.classList.add('fair');
    }

    heroVolumeEl.textContent = formatDurationLabel(metrics.totalMinutes);
    heroFrequencyEl.textContent = `${metrics.frequency} séances/sem`;

    heroConsistencyEl.textContent = `${metrics.consistency}%`;
    if (metrics.consistency >= 70) {
        heroConsistencyEl.classList.add('excellent');
    } else if (metrics.consistency >= 50) {
        heroConsistencyEl.classList.add('good');
    } else {
        heroConsistencyEl.classList.add('fair');
    }

    const sessionsText = metrics.totalSessions <= 1
        ? `${metrics.totalSessions} séance analysée`
        : `${metrics.totalSessions} séances analysées`;
    heroSessionsEl.textContent = sessionsText;
}

function syncPeriodControls() {
    if (periodFilterEl) {
        periodFilterEl.value = currentPeriod === 'all' ? 'all' : String(currentPeriod);
    }

    if (periodChipGroupEl) {
        const chips = periodChipGroupEl.querySelectorAll('.period-chip');
        chips.forEach(chip => {
            const isActive = String(currentPeriod) === chip.dataset.period;
            chip.classList.toggle('active', isActive);
        });
    }

    updatePeriodLabelText();
}

function updatePeriodLabelText() {
    if (!periodLabelEl) return;
    const key = currentPeriod === 'all' ? 'all' : String(currentPeriod);
    const label = PERIOD_LABELS[key] || `${key} derniers jours`;
    if (currentPeriod === 'all') {
        periodLabelEl.textContent = 'Historique complet de vos séances';
    } else {
        periodLabelEl.textContent = `Synthèse des ${label}`;
    }
}

