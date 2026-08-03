
import React, { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { gamePhaseAtom, isPlayingAudioAtom, currentSpeakerIdAtom, globalApiConfigAtom, appScreenAtom } from '../store';
import { GamePhase } from '../types';
import { BgmService } from '../bgm';

const isNightPhase = (phase: GamePhase): boolean => {
    return [
        GamePhase.NIGHT_START,
        GamePhase.WEREWOLF_ACTION,
        GamePhase.SEER_ACTION,
        GamePhase.WITCH_ACTION,
        GamePhase.GUARD_ACTION
    ].includes(phase);
};

const isActiveGamePhase = (phase: GamePhase): boolean => {
    return phase !== GamePhase.SETUP && phase !== GamePhase.GAME_OVER && phase !== GamePhase.GAME_REVIEW;
};

const BgmController: React.FC = () => {
    const phase = useAtomValue(gamePhaseAtom);
    const screen = useAtomValue(appScreenAtom);
    const currentSpeakerId = useAtomValue(currentSpeakerIdAtom);
    const isPlayingAudio = useAtomValue(isPlayingAudioAtom);
    const globalConfig = useAtomValue(globalApiConfigAtom);

    // BGM is independent of TTS. Default to enabled if field is missing (undefined).
    const bgmEnabled = globalConfig.bgmEnabled !== false;

    // Must be on the GAME screen AND in an active phase to play BGM
    const shouldPlay = bgmEnabled && screen === 'GAME' && isActiveGamePhase(phase);

    // Only fade when a PLAYER's TTS is actually producing sound.
    const shouldFade = currentSpeakerId !== null && isPlayingAudio;

    // Synchronize BGM configuration (enabled and volume)
    useEffect(() => {
        const bgm = BgmService.getInstance();
        bgm.setEnabled(bgmEnabled);
        bgm.setVolume(globalConfig.bgmVolume ?? 0.2);

        if (!shouldPlay) {
            bgm.fadeOut();
        } else {
            const track = isNightPhase(phase) ? 'night' : 'day';
            bgm.play(track);
            if (shouldFade) {
                bgm.fadeOut();
            }
        }
    }, [bgmEnabled, globalConfig.bgmVolume]);

    // Handle BGM track selection based on game phase / screen changes
    useEffect(() => {
        const bgm = BgmService.getInstance();

        if (!shouldPlay) {
            bgm.fadeOut();
            return;
        }

        const track = isNightPhase(phase) ? 'night' : 'day';
        bgm.play(track);
        if (shouldFade) {
            bgm.fadeOut();
        }
    }, [phase, screen, bgmEnabled]);

    // Fade BGM only when a player's TTS is actively playing audio.
    useEffect(() => {
        const bgm = BgmService.getInstance();
        if (!shouldPlay) return;

        if (shouldFade) {
            bgm.fadeOut();
        } else {
            bgm.fadeIn();
        }
    }, [shouldFade, shouldPlay]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            BgmService.getInstance().stop();
        };
    }, []);

    return null;
};

export default BgmController;
