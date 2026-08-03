
import React, { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { gamePhaseAtom, isPlayingAudioAtom, globalApiConfigAtom } from '../store';
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

const BgmController: React.FC = () => {
    const phase = useAtomValue(gamePhaseAtom);
    const isPlayingAudio = useAtomValue(isPlayingAudioAtom);
    const globalConfig = useAtomValue(globalApiConfigAtom);

    // Synchronize BGM configuration (enabled and volume)
    useEffect(() => {
        const bgm = BgmService.getInstance();
        const bgmEnabled = globalConfig.enabled && !!globalConfig.bgmEnabled;
        bgm.setEnabled(bgmEnabled);
        bgm.setVolume(globalConfig.bgmVolume ?? 0.2);

        if (!bgmEnabled) {
            bgm.stop();
        } else {
            // If just enabled, kick off playback for the current phase
            const track = isNightPhase(phase) ? 'night' : 'day';
            bgm.play(track);
            if (isPlayingAudio) {
                bgm.fadeOut();
            }
        }
    }, [globalConfig.enabled, globalConfig.bgmEnabled, globalConfig.bgmVolume]);

    // Handle BGM track selection based on game phase changes
    useEffect(() => {
        const bgm = BgmService.getInstance();
        const bgmEnabled = globalConfig.enabled && !!globalConfig.bgmEnabled;
        if (!bgmEnabled) return;

        const track = isNightPhase(phase) ? 'night' : 'day';
        bgm.play(track);
        if (isPlayingAudio) {
            bgm.fadeOut();
        }
    }, [phase, globalConfig.enabled, globalConfig.bgmEnabled, isPlayingAudio]);

    // Handle fading BGM when TTS (announcer or player speech) starts or ends
    useEffect(() => {
        const bgm = BgmService.getInstance();
        const bgmEnabled = globalConfig.enabled && !!globalConfig.bgmEnabled;
        if (!bgmEnabled) return;

        if (isPlayingAudio) {
            bgm.fadeOut();
        } else {
            bgm.fadeIn();
        }
    }, [isPlayingAudio, globalConfig.enabled, globalConfig.bgmEnabled]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            BgmService.getInstance().stop();
        };
    }, []);

    return null;
};

export default BgmController;
