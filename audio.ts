
import { get, set, keys } from 'idb-keyval';
import { TTSPreset } from './types';

export type PrefetchResult = 'CACHED' | 'DOWNLOADED' | 'FAILED';

export class AudioService {
    private static instance: AudioService;
    private currentAudio: HTMLAudioElement | null = null;
    
    // Concurrency Control
    private playbackId = 0; 
    private currentResolve: (() => void) | null = null;
    
    // Prevent multiple initializations
    private constructor() {}

    public static getInstance(): AudioService {
        if (!AudioService.instance) {
            AudioService.instance = new AudioService();
        }
        return AudioService.instance;
    }

    /**
     * Helper to fetch audio from 302.ai generic format
     */
    private async fetchFrom302(text: string, voiceId: string, ttsPreset: TTSPreset): Promise<Blob | null> {
        try {
             const requestBody = {
                text: text,
                provider: ttsPreset.provider, // e.g. 'doubao', 'openai', 'azure'
                voice: voiceId,
                model: ttsPreset.modelId, // Optional
                speed: 1.0,
                volume: 1.0,
                // Optional parameters per spec
                // output_format: "mp3",
                // emotion: "" 
            };

            const baseUrl = ttsPreset.baseUrl || 'https://api.302.ai/302/tts/generate';

            // 1. Call Generate API
            const response = await fetch(baseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${ttsPreset.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const err = await response.text();
                console.error(`TTS Generate Error (${response.status}): ${err}`);
                return null;
            }

            const json = await response.json();
            
            // 2. Get Audio URL from response
            if (!json.audio_url) {
                console.error("TTS Response missing audio_url", json);
                return null;
            }

            // 3. Fetch the actual audio file
            const audioResponse = await fetch(json.audio_url);
            if (!audioResponse.ok) {
                console.error("Failed to download generated audio file");
                return null;
            }

            return await audioResponse.blob();

        } catch (e) {
            console.error("TTS Service Error", e);
            return null;
        }
    }

    /**
     * Checks how many of the provided cache keys exist in IndexedDB.
     */
    public async checkCacheStatus(targetKeys: string[]): Promise<number> {
        if (!targetKeys || targetKeys.length === 0) return 0;
        try {
            const allKeys = await keys(); // Get all keys from store
            const keySet = new Set(allKeys);
            let count = 0;
            for (const k of targetKeys) {
                if (keySet.has(k)) count++;
            }
            return count;
        } catch (e) {
            console.error("Cache check failed", e);
            return 0;
        }
    }

    /**
     * Pre-fetches audio and stores it in IndexedDB without playing.
     * Returns status indicating source (Cache vs Network).
     */
    public async prefetch(
        text: string,
        voiceId: string,
        cacheKey: string,
        ttsPreset: TTSPreset
    ): Promise<PrefetchResult> {
        if (!text) return 'FAILED';

        try {
            // 1. Check Cache
            const cached = await get(cacheKey);
            if (cached) return 'CACHED';

            // 2. Fetch logic
            if (!ttsPreset.apiKey) return 'FAILED';

            const audioBlob = await this.fetchFrom302(text, voiceId, ttsPreset);

            if (!audioBlob) return 'FAILED';
            
            // 3. Store
            await set(cacheKey, audioBlob);
            return 'DOWNLOADED';
        } catch (e) {
            console.error("Prefetch error", e);
            return 'FAILED';
        }
    }

    /**
     * Fetches TTS audio from API or Cache, and plays it.
     * Returns a promise that resolves when playback finishes.
     */
    public async playOrGenerate(
        text: string, 
        voiceId: string, 
        cacheKey: string, 
        ttsPreset: TTSPreset,
        onPlayStart?: () => void,
        onPlayEnd?: () => void
    ): Promise<void> {
        if (!text) {
            return Promise.resolve();
        }

        try {
            // 1. Reset state and capture new playback ID
            this.stop(); 
            const myId = this.playbackId;

            // 2. Check IndexedDB Cache
            let audioBlob = await get(cacheKey);

            // Check cancellation after DB read
            if (this.playbackId !== myId) return Promise.resolve();

            // 3. If miss, fetch
            if (!audioBlob) {
                if (!ttsPreset.apiKey) {
                    console.warn("TTS Config invalid (Missing Key)");
                    return Promise.resolve();
                }

                audioBlob = await this.fetchFrom302(text, voiceId, ttsPreset);

                // Check cancellation after network request (The most likely race condition point)
                if (this.playbackId !== myId) return Promise.resolve();

                if (audioBlob) {
                     // Store in Cache
                    await set(cacheKey, audioBlob);
                } else {
                    console.warn("TTS API failed to generate audio.");
                    return Promise.resolve();
                }
            }

            // Final check before playing
            if (this.playbackId !== myId) return Promise.resolve();

            // 4. Play
            return new Promise((resolve) => {
                // Paranoid check
                if (this.playbackId !== myId) {
                    resolve();
                    return;
                }

                const url = URL.createObjectURL(audioBlob);
                const audio = new Audio(url);
                this.currentAudio = audio;
                this.currentResolve = resolve;

                audio.onplay = () => {
                    if (onPlayStart) onPlayStart();
                };

                audio.onended = () => {
                    URL.revokeObjectURL(url);
                    // Check if this is still the active audio
                    if (this.currentAudio === audio) {
                        this.currentAudio = null;
                        this.currentResolve = null;
                    }
                    if (onPlayEnd) onPlayEnd();
                    resolve();
                };

                audio.onerror = (e) => {
                    console.error("Audio Playback Error", e);
                    URL.revokeObjectURL(url);
                    if (this.currentAudio === audio) {
                        this.currentAudio = null;
                        this.currentResolve = null;
                    }
                    resolve(); // Resolve anyway to not block game
                };

                audio.play().catch(e => {
                    console.warn("Autoplay blocked or error", e);
                    // Often happens if user interacts quickly. Resolve to continue.
                    resolve();
                });
            });

        } catch (e) {
            console.error("TTS Service Fatal Error", e);
            return Promise.resolve();
        }
    }

    public stop() {
        // Increment ID to invalidate any pending async fetches
        this.playbackId++;

        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio.removeAttribute('src'); // Detach resource
            this.currentAudio = null;
        }

        // IMPORTANT: Resolve any pending promises so logic loops (like TheaterEngine) don't hang
        if (this.currentResolve) {
            this.currentResolve();
            this.currentResolve = null;
        }
    }
}
