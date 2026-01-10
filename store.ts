import { atom } from 'jotai';
import {
    gamePhaseAtom, playersAtom, logsAtom, turnCountAtom, godStateAtom,
    gameHistoryAtom, gameConfigAtom, actorProfilesAtom,
    globalApiConfigAtom, appScreenAtom, isAutoPlayAtom, isTheaterModeAtom,
    isPlayingAudioAtom, currentSpeakerIdAtom, speakingQueueAtom,
    timelineAtom, replaySourceLogsAtom, isReplayModeAtom, areRolesVisibleAtom,
    gameArchivesAtom, isProcessingAtom, agentMessagesAtom,
    llmPresetsAtom, ttsPresetsAtom,
    isHumanModeAtom, humanPlayerSeatAtom, userInputAtom,
    podcastPhaseAtom, podcastConfigAtom, podcastLogsAtom
} from './atoms';

import {
    GamePhase, Player, GameLog, GameSnapshot,
    PRESETS, Role, PlayerStatus, ROLE_INFO, GameArchive,
    DEFAULT_PHASE_PROMPTS,
    PodcastPhase, PodcastConfig, PodcastArchive
} from './types';

// Re-export everything from atoms
export * from './atoms';
export { DEFAULT_PHASE_PROMPTS };

// --- Derived Atoms ---

export const isDaytimeAtom = atom((get) => {
    const phase = get(gamePhaseAtom);
    return [
        GamePhase.DAY_ANNOUNCE,
        GamePhase.LAST_WORDS,
        GamePhase.DAY_DISCUSSION,
        GamePhase.VOTING,
        GamePhase.HUNTER_ACTION,
        GamePhase.GAME_OVER,
        GamePhase.GAME_REVIEW
    ].includes(phase);
});

// --- Actions ---

export const saveSnapshotAtom = atom(null, (get, set) => {
    const snapshot: GameSnapshot = {
        phase: get(gamePhaseAtom),
        players: JSON.parse(JSON.stringify(get(playersAtom))),
        logs: JSON.parse(JSON.stringify(get(logsAtom))),
        turn: get(turnCountAtom),
        godState: JSON.parse(JSON.stringify(get(godStateAtom)))
    };
    set(gameHistoryAtom, (prev) => [...prev, snapshot]);
});

export const initGameAtom = atom(null, (get, set, playerCount: 9 | 12) => {
    const preset = PRESETS[playerCount];
    const allActors = get(actorProfilesAtom);
    const narratorId = get(globalApiConfigAtom).narratorActorId;

    // Filter out narrator from players pool
    const playerCandidates = allActors.filter(a => a.id !== narratorId);

    // Reset Config
    set(gameConfigAtom, (prev) => ({
        ...prev,
        playerCount: preset.playerCount,
        roles: preset.roles
    }));

    // Shuffle Roles
    const shuffledRoles = [...preset.roles];
    for (let i = shuffledRoles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledRoles[i], shuffledRoles[j]] = [shuffledRoles[j], shuffledRoles[i]];
    }

    // Create Players with Actors
    const rolePrompts = get(gameConfigAtom).rolePrompts;

    // Shuffle Actors
    const shuffledActors = [...playerCandidates].sort(() => Math.random() - 0.5);

    // Randomly assign human seat if in human mode
    const isHumanMode = get(isHumanModeAtom);
    const humanSeat = isHumanMode ? Math.floor(Math.random() * playerCount) + 1 : -1;
    if (isHumanMode) {
        set(humanPlayerSeatAtom, humanSeat);
    }

    const newPlayers = Array.from({ length: playerCount }, (_, i) => {
        const seat = i + 1;
        const role = shuffledRoles[i];
        const potions = role === Role.WITCH ? { cure: true, poison: true } : undefined;
        // Fallback if not enough actors
        const actor = shuffledActors[i % shuffledActors.length];
        const isHuman = isHumanMode && seat === humanSeat;

        return {
            id: seat,
            seatNumber: seat,
            role: role,
            status: PlayerStatus.ALIVE,
            avatarSeed: i + 100,
            rolePrompt: rolePrompts[role] || "",
            isSpeaking: false,
            actorId: actor.id,
            potions,
            isHuman
        };
    });

    set(playersAtom, newPlayers);

    // Reset Game State
    set(gamePhaseAtom, GamePhase.NIGHT_START);
    set(turnCountAtom, 1);
    set(logsAtom, [{
        id: 'sys-init',
        turn: 1,
        phase: GamePhase.NIGHT_START,
        content: `游戏开始。${playerCount} 人局。\n配置：${preset.roles.map(r => ROLE_INFO[r].label).join(' ')}`,
        timestamp: Date.now(),
        isSystem: true
    }]);

    // Reset Timeline & Audio
    set(timelineAtom, []);
    set(replaySourceLogsAtom, []);
    set(gameHistoryAtom, []);
    set(isReplayModeAtom, false);
    set(isTheaterModeAtom, false);
    set(isAutoPlayAtom, false);
    set(areRolesVisibleAtom, true); // Reset visibility to shown
    set(godStateAtom, { wolfTarget: null, seerCheck: null, witchSave: false, witchPoison: null, guardProtect: null, deathsTonight: [] });
    set(speakingQueueAtom, []);
    set(currentSpeakerIdAtom, null);
    set(userInputAtom, null);
    set(appScreenAtom, 'GAME');

    // Save Initial Snapshot
    set(saveSnapshotAtom as any);
});

export const initPodcastAtom = atom(null, (get, set) => {
    const config = get(podcastConfigAtom);
    const actors = get(actorProfilesAtom);
    const narratorId = get(globalApiConfigAtom).narratorActorId;

    // Reset Podcast State
    set(podcastPhaseAtom as any, PodcastPhase.INTRO);
    set(podcastLogsAtom as any, [{
        id: 'pod-init',
        turn: 1,
        phase: GamePhase.SETUP, // Reuse GamePhase for compatibility with logger if needed, or mapped
        content: `播客节目开始。\n主题：${config.topic}`,
        timestamp: Date.now(),
        isSystem: true
    }]);

    // Reset general playback state
    set(timelineAtom as any, []);
    set(isReplayModeAtom as any, false);
    set(isTheaterModeAtom as any, false);
    set(isAutoPlayAtom as any, true); // Auto play by default for podcast
    set(appScreenAtom as any, 'PODCAST_ROOM');
});


export const exitGameAtom = atom(null, (get, set) => {
    set(appScreenAtom, 'HOME');
    set(isAutoPlayAtom, false);
    set(isTheaterModeAtom, false);
    set(isPlayingAudioAtom, false);
});

// Add current game to Archives
export const saveGameArchiveAtom = atom(null, async (get, set, winner: 'GOOD' | 'WOLF') => {
    const existingLogs = get(logsAtom);
    if (existingLogs.length === 0) return;

    // Check if already saved to avoid duplicates
    let archivesRaw = get(gameArchivesAtom);
    if (archivesRaw instanceof Promise) {
        archivesRaw = await archivesRaw;
    }
    const archives = (Array.isArray(archivesRaw) ? archivesRaw : []) as GameArchive[];

    const lastArchive = archives[archives.length - 1];

    // Simple debounce: if we saved in the last 5 seconds, ignore
    if (lastArchive && (Date.now() - lastArchive.timestamp) < 5000) return;

    const archive: GameArchive = {
        id: `game-${Date.now()}`,
        timestamp: Date.now(),
        duration: 0,
        playerCount: get(playersAtom).length,
        winner: winner,
        roles: get(gameConfigAtom).roles,
        logs: JSON.parse(JSON.stringify(get(logsAtom))),
        timeline: JSON.parse(JSON.stringify(get(timelineAtom))),
        players: JSON.parse(JSON.stringify(get(playersAtom))),
        turnCount: get(turnCountAtom)
    };

    set(gameArchivesAtom, [...archives, archive]);
    console.log("Game Archived:", archive.id);
});

export const savePodcastArchiveAtom = atom(null, async (get, set) => {
    const logs = get(podcastLogsAtom);
    if (logs.length === 0) return;

    const config = get(podcastConfigAtom);

    const archive: PodcastArchive & { id: string } = {
        id: `podcast-${Date.now()}`,
        type: 'PODCAST',
        timestamp: Date.now(),
        duration: 0,
        topic: config.topic,
        hostName: config.hostName,
        hostSystemPrompt: config.hostSystemPrompt,
        guest1Name: config.guest1Name,
        guest1SystemPrompt: config.guest1SystemPrompt,
        logs: JSON.parse(JSON.stringify(logs)),
        timeline: JSON.parse(JSON.stringify(get(timelineAtom))),
        players: [], // Not used for podcast archive but for type compatibility in list
        turnCount: 1
    };

    const archives = await get(gameArchivesAtom);
    set(gameArchivesAtom, [...(Array.isArray(archives) ? archives : []), archive as any]);
});


export const loadGameArchiveAtom = atom(null, (get, set, archive: GameArchive | PodcastArchive) => {
    // 1. Reset State based on Type
    if ((archive as any).type === 'PODCAST') {
        const podArchive = archive as PodcastArchive;
        // set(podcastLogsAtom, podArchive.logs); // Don't set full logs immediately for replay
        set(podcastLogsAtom, []);
        set(logsAtom, []); // Use logsAtom for replay display (driven by theater engine)
        set(replaySourceLogsAtom, podArchive.logs);

        set(podcastConfigAtom, {
            topic: podArchive.topic,
            hostName: podArchive.hostName,
            hostSystemPrompt: podArchive.hostSystemPrompt,
            guest1Name: podArchive.guest1Name,
            guest1SystemPrompt: podArchive.guest1SystemPrompt,
            outline: '',
        });
        set(appScreenAtom as any, 'PODCAST_ROOM');
    } else {
        const gameArchive = archive as GameArchive;
        // 1. Reset Players to ALIVE state to allow for a true "Replay"
        const initialPlayers: Player[] = gameArchive.players.map(p => ({
            ...p,
            status: PlayerStatus.ALIVE,
            isSpeaking: false
        }));

        set(playersAtom, initialPlayers);

        // 2. Setup Replay Logic
        set(logsAtom, []);
        set(replaySourceLogsAtom, gameArchive.logs); // The full script

        // 3. Reset Game State for Replay
        set(turnCountAtom, 1);
        // Attempt to set start phase from first log, or default
        const startPhase = gameArchive.logs[0]?.phase || GamePhase.NIGHT_START;
        set(gamePhaseAtom, startPhase);

        set(appScreenAtom as any, 'GAME');
    }

    set(timelineAtom, archive.timeline); // The audio keys

    // 4. Reset Control State
    set(isAutoPlayAtom, false);
    set(isProcessingAtom, false);
    set(isTheaterModeAtom, true);
    set(isReplayModeAtom, true); // Mark as Replay Mode to hide game controls
    set(isPlayingAudioAtom, false);
    set(currentSpeakerIdAtom, null);
    set(areRolesVisibleAtom, true); // Reveal roles for replay
});

export const restoreSnapshotAtom = atom(null, (get, set, snapshot: GameSnapshot) => {
    set(gamePhaseAtom, snapshot.phase);
    set(playersAtom, JSON.parse(JSON.stringify(snapshot.players)));
    set(logsAtom, JSON.parse(JSON.stringify(snapshot.logs)));
    set(turnCountAtom, snapshot.turn);
    set(godStateAtom, JSON.parse(JSON.stringify(snapshot.godState)));
    set(isReplayModeAtom, true);
});