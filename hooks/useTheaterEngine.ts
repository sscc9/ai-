
import { useEffect, useRef } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import {
    timelineAtom,
    isTheaterModeAtom,
    currentSpeakerIdAtom,
    logsAtom,
    replaySourceLogsAtom,
    gamePhaseAtom,
    playersAtom,
    globalApiConfigAtom,
    actorProfilesAtom,
    ttsPresetsAtom,
    replayPerspectiveAtom
} from '../atoms';
import { useGameTurn } from './useGameTurn';
import { PlayerStatus, TTSPreset, Role, Perspective, GameLog, Player, GamePhase, TimelineEvent, GlobalApiConfig, ActorProfile } from '../types';
import { AudioService } from '../audio';

const detectDeath = (content: string): number[] => {
    const deadIds: number[] = [];
    const singlePatterns = [
        /(\d+)号\s*被投票出局/,
        /猎人开枪.*(\d+)号\s*倒牌/,
        /毒死了\s*(\d+)号/
    ];

    singlePatterns.forEach(p => {
        const match = content.match(p);
        if (match && match[1]) deadIds.push(parseInt(match[1]));
    });

    if (content.includes("死亡") || content.includes("倒牌")) {
        // Improved Regex: Capture patterns like "3号", "3、6号", "3,6号", "3和6号"
        // 1. Find the "号" and look backwards for numbers
        // Regex explanation:
        // Match a group that ends with "号"
        // Inside the group, match digits, optionally followed by separators (comma, pause, space, 'and'), then more digits
        const groupMatches = content.match(/(\d+(?:[、，,和\s]+\d+)*)号/g);

        if (groupMatches) {
            groupMatches.forEach(target => {
                // 'target' is like "3、6号"
                const numbers = target.match(/\d+/g);
                if (numbers) {
                    numbers.forEach(n => deadIds.push(parseInt(n)));
                }
            });
        }
    }

    return [...new Set(deadIds)];
};

// --- Core Visibility Logic ---
const shouldExperienceLog = (log: GameLog, perspective: Perspective, players: Player[]) => {
    // 1. GOD sees all
    if (perspective === 'GOD') return true;

    // 2. Private info (Chat visibleTo)
    if (log.visibleTo) {
        if (perspective === 'GOOD') return false;
        if (perspective === 'WOLF') {
            const wolfIds = players.filter(p => p.role === Role.WEREWOLF).map(p => p.id);
            return log.visibleTo.some(id => wolfIds.includes(id));
        }
        return false;
    }

    // 3. System / Public Info Filtering based on Phase
    // Hide specific phases from specific perspectives to simulate "Closing Eyes"
    if (log.isSystem) {
        const p = log.phase;

        // GOOD Perspective: Hide all Night actions except Start/End
        if (perspective === 'GOOD') {
            if (p === GamePhase.WEREWOLF_ACTION ||
                p === GamePhase.SEER_ACTION ||
                p === GamePhase.WITCH_ACTION ||
                p === GamePhase.GUARD_ACTION) {
                return false;
            }
        }

        // WOLF Perspective: Hide God actions (Seer/Witch/Guard)
        if (perspective === 'WOLF') {
            if (p === GamePhase.SEER_ACTION ||
                p === GamePhase.WITCH_ACTION ||
                p === GamePhase.GUARD_ACTION) {
                return false;
            }
        }
    }

    return true;
};

// --- Helper: Resolve Audio Config ---
const resolveAudioConfig = (
    event: TimelineEvent,
    speakerId: number | undefined,
    players: Player[],
    globalConfig: GlobalApiConfig,
    actors: ActorProfile[],
    ttsPresets: TTSPreset[]
): { voiceId: string, ttsPreset: TTSPreset } => {
    if (event.type === 'NARRATOR') {
        const narratorActorId = globalConfig.narratorActorId;
        const narratorActor = actors.find(a => a.id === narratorActorId) || actors[0];
        const narratorTts = ttsPresets.find(p => p.id === narratorActor.ttsPresetId) || ttsPresets[0];
        return {
            voiceId: narratorActor.voiceId,
            ttsPreset: narratorTts
        };
    } else {
        // Try to resolve dynamic player config
        if (speakerId !== undefined) {
            const player = players.find(p => p.id === speakerId);
            if (player && player.actorId) {
                const actor = actors.find(a => a.id === player.actorId);
                if (actor) {
                    const preset = ttsPresets.find(p => p.id === actor.ttsPresetId);
                    if (preset) {
                        return {
                            voiceId: actor.voiceId,
                            ttsPreset: preset
                        };
                    }
                }
            }
        }

        // Fallback to history
        return {
            voiceId: event.voiceId,
            ttsPreset: {
                id: 'replay-history',
                name: 'History Preset',
                provider: event.ttsProvider,
                modelId: event.ttsModel,
                baseUrl: event.ttsBaseUrl,
                apiKey: event.ttsApiKey
            }
        };
    }
};

export const useTheaterEngine = () => {
    const timeline = useAtomValue(timelineAtom);
    const replayLogs = useAtomValue(replaySourceLogsAtom);

    const [isTheater, setIsTheater] = useAtom(isTheaterModeAtom);
    const setSpeaker = useSetAtom(currentSpeakerIdAtom);
    const setLogs = useSetAtom(logsAtom);
    const setPhase = useSetAtom(gamePhaseAtom);

    const globalConfig = useAtomValue(globalApiConfigAtom);
    const actors = useAtomValue(actorProfilesAtom);
    const ttsPresets = useAtomValue(ttsPresetsAtom);

    const perspective = useAtomValue(replayPerspectiveAtom);
    const perspectiveRef = useRef(perspective);
    useEffect(() => { perspectiveRef.current = perspective; }, [perspective]);

    const { setTurn } = useGameTurn();

    const [playersAtomVal, setPlayersAtom] = useAtom(playersAtom);
    const playersRef = useRef(playersAtomVal);
    useEffect(() => { playersRef.current = playersAtomVal; }, [playersAtomVal]);

    useEffect(() => {
        if (!isTheater || replayLogs.length === 0) return;

        let isCancelled = false;

        // Cursor to track position in timeline.
        let timelineCursor = 0;

        const playSequence = async () => {
            // Using index loop for lookahead capabilities
            for (let i = 0; i < replayLogs.length; i++) {
                if (isCancelled) return;

                const log = replayLogs[i];

                // 1. Update World State (Always happens, to keep state in sync)
                setPhase(log.phase);
                setTurn(log.turn);

                // 2. Add Log (Visual text log)
                setLogs(prev => {
                    if (prev.find(l => l.id === log.id)) return prev;
                    return [...prev, log];
                });

                // 3. Check for Deaths
                if (log.isSystem) {
                    const victims = detectDeath(log.content);
                    if (victims.length > 0) {
                        setPlayersAtom(prev => prev.map(p =>
                            victims.includes(p.seatNumber) ? { ...p, status: PlayerStatus.DEAD_NIGHT } : p
                        ));
                    }
                }

                // --- 4. Experience (Audio & Visuals) ---
                const currentPerspective = perspectiveRef.current;
                const isVisible = shouldExperienceLog(log, currentPerspective, playersRef.current);

                if (isVisible) {
                    // Only animate speaker if visible
                    if (log.speakerId) {
                        setSpeaker(log.speakerId);
                    }

                    // Play Audio
                    // IMPORTANT: Search from timelineCursor to handle duplicate IDs correctly
                    const eventIndex = timeline.findIndex((t, idx) => idx >= timelineCursor && t.id === log.id);

                    if (eventIndex !== -1) {
                        const event = timeline[eventIndex];
                        timelineCursor = eventIndex + 1; // Advance cursor past this event

                        // Resolve config for CURRENT event
                        const { voiceId, ttsPreset } = resolveAudioConfig(
                            event,
                            log.speakerId,
                            playersRef.current,
                            globalConfig,
                            actors,
                            ttsPresets
                        );

                        // Determine Audio Key: Check if config changed from history
                        let audioKey = event.audioKey;
                        const isConfigChanged = (
                            voiceId !== event.voiceId ||
                            ttsPreset.provider !== event.ttsProvider ||
                            (ttsPreset.modelId || '') !== (event.ttsModel || '')
                        );

                        if (isConfigChanged) {
                            // Generate new dynamic key to avoid cache collision
                            audioKey = `${event.audioKey}_v${voiceId}_m${ttsPreset.modelId || 'def'}`;
                        }

                        // --- Just-In-Time Prefetch Logic ---
                        let nextEvent: TimelineEvent | null = null;
                        let nextSpeakerId: number | undefined = undefined;
                        let lookaheadCursor = timelineCursor; // Start searching from where we left off

                        for (let j = i + 1; j < replayLogs.length; j++) {
                            const futureLog = replayLogs[j];
                            const isFutureVisible = shouldExperienceLog(futureLog, currentPerspective, playersRef.current);
                            if (isFutureVisible) {
                                const futureIndex = timeline.findIndex((t, idx) => idx >= lookaheadCursor && t.id === futureLog.id);
                                if (futureIndex !== -1) {
                                    nextEvent = timeline[futureIndex];
                                    nextSpeakerId = futureLog.speakerId;
                                    break;
                                }
                            }
                        }

                        // Callback when current audio starts: Prefetch next
                        const onPlayStart = () => {
                            if (!isCancelled && nextEvent) {
                                const nextConfig = resolveAudioConfig(
                                    nextEvent,
                                    nextSpeakerId,
                                    playersRef.current,
                                    globalConfig,
                                    actors,
                                    ttsPresets
                                );

                                let nextAudioKey = nextEvent.audioKey;
                                const isNextChanged = (
                                    nextConfig.voiceId !== nextEvent.voiceId ||
                                    nextConfig.ttsPreset.provider !== nextEvent.ttsProvider ||
                                    (nextConfig.ttsPreset.modelId || '') !== (nextEvent.ttsModel || '')
                                );
                                if (isNextChanged) {
                                    nextAudioKey = `${nextEvent.audioKey}_v${nextConfig.voiceId}_m${nextConfig.ttsPreset.modelId || 'def'}`;
                                }

                                AudioService.getInstance().prefetch(
                                    nextEvent.text,
                                    nextConfig.voiceId,
                                    nextAudioKey,
                                    nextConfig.ttsPreset
                                ).catch(e => console.warn("Prefetch warning", e));
                            }
                        };

                        await AudioService.getInstance().playOrGenerate(
                            event.text,
                            voiceId,
                            audioKey,
                            ttsPreset,
                            onPlayStart,
                            undefined, // onPlayEnd
                            globalConfig.ttsSpeed || 1.0 // Pass Global Speed
                        );
                    } else {
                        // Text-only delay (e.g. System logs without audio)
                        await new Promise(r => setTimeout(r, 1500));
                    }

                    if (isCancelled) return;

                    // Reset Speaker
                    setSpeaker(null);

                    // Gap between visible turns
                    await new Promise(r => setTimeout(r, 500));

                } else {
                    // Hidden Log: Fast Forward
                    await new Promise(r => setTimeout(r, 10));
                }

                if (isCancelled) return;
            }

            // Loop finished. 
            // IMPORTANT: We do NOT set isTheater(false) here. 
            // Keeping it true keeps the Replay Perspective UI active and prevents "jumping" to live game state.
            // The user will exit manually.
        };

        playSequence();

        return () => {
            isCancelled = true;
            setSpeaker(null);
            AudioService.getInstance().stop();
        };
    }, [isTheater, replayLogs, timeline, setLogs, setIsTheater, setSpeaker, setPhase, setTurn, setPlayersAtom, globalConfig, actors, ttsPresets]);
};
