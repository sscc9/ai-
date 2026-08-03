
export class BgmService {
    private static instance: BgmService;
    private currentAudio: HTMLAudioElement | null = null;
    private currentTrack: 'day' | 'night' | null = null;
    private targetVolume = 0.2;
    private isFadedOut = false;
    private fadeInterval: any = null;
    private isBgmEnabled = true;

    private constructor() {}

    public static getInstance(): BgmService {
        if (!BgmService.instance) {
            BgmService.instance = new BgmService();
        }
        return BgmService.instance;
    }

    public setEnabled(enabled: boolean) {
        this.isBgmEnabled = enabled;
        if (!enabled) {
            this.stop();
        }
    }

    public setVolume(vol: number) {
        this.targetVolume = vol;
        if (this.currentAudio && !this.isFadedOut) {
            this.currentAudio.volume = vol;
        }
    }

    public play(track: 'day' | 'night') {
        if (!this.isBgmEnabled) return;

        const url = track === 'day' ? '/bgm/day_bgm.mp3' : '/bgm/night_bgm.mp3';
        
        if (this.currentTrack === track && this.currentAudio) {
            // If already playing this track, make sure it's not faded out
            if (this.isFadedOut) {
                this.fadeIn();
            }
            return;
        }

        this.stop();
        this.currentTrack = track;
        
        const audio = new Audio(url);
        audio.loop = true;
        // Start at 0 volume and fade in
        audio.volume = 0;
        this.currentAudio = audio;
        this.isFadedOut = false;

        audio.play().then(() => {
            this.fadeIn();
        }).catch(e => {
            console.warn("BGM autoplay blocked or error:", e);
        });
    }

    public stop() {
        if (this.fadeInterval) {
            clearInterval(this.fadeInterval);
            this.fadeInterval = null;
        }
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }
        this.currentTrack = null;
    }

    public fadeOut() {
        if (!this.currentAudio || this.isFadedOut) return;
        this.isFadedOut = true;

        if (this.fadeInterval) clearInterval(this.fadeInterval);

        const startVolume = this.currentAudio.volume;
        const steps = 30; // Over ~1500ms
        const stepValue = startVolume / steps;
        let currentStep = 0;

        this.fadeInterval = setInterval(() => {
            if (!this.currentAudio) {
                clearInterval(this.fadeInterval);
                return;
            }
            currentStep++;
            const newVol = Math.max(0, startVolume - (stepValue * currentStep));
            this.currentAudio.volume = newVol;

            if (newVol <= 0 || currentStep >= steps) {
                clearInterval(this.fadeInterval);
                this.currentAudio.pause();
            }
        }, 50);
    }

    public fadeIn() {
        if (!this.currentAudio || !this.isBgmEnabled) return;
        this.isFadedOut = false;

        if (this.fadeInterval) clearInterval(this.fadeInterval);

        if (this.currentAudio.paused) {
            this.currentAudio.play().catch(e => console.warn(e));
        }

        const startVolume = this.currentAudio.volume;
        const steps = 30; // Over ~1500ms
        const stepValue = (this.targetVolume - startVolume) / steps;
        let currentStep = 0;

        this.fadeInterval = setInterval(() => {
            if (!this.currentAudio) {
                clearInterval(this.fadeInterval);
                return;
            }
            currentStep++;
            const newVol = Math.min(this.targetVolume, startVolume + (stepValue * currentStep));
            this.currentAudio.volume = newVol;

            if (newVol >= this.targetVolume || currentStep >= steps) {
                clearInterval(this.fadeInterval);
                this.currentAudio.volume = this.targetVolume;
            }
        }, 50);
    }
}
