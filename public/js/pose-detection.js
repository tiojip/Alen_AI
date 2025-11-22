// Détection de pose avec MediaPipe
let pose = null;
let camera = null;
let isDetecting = false;
let overlayLastScore = null;
let overlayLastFeedback = [];
let overlayLastUpdate = 0;
let overlayLastSeverity = 'ok';

const POSE_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 7],
    [0, 4], [4, 5], [5, 6], [6, 8],
    [9, 10],
    [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
    [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
    [11, 23], [12, 24], [23, 24],
    [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
    [24, 26], [26, 28], [28, 30], [28, 32], [30, 32]
];

function initializePose() {
    pose = new Pose({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        }
    });

    pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    pose.onResults(onPoseResults);
}

function onPoseResults(results) {
    if (!isDetecting) return;

    const canvas = document.getElementById('workout-canvas') || document.getElementById('eval-canvas');
    const video = document.getElementById('workout-video') || document.getElementById('eval-video');
    
    if (!canvas || !video) return;
    
    // S'assurer que la vidéo a des dimensions valides
    const videoWidth = video.videoWidth || 640;
    const videoHeight = video.videoHeight || 480;
    
    // Ne mettre à jour les dimensions du canvas que si nécessaire
    if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
        canvas.width = videoWidth;
        canvas.height = videoHeight;
    }

    const ctx = canvas.getContext('2d');

    ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Dessiner le flux vidéo sur le canvas pour avoir un support unique (et permettre l'overlay HUD)
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

        if (results.poseLandmarks) {
            const visibleLandmarks = results.poseLandmarks.filter(l => l && l.visibility > 0.5);

            if (visibleLandmarks.length >= 5) {
                const analysis = analyzePosture(results.poseLandmarks, canvas.width, canvas.height);

                const overlayColor = getScoreColor(analysis?.score);
                drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: overlayColor, lineWidth: 4 });
                drawLandmarks(ctx, results.poseLandmarks, { color: overlayColor, lineWidth: 2, radius: 4 });

                window.evalCurrentLandmarks = results.poseLandmarks;

                renderPostureOverlay(ctx, canvas.width, canvas.height, analysis);
            } else {
                overlayLastScore = null;
                overlayLastFeedback = [];
                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.fillRect(12, 12, Math.min(canvas.width - 24, 320), 64);
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '600 18px "Inter", Arial, sans-serif';
                ctx.fillText('Positionnez-vous face à la caméra', 28, 52);
            }
        }

        ctx.restore();
}

// Amélioration du suivi postural en temps réel (FR-10)
let postureErrors = [];
let lastFeedbackTime = 0;
let lastAudioFeedbackTime = 0;
let consecutiveHighRiskCount = 0;
let workoutPostureData = []; // Stocker les données posturales pendant la séance
let highRiskWarningShown = false; // Flag pour s'assurer que l'avertissement n'apparaît qu'une fois
const FEEDBACK_DELAY = 200; // ms entre chaque feedback visuel (optimisé pour ≤250ms)
const AUDIO_FEEDBACK_DELAY = 500; // ms entre chaque feedback audio (pour éviter la surcharge)
const WORKOUT_START_DELAY = 10000; // 10 secondes après le début de la séance avant de pouvoir afficher l'avertissement
const HIGH_RISK_THRESHOLD = 3; // Nombre d'erreurs consécutives avant arrêt automatique

// Fonction pour obtenir le temps de début de la séance
function getWorkoutStartTime() {
    // Essayer de récupérer depuis workout.js
    if (typeof window.workoutStartTime !== 'undefined' && window.workoutStartTime !== null) {
        return window.workoutStartTime;
    }
    // Fallback : utiliser une variable globale si disponible
    if (typeof workoutStartTime !== 'undefined' && workoutStartTime !== null) {
        return workoutStartTime;
    }
    return null;
}

// Seuils de tolérance configurables (FR-10)
const POSTURE_THRESHOLDS = {
    backCurvature: 0.15,      // Seuil pour dos rond
    kneeValgus: 0.05,         // 5% de la largeur pour genoux valgus
    minAmplitude: 0.15,       // 15% de la hauteur pour amplitude minimale
    shoulderAlignment: 0.1,   // Seuil d'alignement des épaules
    armAngle: 45              // Angle minimum pour les bras
};

function analyzePosture(landmarks, width, height) {
    if (!landmarks || landmarks.length < 33) return null;
    
    const feedback = [];
    const now = Date.now();
    const analysisStartTime = performance.now(); // Mesurer la latence
    
    // Points clés (≥ 5 repères comme requis FR-05)
    const nose = landmarks[0];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const leftElbow = landmarks[13];
    const rightElbow = landmarks[14];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];

    // Vérification du dos rond (angle entre épaules et hanches)
    if (leftShoulder && rightShoulder && leftHip && rightHip) {
        const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
        const hipMidY = (leftHip.y + rightHip.y) / 2;
        const backCurvature = Math.abs(shoulderMidY - hipMidY);
        
        if (backCurvature > POSTURE_THRESHOLDS.backCurvature) {
            feedback.push({ 
                type: 'error', 
                message: '⚠️ Gardez le dos droit!', 
                severity: 'high',
                errorType: 'back_rounded',
                value: backCurvature
            });
            postureErrors.push('back_rounded');
        }
    }

    // Vérification genoux valgus (genoux qui rentrent) - précision ≥ 80%
    if (leftKnee && leftAnkle && rightKnee && rightAnkle) {
        const leftKneeX = leftKnee.x * width;
        const leftAnkleX = leftAnkle.x * width;
        const rightKneeX = rightKnee.x * width;
        const rightAnkleX = rightAnkle.x * width;

        const leftAlignment = Math.abs(leftKneeX - leftAnkleX);
        const rightAlignment = Math.abs(rightKneeX - rightAnkleX);
        const threshold = width * POSTURE_THRESHOLDS.kneeValgus;

        if (leftAlignment > threshold || rightAlignment > threshold) {
            const maxAlignment = Math.max(leftAlignment, rightAlignment);
            feedback.push({ 
                type: 'warning', 
                message: '⚠️ Alignez vos genoux avec vos chevilles!', 
                severity: maxAlignment > threshold * 1.5 ? 'high' : 'medium',
                errorType: 'knee_valgus',
                value: maxAlignment
            });
            postureErrors.push('knee_valgus');
        }
    }

    // Vérification amplitude insuffisante (pour squats)
    if (leftHip && leftKnee && rightHip && rightKnee) {
        const leftHipY = leftHip.y * height;
        const leftKneeY = leftKnee.y * height;
        const hipKneeDistance = Math.abs(leftHipY - leftKneeY);
        const minAmplitude = height * POSTURE_THRESHOLDS.minAmplitude;
        
        if (hipKneeDistance < minAmplitude && leftKneeY > leftHipY) {
            feedback.push({ 
                type: 'warning', 
                message: '💡 Descendez plus bas pour une meilleure amplitude', 
                severity: 'low',
                errorType: 'insufficient_amplitude',
                value: hipKneeDistance / minAmplitude
            });
        }
    }

    // Vérification de l'alignement général
    if (nose && leftShoulder && rightShoulder) {
        const shoulderAlignment = Math.abs(leftShoulder.x - rightShoulder.x);
        if (shoulderAlignment > POSTURE_THRESHOLDS.shoulderAlignment) {
            feedback.push({ 
                type: 'info', 
                message: '💡 Gardez les épaules alignées', 
                severity: 'low',
                errorType: 'shoulder_misalignment'
            });
        }
    }

    // Vérification des bras (pour push-ups)
    if (leftShoulder && leftElbow && rightShoulder && rightElbow) {
        const leftArmAngle = calculateAngle(leftShoulder, leftElbow, {x: leftShoulder.x, y: leftShoulder.y - 0.1});
        const rightArmAngle = calculateAngle(rightShoulder, rightElbow, {x: rightShoulder.x, y: rightShoulder.y - 0.1});
        
        // Vérifier si les bras sont trop écartés
        if (leftArmAngle < POSTURE_THRESHOLDS.armAngle || rightArmAngle < POSTURE_THRESHOLDS.armAngle) {
            feedback.push({ 
                type: 'info', 
                message: '💡 Gardez les bras à 90°', 
                severity: 'low',
                errorType: 'arm_angle'
            });
        }
    }

    // Vérification de la position de la tête (pour éviter les blessures au cou)
    if (nose && leftShoulder && rightShoulder) {
        const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
        const headPosition = nose.y;
        const headDeviation = Math.abs(headPosition - shoulderMidY);
        
        if (headDeviation > 0.2) {
            feedback.push({ 
                type: 'warning', 
                message: '⚠️ Gardez la tête alignée avec le corps', 
                severity: 'medium',
                errorType: 'head_misalignment'
            });
        }
    }

    const postureScore = calculatePostureScore(landmarks, width, height);

    // Stocker les données posturales pour analyse (FR-10)
    if (window.currentWorkoutActive) {
        workoutPostureData.push({
            timestamp: Date.now(),
            score: postureScore,
            errors: feedback.map(f => f.errorType).filter(Boolean),
            landmarks: JSON.parse(JSON.stringify(landmarks))
        });
    }

    // Mesurer la latence d'analyse
    const analysisLatency = performance.now() - analysisStartTime;
    
    // Afficher le feedback visuel (≤250ms) - FR-10
    if (now - lastFeedbackTime >= FEEDBACK_DELAY) {
        displayPostureFeedback(feedback, postureScore);
        updatePostureScoreIndicator(postureScore);
        lastFeedbackTime = now;
        
        // Log de performance si latence > 250ms
        if (analysisLatency > 250) {
            console.warn(`Latence d'analyse posturale: ${analysisLatency.toFixed(2)}ms (objectif: ≤250ms)`);
        }
    }

    // Feedback audio pour erreurs critiques (FR-10)
    const highRiskErrors = feedback.filter(f => f.severity === 'high');
    if (highRiskErrors.length > 0 && now - lastAudioFeedbackTime >= AUDIO_FEEDBACK_DELAY) {
        playPostureWarningSound('error');
        lastAudioFeedbackTime = now;
        consecutiveHighRiskCount++;
        
        // Vérifier si au moins 10 secondes se sont écoulées depuis le début de la séance
        const workoutStartTime = getWorkoutStartTime();
        if (workoutStartTime !== null) {
            const timeSinceWorkoutStart = now - workoutStartTime;
            
            // Afficher l'avertissement seulement si :
            // 1. Au moins 10 secondes se sont écoulées depuis le début de la séance
            // 2. L'avertissement n'a pas encore été affiché
            // 3. Il y a effectivement une mauvaise posture (highRiskErrors.length > 0)
            if (timeSinceWorkoutStart >= WORKOUT_START_DELAY && !highRiskWarningShown && highRiskErrors.length > 0) {
                triggerAutomaticStop('Risque postural élevé détecté. Séance interrompue pour votre sécurité.');
                highRiskWarningShown = true; // Marquer que l'avertissement a été affiché (une seule fois)
            }
        }
    } else if (feedback.length === 0 || highRiskErrors.length === 0) {
        // Réinitialiser le compteur si pas d'erreur critique
        // Mais NE PAS réinitialiser highRiskWarningShown pour s'assurer qu'il n'apparaît qu'une fois
        consecutiveHighRiskCount = 0;
    }

    // Feedback audio pour avertissements moyens
    const mediumRiskErrors = feedback.filter(f => f.severity === 'medium');
    if (mediumRiskErrors.length > 0 && now - lastAudioFeedbackTime >= AUDIO_FEEDBACK_DELAY) {
        playPostureWarningSound('warning');
        lastAudioFeedbackTime = now;
    }
    overlayLastScore = postureScore;
    overlayLastFeedback = feedback;
    overlayLastUpdate = Date.now();

    window.currentPostureScore = postureScore;
    window.currentPostureFeedback = feedback;

    return {
        score: postureScore,
        feedback
    };
}

function getScoreColor(score) {
    if (typeof score !== 'number') {
        return '#00FF00';
    }
    if (score >= 90) return '#2ecc71';
    if (score >= 75) return '#f1c40f';
    if (score >= 60) return '#e67e22';
    return '#e74c3c';
}

function getScoreLabel(score) {
    if (typeof score !== 'number') {
        return 'En attente de repères';
    }
    if (score >= 90) return 'Posture excellente';
    if (score >= 75) return 'Posture solide';
    if (score >= 60) return 'À corriger';
    return 'Corrigez immédiatement';
}

function getPrimaryFeedback(feedback = []) {
    if (!feedback || feedback.length === 0) {
        return null;
    }
    const priority = feedback.find(f => f.severity === 'high') ||
        feedback.find(f => f.severity === 'medium') ||
        feedback[0];
    return priority;
}

function renderPostureOverlay(ctx, width, height, analysis) {
    const score = analysis?.score ?? overlayLastScore;
    const feedback = analysis?.feedback ?? overlayLastFeedback;
    const label = getScoreLabel(score);
    const color = getScoreColor(score);
    const primaryFeedback = getPrimaryFeedback(feedback);
    const severity = primaryFeedback?.severity || (feedback && feedback.length ? 'low' : 'ok');
    overlayLastSeverity = severity;

    // Ne rien afficher si aucune donnée récente
    if (score === null || score === undefined) {
        return;
    }

    ctx.save();

    const hudWidth = Math.min(260, width - 32);
    const hudHeight = 86;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    fillRoundedRect(ctx, 16, 16, hudWidth, hudHeight, 12);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 22px "Inter", Arial, sans-serif';
    ctx.fillText(`Score: ${Math.round(score)}/100`, 32, 52);

    ctx.font = '500 15px "Inter", Arial, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(label, 32, 74);

    if (primaryFeedback) {
        const feedbackHeight = 90;
        const yStart = height - feedbackHeight - 24;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        fillRoundedRect(ctx, 16, yStart, width - 32, feedbackHeight, 12);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '600 18px "Inter", Arial, sans-serif';
        ctx.fillText('Conseil posture', 32, yStart + 34);

        ctx.font = '400 15px "Inter", Arial, sans-serif';
        const message = primaryFeedback.message.replace(/^[⚠️💡✓ ]+/g, '');
        wrapCanvasText(ctx, message, 32, yStart + 60, width - 64, 22);
    } else {
        const tipHeight = 58;
        const yStart = height - tipHeight - 24;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        fillRoundedRect(ctx, 16, yStart, 210, tipHeight, 10);

        ctx.fillStyle = '#2ecc71';
        ctx.font = '600 16px "Inter", Arial, sans-serif';
        ctx.fillText('✓ Posture stable', 32, yStart + 32);
    }

    drawStatusIndicator(ctx, width, height, severity, color);

    ctx.restore();
}

function fillRoundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, radius);
    } else {
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }
    ctx.fill();
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';

    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            ctx.fillText(line.trim(), x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line.trim(), x, y);
}

function drawStatusIndicator(ctx, width, height, severity, baseColor) {
    const now = Date.now();
    const padding = 24;
    const indicatorRadius = 16;
    let lightColor = baseColor;
    let borderColor = baseColor;
    let glowOpacity = 0.45;
    let borderWidth = 6;

    if (severity === 'high') {
        borderColor = '#e74c3c';
        lightColor = '#ff5c5c';
        borderWidth = 10;
        glowOpacity = 0.65;
    } else if (severity === 'medium') {
        borderColor = '#f1c40f';
        lightColor = '#ffe082';
        borderWidth = 8;
        glowOpacity = 0.55;
    } else if (severity === 'low') {
        borderColor = '#f39c12';
        lightColor = '#ffda79';
        borderWidth = 7;
        glowOpacity = 0.5;
    } else {
        borderColor = '#2ecc71';
        lightColor = '#7bed9f';
        borderWidth = 6;
        glowOpacity = 0.35;
    }

    const pulse = Math.sin(now / 200) * 0.3 + 0.7;
    const glowRadius = indicatorRadius * (1.8 + pulse * 0.4);

    ctx.save();

    ctx.globalAlpha = glowOpacity;
    ctx.fillStyle = lightColor;
    ctx.beginPath();
    ctx.arc(padding, height - padding, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = borderColor;
    ctx.beginPath();
    ctx.arc(padding, height - padding, indicatorRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = borderWidth;
    ctx.strokeStyle = borderColor;
    ctx.strokeRect(
        borderWidth / 2,
        borderWidth / 2,
        width - borderWidth,
        height - borderWidth
    );

    ctx.restore();
}

// Jouer un son d'avertissement postural (FR-10)
function playPostureWarningSound(type) {
    if (typeof playSound !== 'function') return;
    
    if (type === 'error') {
        // Son d'erreur critique (fréquence plus basse, plus grave)
        playSound('posture-error');
    } else if (type === 'warning') {
        // Son d'avertissement (fréquence moyenne)
        playSound('posture-warning');
    }
}

// Déclencher l'arrêt automatique (FR-10)
function triggerAutomaticStop(reason) {
    // S'assurer que l'avertissement n'est affiché qu'une seule fois
    if (highRiskWarningShown) {
        return;
    }
    
    console.warn('Arrêt automatique déclenché:', reason);
    
    // Afficher une alerte visuelle
    const feedbackBox = document.getElementById('workout-feedback');
    if (feedbackBox) {
        feedbackBox.innerHTML = `<p style="color: red; font-weight: bold;">🛑 ${reason}</p>`;
        feedbackBox.className = 'feedback-box error';
    }
    
    // Son d'alerte critique
    if (typeof playSound === 'function') {
        playSound('posture-error');
    }
    
    // Arrêter la séance automatiquement
    if (typeof stopWorkout === 'function') {
        setTimeout(() => {
            stopWorkout();
            alert(reason);
        }, 2000); // Attendre 2 secondes pour que l'utilisateur voie le message
    }
    
    // Marquer que l'avertissement a été affiché
    highRiskWarningShown = true;
}

// Mettre à jour l'indicateur de score postural (FR-10)
function updatePostureScoreIndicator(score) {
    const indicator = document.getElementById('posture-score-indicator');
    const scoreValue = document.getElementById('posture-score-value');
    
    if (!indicator || !scoreValue) return;
    
    // Afficher l'indicateur
    indicator.classList.remove('hidden');
    
    // Mettre à jour la valeur
    scoreValue.textContent = `${score}/100`;
    
    // Appliquer la classe de couleur selon le score
    scoreValue.classList.remove('excellent', 'good', 'fair', 'poor', 'critical');
    
    if (score >= 90) {
        scoreValue.classList.add('excellent');
    } else if (score >= 75) {
        scoreValue.classList.add('good');
    } else if (score >= 60) {
        scoreValue.classList.add('fair');
    } else if (score >= 40) {
        scoreValue.classList.add('poor');
    } else {
        scoreValue.classList.add('critical');
    }
}

function calculateAngle(point1, point2, point3) {
    const a = Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2));
    const b = Math.sqrt(Math.pow(point3.x - point1.x, 2) + Math.pow(point3.y - point1.y, 2));
    const c = Math.sqrt(Math.pow(point3.x - point2.x, 2) + Math.pow(point3.y - point2.y, 2));
    const angle = Math.acos((a * a + b * b - c * c) / (2 * a * b));
    return angle * (180 / Math.PI);
}

function displayPostureFeedback(feedback, postureScore = null) {
    const feedbackBox = document.getElementById('workout-feedback') || document.getElementById('eval-feedback');
    if (!feedbackBox) return;

    // Ne pas écraser le feedback si on est en repos
    if (document.getElementById('rest-countdown') && !document.getElementById('rest-countdown').classList.contains('hidden')) {
        return;
    }

    if (feedback.length === 0) {
        const scoreDisplay = postureScore !== null ? ` <span style="color: var(--primary-color); font-weight: bold;">(${postureScore}/100)</span>` : '';
        feedbackBox.innerHTML = `<p style="color: green;">✓ Posture correcte${scoreDisplay}</p>`;
        feedbackBox.className = 'feedback-box';
    } else {
        const errorFeedback = feedback.find(f => f.type === 'error' || f.severity === 'high');
        const warningFeedback = feedback.find(f => f.type === 'warning' || f.severity === 'medium');
        
        let html = '';
        if (errorFeedback) {
            html = `<p style="font-weight: bold;">${errorFeedback.message}</p>`;
            if (postureScore !== null) {
                html += `<p style="font-size: 0.9rem; margin-top: 0.5rem;">Score: ${postureScore}/100</p>`;
            }
            feedbackBox.innerHTML = html;
            feedbackBox.className = 'feedback-box error';
        } else if (warningFeedback) {
            html = `<p>${warningFeedback.message}</p>`;
            if (postureScore !== null) {
                html += `<p style="font-size: 0.9rem; margin-top: 0.5rem;">Score: ${postureScore}/100</p>`;
            }
            feedbackBox.innerHTML = html;
            feedbackBox.className = 'feedback-box warning';
        } else {
            html = feedback.map(f => `<p>${f.message}</p>`).join('');
            if (postureScore !== null) {
                html += `<p style="font-size: 0.9rem; margin-top: 0.5rem;">Score: ${postureScore}/100</p>`;
            }
            feedbackBox.innerHTML = html;
            feedbackBox.className = 'feedback-box';
        }
    }
}

async function startCamera(videoElement, canvasElement) {
    try {
        // Détecter si on est sur mobile
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                        (window.innerWidth <= 768);
        
        // Contraintes vidéo adaptées selon l'appareil
        const videoConstraints = isMobile ? {
            facingMode: 'user', // Caméra frontale sur mobile
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 }
        } : {
            width: { ideal: 640 },
            height: { ideal: 480 }
        };
        
        const stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints
        });
        
        videoElement.srcObject = stream;
        
        // Attendre que les métadonnées soient chargées
        await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                // Ajuster le canvas aux dimensions réelles de la vidéo
                const actualWidth = videoElement.videoWidth || 640;
                const actualHeight = videoElement.videoHeight || 480;
                
                // S'assurer que le canvas a les bonnes dimensions
                if (canvasElement) {
                    canvasElement.width = actualWidth;
                    canvasElement.height = actualHeight;
                }
                
                videoElement.play().then(() => {
                    isDetecting = true;
                    resolve();
                }).catch((err) => {
                    console.warn('Erreur lecture vidéo:', err);
                    isDetecting = true;
                    resolve();
                });
            };
        });

        if (!pose) {
            initializePose();
        }

        // Utiliser les dimensions réelles de la vidéo
        const videoWidth = videoElement.videoWidth || 640;
        const videoHeight = videoElement.videoHeight || 480;
        
        camera = new Camera(videoElement, {
            onFrame: async () => {
                if (isDetecting && pose) {
                    await pose.send({ image: videoElement });
                }
            },
            width: videoWidth,
            height: videoHeight
        });
        camera.start();
    } catch (error) {
        console.error('Erreur caméra:', error);
        const errorMessage = error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'
            ? 'Permission d\'accès à la caméra refusée. Veuillez autoriser l\'accès dans les paramètres de votre navigateur.'
            : error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError'
            ? 'Aucune caméra trouvée. Veuillez connecter une caméra.'
            : 'Impossible d\'accéder à la caméra. Vérifiez les permissions et que votre appareil dispose d\'une caméra.';
        alert(errorMessage);
    }
}

function stopCamera() {
    isDetecting = false;
    if (camera) {
        camera.stop();
        camera = null;
    }
    
    const video = document.getElementById('workout-video') || document.getElementById('eval-video');
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
}

// Réinitialiser les variables d'avertissement postural
function resetPostureWarning() {
    highRiskWarningShown = false;
    consecutiveHighRiskCount = 0;
}

// Exposer la fonction globalement
window.resetPostureWarning = resetPostureWarning;

// Calculer un score de posture complet (0-100) basé sur ≥5 repères (FR-05)
function calculatePostureScore(landmarks, width, height) {
    if (!landmarks || landmarks.length < 33) return 0;
    
    let score = 100;
    let detectedLandmarks = 0;
    
    // Vérifier la présence d'au moins 5 repères clés (FR-05)
    const keyLandmarks = [
        landmarks[0],  // Nose
        landmarks[11], // Left shoulder
        landmarks[12], // Right shoulder
        landmarks[23], // Left hip
        landmarks[24], // Right hip
        landmarks[25], // Left knee
        landmarks[26], // Right knee
        landmarks[27], // Left ankle
        landmarks[28]  // Right ankle
    ];
    
    detectedLandmarks = keyLandmarks.filter(l => l && l.visibility > 0.5).length;
    
    // Si moins de 5 repères détectés, score réduit
    if (detectedLandmarks < 5) {
        return Math.max(0, (detectedLandmarks / 5) * 50); // Max 50 si < 5 repères
    }
    
    // Analyser l'alignement et la posture avec les repères détectés
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const nose = landmarks[0];
    
    // 1. Alignement vertical (épaules-hanches-genoux-chevilles)
    if (leftShoulder && leftHip && leftKnee && leftAnkle) {
        const shoulderX = leftShoulder.x * width;
        const hipX = leftHip.x * width;
        const kneeX = leftKnee.x * width;
        const ankleX = leftAnkle.x * width;
        
        // Calculer l'écart d'alignement
        const alignmentDeviation = Math.abs(shoulderX - hipX) + Math.abs(hipX - kneeX) + Math.abs(kneeX - ankleX);
        const maxDeviation = width * 0.1; // 10% de la largeur
        
        if (alignmentDeviation > maxDeviation) {
            score -= Math.min(30, (alignmentDeviation / maxDeviation) * 30);
        }
    }
    
    // 2. Dos droit (angle épaules-hanches)
    if (leftShoulder && rightShoulder && leftHip && rightHip) {
        const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
        const hipMidY = (leftHip.y + rightHip.y) / 2;
        const backCurvature = Math.abs(shoulderMidY - hipMidY);
        
        if (backCurvature > 0.15) {
            score -= 25; // Dos rond
        } else if (backCurvature > 0.1) {
            score -= 10; // Légère courbure
        }
    }
    
    // 3. Alignement horizontal des épaules
    if (leftShoulder && rightShoulder) {
        const shoulderAlignment = Math.abs(leftShoulder.y - rightShoulder.y);
        if (shoulderAlignment > 0.05) {
            score -= 10; // Épaules désalignées
        }
    }
    
    // 4. Alignement des hanches
    if (leftHip && rightHip) {
        const hipAlignment = Math.abs(leftHip.y - rightHip.y);
        if (hipAlignment > 0.05) {
            score -= 10; // Hanches désalignées
        }
    }
    
    // 5. Genoux valgus (genoux qui rentrent)
    if (leftKnee && leftAnkle && rightKnee && rightAnkle) {
        const leftKneeX = leftKnee.x * width;
        const leftAnkleX = leftAnkle.x * width;
        const rightKneeX = rightKnee.x * width;
        const rightAnkleX = rightAnkle.x * width;
        
        const leftValgus = Math.abs(leftKneeX - leftAnkleX);
        const rightValgus = Math.abs(rightKneeX - rightAnkleX);
        const threshold = width * 0.05; // 5% de la largeur
        
        if (leftValgus > threshold || rightValgus > threshold) {
            score -= 20; // Genoux valgus
        }
    }
    
    // 6. Position de la tête (alignement avec le corps)
    if (nose && leftShoulder && rightShoulder) {
        const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
        const headDeviation = Math.abs(nose.x - shoulderMidX);
        
        if (headDeviation > 0.1) {
            score -= 5; // Tête désalignée
        }
    }
    
    // Bonus pour bonne détection de tous les repères
    if (detectedLandmarks >= 9) {
        score += 5; // Bonus si tous les repères sont bien détectés
    }
    
    return Math.max(0, Math.min(100, Math.round(score)));
}

