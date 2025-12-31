
import { get, set, keys } from 'idb-keyval';
import { TTSPreset } from './types';

export type PrefetchResult = 'CACHED' | 'DOWNLOADED' | 'FAILED';

export class AudioService {
    private static instance: AudioService;
    private currentAudio: HTMLAudioElement | null = null;

    // Concurrency Control
    private playbackId = 0;
    private currentResolve: (() => void) | null = null;

    private constructor() { }

    public static getInstance(): AudioService {
        if (!AudioService.instance) {
            AudioService.instance = new AudioService();
        }
        return AudioService.instance;
    }

    /**
     * Fetch from Edge TTS (Python Backend)
     */
    private async fetchFromEdge(text: string, voiceId: string, speed: number = 1.0): Promise<Blob | null> {
        try {
            // Convert speed (0.5 to 2.0) to edge-tts rate string (e.g., "+0%", "-50%", "+100%")
            const rateInt = Math.round((speed - 1.0) * 100);
            const rateStr = rateInt >= 0 ? `+${rateInt}%` : `${rateInt}%`;

            const response = await fetch('/api/edge-tts-generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    voice: voiceId || 'zh-CN-XiaoxiaoNeural',
                    rate: rateStr,
                    pitch: '+0Hz'
                })
            });

            if (response.ok) return await response.blob();

            const errText = await response.text();
            console.error(`Edge TTS Backend failed (${response.status}):`, errText);
            return null;
        } catch (e) {
            console.error("Edge TTS Critical Error:", e);
            return null;
        }
    }

    /**
     * Routes the request to appropriate provider
     */
    private async fetchTTS(text: string, voiceId: string, speed: number = 1.0): Promise<Blob | null> {
        return this.fetchFromEdge(text, voiceId, speed);
    }

    /**
     * Checks how many of the provided cache keys exist in IndexedDB.
     */
    public async checkCacheStatus(targetKeys: string[]): Promise<number> {
        if (!targetKeys || targetKeys.length === 0) return 0;
        try {
            const allKeys = await keys();
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
     */
    public async prefetch(
        text: string,
        voiceId: string,
        cacheKey: string,
        _ttsPreset?: any
    ): Promise<PrefetchResult> {
        if (!text) return 'FAILED';

        try {
            const cached = await get(cacheKey);
            if (cached) return 'CACHED';

            const audioBlob = await this.fetchTTS(text, voiceId);

            if (!audioBlob) return 'FAILED';

            await set(cacheKey, audioBlob);
            return 'DOWNLOADED';
        } catch (e) {
            console.error("Prefetch error", e);
            return 'FAILED';
        }
    }

    /**
     * Fetches TTS audio from API or Cache, and plays it.
     */
    public async playOrGenerate(
        text: string,
        voiceId: string,
        cacheKey: string,
        _unused_preset?: any,
        onPlayStart?: () => void,
        onPlayEnd?: () => void,
        playbackSpeed: number = 1.0
    ): Promise<void> {
        if (!text) return Promise.resolve();

        try {
            this.stop();
            const myId = this.playbackId;

            let audioBlob = await get(cacheKey);

            if (this.playbackId !== myId) return Promise.resolve();

            if (!audioBlob) {
                audioBlob = await this.fetchTTS(text, voiceId, playbackSpeed);

                if (this.playbackId !== myId) return Promise.resolve();

                if (audioBlob) {
                    await set(cacheKey, audioBlob);
                } else {
                    console.warn("TTS API failed to generate audio.");
                    return Promise.resolve();
                }
            }

            if (this.playbackId !== myId) return Promise.resolve();

            return new Promise((resolve) => {
                if (this.playbackId !== myId) {
                    resolve();
                    return;
                }

                const url = URL.createObjectURL(audioBlob);
                const audio = new Audio(url);
                // We handle speed in the backend now for better quality, 
                // but setting playbackRate here as a fallback or for fine-tuning.
                audio.playbackRate = 1.0;
                this.currentAudio = audio;
                this.currentResolve = resolve;

                audio.onplay = () => {
                    if (onPlayStart) onPlayStart();
                };

                audio.onended = () => {
                    URL.revokeObjectURL(url);
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
                    resolve();
                };

                audio.play().catch(e => {
                    console.warn("Autoplay blocked or error", e);
                    resolve();
                });
            });

        } catch (e) {
            console.error("TTS Service Fatal Error", e);
            return Promise.resolve();
        }
    }

    public stop() {
        this.playbackId++;

        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio.removeAttribute('src');
            this.currentAudio = null;
        }

        if (this.currentResolve) {
            this.currentResolve();
            this.currentResolve = null;
        }
    }
}
