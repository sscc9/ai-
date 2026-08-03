
import React, { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { gamePhaseAtom, currentSpeakerIdAtom, globalApiConfigAtom } from '../store';
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
    const currentSpeakerId = useAtomValue(currentSpeakerIdAtom);
    const globalConfig = useAtomValue(globalApiConfigAtom);

    // BGM is independent of TTS. Default to enabled if field is missing (undefined).
    const bgmEnabled = globalConfig.bgmEnabled !== false;

    // Synchronize BGM configuration (enabled and volume)
    useEffect(() => {
        const bgm = BgmService.getInstance();
        bgm.setEnabled(bgmEnabled);
        bgm.setVolume(globalConfig.bgmVolume ?? 0.2);

        if (!bgmEnabled || !isActiveGamePhase(phase)) {
            bgm.stop();
        } else {
            const track = isNightPhase(phase) ? 'night' : 'day';
            bgm.play(track);
            // If a player is currently speaking, keep it faded
            if (currentSpeakerId !== null) {
                bgm.fadeOut();
            }
        }
    }, [bgmEnabled, globalConfig.bgmVolume]);

    // Handle BGM track selection based on game phase changes
    useEffect(() => {
        const bgm = BgmService.getInstance();
        if (!bgmEnabled) return;

        if (!isActiveGamePhase(phase)) {
            bgm.stop();
            return;
        }

        const track = isNightPhase(phase) ? 'night' : 'day';
        bgm.play(track);
        if (currentSpeakerId !== null) {
            bgm.fadeOut();
        }
    }, [phase, bgmEnabled]);

    // Fade BGM only when a PLAYER is speaking (currentSpeakerId !== null).
    // Narrator/God speech does NOT fade the BGM.
    useEffect(() => {
        const bgm = BgmService.getInstance();
        if (!bgmEnabled || !isActiveGamePhase(phase)) return;

        if (currentSpeakerId !== null) {
            // A player is speaking → fade out BGM
            bgm.fadeOut();
        } else {
            // No player speaking → fade in BGM
            bgm.fadeIn();
        }
    }, [currentSpeakerId, bgmEnabled, phase]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            BgmService.getInstance().stop();
        };
    }, []);

    return null;
};

export default BgmController;
