// API Client
const API_BASE = '';

class API {
    constructor() {
        this.token = localStorage.getItem('token');
    }

    async request(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const config = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(this.token && { 'Authorization': `Bearer ${this.token}` }),
                ...options.headers
            }
        };

        try {
            const response = await fetch(url, config);
            
            // Gérer les erreurs d'authentification
            if (response.status === 401 || response.status === 403) {
                this.setToken(null);
                // Lire le message d'erreur avant de throw
                let errorMessage = 'Session expirée. Veuillez vous reconnecter.';
                try {
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        const text = await response.text();
                        if (text) {
                            const errorData = JSON.parse(text);
                            errorMessage = errorData.error || errorMessage;
                        }
                    } else {
                        const text = await response.text();
                        if (text && text !== 'Unauthorized' && text.trim()) {
                            errorMessage = text;
                        }
                    }
                } catch (e) {
                    // Ignorer les erreurs de parsing pour les 401/403
                }
                throw new Error(errorMessage);
            }

            // Essayer de parser JSON
            let data;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                try {
                    const text = await response.text();
                    if (text) {
                        data = JSON.parse(text);
                    } else {
                        data = {};
                    }
                } catch (parseError) {
                    // Si le parsing JSON échoue, c'est probablement une erreur serveur
                    throw new Error('Réponse invalide du serveur');
                }
            } else {
                // Si ce n'est pas du JSON, lire comme texte
                const text = await response.text();
                if (!response.ok) {
                    throw new Error(text || 'Erreur API');
                }
                return { message: text };
            }
            
            if (!response.ok) {
                throw new Error(data.error || data.message || 'Erreur API');
            }
            
            return data;
        } catch (error) {
            // Ne pas logger les erreurs d'authentification normales ou si pas de token (utilisateur non connecté)
            const isAuthError = error.message.includes('Session expirée') || 
                               error.message.includes('Token') ||
                               error.message.includes('Token manquant') ||
                               error.message.includes('Unauthorized');
            if (!isAuthError) {
                console.error('API Error:', error);
            }
            throw error;
        }
    }

    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('token', token);
        } else {
            localStorage.removeItem('token');
        }
    }

    // Auth
    async register(email, password, name) {
        const data = await this.request('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, name })
        });
        if (data.token) {
            this.setToken(data.token);
        }
        return data;
    }

    async login(email, password) {
        const data = await this.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        if (data.token) {
            this.setToken(data.token);
        }
        return data;
    }

    logout() {
        this.setToken(null);
    }

    async requestPasswordReset(email) {
        return this.request('/api/auth/password-reset/request', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
    }

    async confirmPasswordReset(token, password) {
        return this.request('/api/auth/password-reset/confirm', {
            method: 'POST',
            body: JSON.stringify({ token, password })
        });
    }

    // User
    async getProfile() {
        return this.request('/api/user/profile');
    }

    async updateProfile(profile) {
        return this.request('/api/user/profile', {
            method: 'PUT',
            body: JSON.stringify(profile)
        });
    }

    async getExtendedProfile() {
        return this.request('/api/user/profile/extended');
    }

    async updateExtendedProfile(profile) {
        return this.request('/api/user/profile/extended', {
            method: 'PUT',
            body: JSON.stringify(profile)
        });
    }

    async getPreferences() {
        return this.request('/api/user/preferences');
    }

    async updatePreferences(prefs) {
        return this.request('/api/user/preferences', {
            method: 'PUT',
            body: JSON.stringify(prefs)
        });
    }

    // Workout
    async generatePlan(profile) {
        const startTime = Date.now();
        const response = await this.request('/api/workout/generate', {
            method: 'POST',
            body: JSON.stringify({ profile })
        });
        
        // Afficher le temps de génération si disponible
        if (response.generationTime) {
            console.log(`Plan généré en ${response.generationTime} (SLA ≤5s: ${response.slaMet ? '✅' : '❌'})`);
        }
        
        return response;
    }

    async getPlan() {
        return this.request('/api/workout/plan');
    }

    async updatePlan(plan) {
        const startTime = Date.now();
        const response = await this.request('/api/workout/plan', {
            method: 'PUT',
            body: JSON.stringify({ plan })
        });
        
        // Afficher le temps de sauvegarde si disponible
        if (response.saveTime) {
            console.log(`Plan sauvegardé en ${response.saveTime} (SLA <3s: ${response.slaMet ? '✅' : '❌'})`);
        }
        
        return response;
    }

    async getPlanHistory() {
        return this.request('/api/workout/plan/history');
    }

    async rollbackPlan(historyId) {
        const startTime = Date.now();
        const response = await this.request('/api/workout/plan/rollback', {
            method: 'POST',
            body: JSON.stringify({ historyId })
        });
        
        // Afficher le temps de roll-back si disponible
        if (response.rollbackTime) {
            console.log(`Plan restauré en ${response.rollbackTime} (SLA <3s: ${response.slaMet ? '✅' : '❌'})`);
        }
        
        return response;
    }

    // Sessions
    async saveSession(sessionData, feedback, postureScore) {
        return this.request('/api/session', {
            method: 'POST',
            body: JSON.stringify({ sessionData, feedback, postureScore })
        });
    }

    async getSessionHistory() {
        return this.request('/api/session/history');
    }

    // Progress
    async getProgress() {
        return this.request('/api/progress');
    }

    async getChatSuggestions() {
        return this.request('/api/chat/suggestions');
    }

    // Chat avec streaming (FR-14)
    async sendChatMessage(message, onChunk, onComplete) {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('Non authentifié');
        }
        
        try {
            const response = await fetch(`${API_BASE}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ message, stream: true })
            });
            
            if (!response.ok) {
                // Si ce n'est pas un stream, essayer de lire l'erreur JSON
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const error = await response.json();
                    throw new Error(error.error || 'Erreur chat');
                } else {
                    const errorText = await response.text();
                    throw new Error(errorText || 'Erreur serveur');
                }
            }
            
            // Vérifier si c'est un stream ou une réponse JSON normale
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('text/event-stream')) {
                // Lire le stream (Server-Sent Events) (FR-14)
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let firstTokenTime = null;
                let fullResponse = '';
                
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || ''; // Garder la ligne incomplète
                        
                        for (const line of lines) {
                            if (line.trim() === '') continue; // Ignorer les lignes vides
                            
                            if (line.startsWith('data: ')) {
                                try {
                                    const jsonStr = line.slice(6).trim();
                                    if (!jsonStr) continue;
                                    
                                    const data = JSON.parse(jsonStr);
                                    
                                    if (data.type === 'first_token') {
                                        firstTokenTime = data.time;
                                        console.log(`Premier token reçu en ${firstTokenTime}ms (SLA <2s: ${firstTokenTime < 2000 ? '✅' : '❌'})`);
                                    } else if (data.type === 'chunk') {
                                        fullResponse += data.content;
                                        if (onChunk) {
                                            onChunk(data.content, fullResponse);
                                        }
                                    } else if (data.type === 'done') {
                                        if (onComplete) {
                                            onComplete({
                                                response: data.response || fullResponse,
                                                firstTokenTime: data.firstTokenTime || firstTokenTime,
                                                totalTime: data.totalTime,
                                                slaMet: data.slaMet,
                                                source: 'ai'
                                            });
                                        }
                                        return {
                                            response: data.response || fullResponse,
                                            firstTokenTime: data.firstTokenTime || firstTokenTime,
                                            totalTime: data.totalTime,
                                            slaMet: data.slaMet,
                                            source: 'ai'
                                        };
                                    }
                                } catch (e) {
                                    console.error('Erreur parsing SSE ligne:', line, e);
                                }
                            }
                        }
                    }
                } finally {
                    reader.releaseLock();
                }
                
                // Si on arrive ici sans 'done', retourner la réponse accumulée
                if (fullResponse) {
                    if (onComplete) {
                        onComplete({
                            response: fullResponse,
                            firstTokenTime: firstTokenTime,
                            totalTime: 0,
                            slaMet: firstTokenTime ? firstTokenTime < 2000 : false,
                            source: 'ai'
                        });
                    }
                    return {
                        response: fullResponse,
                        firstTokenTime: firstTokenTime,
                        source: 'ai'
                    };
                }
            } else {
                // Mode non-streaming (fallback)
                const data = await response.json();
                if (onComplete) {
                    onComplete({
                        response: data.response,
                        firstTokenTime: data.responseTime,
                        totalTime: data.responseTime,
                        slaMet: data.slaMet,
                        source: data.source || 'ai'
                    });
                }
                return {
                    response: data.response,
                    firstTokenTime: data.responseTime,
                    totalTime: data.responseTime,
                    slaMet: data.slaMet,
                    source: data.source || 'ai'
                };
            }
        } catch (error) {
            console.error('Erreur chat:', error);
            throw error;
        }
    }

    // Générer des conseils IA post-séance (FR-11) - SLA ≤3s
    async generatePostSessionAdvice(sessionData, profile, extendedProfile) {
        return this.request('/api/session/advice', {
            method: 'POST',
            body: JSON.stringify({ sessionData, profile, extendedProfile })
        });
    }

    // Progression
    async saveProgress(metrics) {
        return this.request('/api/progress', {
            method: 'POST',
            body: JSON.stringify({ metrics })
        });
    }

    // Indicateurs de performance (FR-15)
    async getPerformanceIndicators() {
        return this.request('/api/performance/indicators');
    }

    // Logs d'optimisation (FR-15)
    async getPerformanceLogs() {
        return this.request('/api/performance/logs');
    }
}

const api = new API();


