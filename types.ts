// Role Definitions
export enum Role {
    WEREWOLF = 'WEREWOLF',
    VILLAGER = 'VILLAGER',
    SEER = 'SEER',
    WITCH = 'WITCH',
    HUNTER = 'HUNTER',
    GUARD = 'GUARD',
}

export type Perspective = 'GOD' | 'GOOD' | 'WOLF';

// Helper arrays for win conditions
export const GOD_ROLES = [Role.SEER, Role.WITCH, Role.HUNTER, Role.GUARD];
export const VILLAGER_ROLES = [Role.VILLAGER];
export const WOLF_ROLES = [Role.WEREWOLF];

// Role Metadata for UI
export const ROLE_INFO: Record<Role, { label: string; icon: string; color: string }> = {
    [Role.WEREWOLF]: { label: '狼人', icon: '🐺', color: 'text-red-500' },
    [Role.VILLAGER]: { label: '村民', icon: '🧑', color: 'text-gray-400' },
    [Role.SEER]: { label: '预言家', icon: '🔮', color: 'text-purple-400' },
    [Role.WITCH]: { label: '女巫', icon: '🧪', color: 'text-fuchsia-500' },
    [Role.HUNTER]: { label: '猎人', icon: '🔫', color: 'text-orange-500' },
    [Role.GUARD]: { label: '守卫', icon: '🛡️', color: 'text-blue-400' },
};

export enum GamePhase {
    SETUP = 'SETUP',
    NIGHT_START = 'NIGHT_START',

    // Night Actions
    WEREWOLF_ACTION = 'WEREWOLF_ACTION',
    SEER_ACTION = 'SEER_ACTION',
    WITCH_ACTION = 'WITCH_ACTION',
    GUARD_ACTION = 'GUARD_ACTION', // Reserved

    // Day Flow
    DAY_ANNOUNCE = 'DAY_ANNOUNCE',   // God announces deaths
    HUNTER_ACTION = 'HUNTER_ACTION', // If hunter died
    LAST_WORDS = 'LAST_WORDS',       // If applicable

    DAY_DISCUSSION = 'DAY_DISCUSSION',
    VOTING = 'VOTING',

    // Sheriff Phases
    SHERIFF_ELECT = 'SHERIFF_ELECT', // Running for Sheriff & Speeches
    SHERIFF_VOTE = 'SHERIFF_VOTE',   // Voting for Sheriff
    SHERIFF_TRANS = 'SHERIFF_TRANS', // Sheriff transferring/tearing badge

    GAME_OVER = 'GAME_OVER',
    GAME_REVIEW = 'GAME_REVIEW' // Post-game chat
}

// TTS Screen State
export interface TTSState {
    text: string;
    voiceId: string;
    speed: number;
}

export const PHASE_LABELS: Record<GamePhase, string> = {
    [GamePhase.SETUP]: '游戏设置',
    [GamePhase.NIGHT_START]: '入夜',
    [GamePhase.WEREWOLF_ACTION]: '狼人行动',
    [GamePhase.SEER_ACTION]: '预言家行动',
    [GamePhase.WITCH_ACTION]: '女巫行动',
    [GamePhase.GUARD_ACTION]: '守卫行动',
    [GamePhase.DAY_ANNOUNCE]: '死亡宣告',
    [GamePhase.HUNTER_ACTION]: '猎人开枪',
    [GamePhase.LAST_WORDS]: '遗言环节',
    [GamePhase.DAY_DISCUSSION]: '公聊发言',
    [GamePhase.VOTING]: '投票放逐',
    [GamePhase.SHERIFF_ELECT]: '警长竞选',
    [GamePhase.SHERIFF_VOTE]: '警长投票',
    [GamePhase.SHERIFF_TRANS]: '警徽交割',
    [GamePhase.GAME_OVER]: '游戏结束',
    [GamePhase.GAME_REVIEW]: '赛后复盘',
};

export enum PlayerStatus {
    ALIVE = 'ALIVE',
    DEAD_NIGHT = 'DEAD_NIGHT', // Killed at night
    DEAD_VOTE = 'DEAD_VOTE',   // Voted out
    DEAD_SHOOT = 'DEAD_SHOOT', // Hunter shot
    DEAD_POISON = 'DEAD_POISON' // Witch poisoned
}

// A player instance in a game
export interface Player {
    id: number;
    seatNumber: number;
    role: Role;
    status: PlayerStatus;
    avatarSeed: number;
    rolePrompt: string;
    isSpeaking: boolean;
    actorId: string; // Link to ActorProfile
    // Abilities status
    potions?: {
        cure: boolean;
        poison: boolean;
    };
    isHuman?: boolean;
}

// --- New Settings Structure ---

// export type LLMProvider = 'gemini' | 'openai'; // Moved to LLMProviderConfig

// 1. LLM Definition
export interface LLMProviderConfig {
    id: string;
    name: string;
    type: 'gemini' | 'openai'; // 'openai' covers DeepSeek, Moonshot, etc.
    baseUrl?: string;
    apiKey?: string;
    useProxy?: boolean; // Route requests through /api/proxy to bypass CORS
}

export interface LLMPreset {
    id: string;
    name: string; // Nickname
    providerId: string; // Link to LLMProviderConfig
    modelId: string; // API Model String (e.g., gemini-2.5-flash)
    temperature?: number;
    thinking?: {
        enabled: boolean;
        reasoningEffort?: 'low' | 'medium' | 'high';
    };
}

// 2. TTS Definition (Edge TTS Format)
export interface EdgeVoice {
    Name: string;
    ShortName: string;
    Gender: string;
    Locale: string;
    SuggestedCodec: string;
    FriendlyName: string;
    Status: string;
}

export interface TTSPreset {
    id: string;
    name: string; // Nickname
    provider: string; // 302 sub-provider: 'doubao', 'openai', 'azure', etc.
    modelId?: string; // API Model String (optional for some providers)
    apiKey?: string;
    appId?: string; // Required for Volcengine specific param
    baseUrl?: string; // Defaults to https://api.302.ai/302/tts/generate
}

// 3. Actor/Clone (e.g., "Big Gemini 1")
export interface ActorProfile {
    id: string;
    name: string;
    llmPresetId: string; // Which brain?
    ttsPresetId: string; // Which mouth engine?
    voiceId: string; // Specific voice setting for the TTS engine
    stylePrompt: string; // Optional personality override
}

// Global API Configuration (Reduced scope)
export interface GlobalApiConfig {
    enabled: boolean; // Audio enabled
    narratorActorId: string; // The actor used for the narrator
    ttsSpeed?: number; // Global TTS Playback Rate (0.5x - 2.0x)
    bgmEnabled?: boolean; // Background music enabled
    bgmVolume?: number; // Background music volume (0.0 - 1.0)
}

// "God's Notebook" - Tracks logic for the current night/turn
export interface GodState {
    wolfTarget: number | null;
    seerCheck: number | null;
    witchSave: boolean;
    witchPoison: number | null;
    guardProtect: number | null;
    deathsTonight: number[]; // IDs of players who died
    lastGuardProtect?: number | null; // Guard cannot protect consecutively
    pkPlayers?: number[]; // Tie-breakers
    isPkRound?: boolean; // Whether the current round is a PK vote
    sheriffId: number | null; // Current Sheriff ID
    sheriffCandidates?: number[]; // Players running for Sheriff
    sheriffQuitters?: number[]; // Players who quit campaign
    pendingDeathId?: number | null; // Queued death ID while Sheriff transfers badge
    wolfNightSummaries?: Record<number, string>; // LLM-generated summaries of wolf night discussions, keyed by turn
    nextPhaseAfterLastWords?: GamePhase;
    savedDiscussionQueue?: number[];
    night1LastWordsDone?: boolean;
}

// The structure of a log entry
export interface GameLog {
    id: string;
    turn: number;
    phase: GamePhase;
    speakerId?: number; // Null if system message
    speakerName?: string; // Optional override for podcast/custom modes
    content: string; // markdown supported
    thought?: string; // The internal monologue (CoT)
    summary?: string; // Short summary for previous turns
    timestamp: number;
    isSystem: boolean;
    visibleTo?: number[]; // If set, only these player IDs (and user) can see this log. E.g. Seer result.
    deaths?: number[];
}

// Audio Timeline Event for Replay
export interface TimelineEvent {
    id: string;
    type: 'NARRATOR' | 'PLAYER';
    speakerName: string;
    text: string;
    voiceId: string;
    // Store snapshot of TTS config used
    ttsProvider: string;
    ttsModel?: string;
    ttsBaseUrl?: string;
    ttsApiKey?: string;

    audioKey: string; // IndexedDB Key
    timestamp: number;
}

// Game Rules Configuration
export interface GameConfig {
    playerCount: number;
    roles: Role[];
    phasePrompts: Record<string, string>;
    rolePrompts: Record<string, string>;
    globalAiInstructions: string;
    hasSheriff?: boolean;
}

// Agent Chat Types
export interface AgentMessage {
    id: string;
    role: 'user' | 'model';
    content: string;
    timestamp: number;
}

// Snapshot for replay (State restoration)
export interface GameSnapshot {
    phase: GamePhase;
    players: Player[];
    logs: GameLog[];
    turn: number;
    godState: GodState;
}

// --- Archive Structure for History ---
export interface GameArchive {
    id: string;
    timestamp: number;
    duration: number; // in seconds (approximation)
    playerCount: number;
    winner: 'GOOD' | 'WOLF' | 'UNKNOWN';
    roles: Role[];

    // State needed for replay
    logs: GameLog[];
    timeline: TimelineEvent[];
    players: Player[]; // Final state of players (names, avatars)
    turnCount: number;

    type?: 'GAME' | 'PODCAST';
    topic?: string;
}

export const PRESETS: Record<number, { playerCount: number; roles: Role[] }> = {
    9: {
        playerCount: 9,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF,
            Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.WITCH, Role.HUNTER
        ]
    },
    12: {
        playerCount: 12,
        roles: [
            Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF,
            Role.VILLAGER, Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
            Role.SEER, Role.WITCH, Role.HUNTER, Role.GUARD
        ]
    }
};

export const DEFAULT_PHASE_PROMPTS: Record<string, string> = {
    [GamePhase.NIGHT_START]: "Night falls. Everyone close your eyes.",
    [GamePhase.WEREWOLF_ACTION]: "Werewolves wake up and choose a target.",
    [GamePhase.SEER_ACTION]: "Seer wakes up.",
    [GamePhase.WITCH_ACTION]: "Witch wakes up.",
    [GamePhase.GUARD_ACTION]: "Guard wakes up.",
    [GamePhase.DAY_ANNOUNCE]: "Morning comes.",
    [GamePhase.DAY_DISCUSSION]: "Discuss who is the werewolf.",
    [GamePhase.VOTING]: "Vote for who to eliminate.",
    [GamePhase.LAST_WORDS]: "Leave your final words.",
    [GamePhase.GAME_REVIEW]: "Game over. Review the game.",
    [GamePhase.GAME_OVER]: "Game Over."
};

export const DEFAULT_ROLE_PROMPTS: Record<string, string> = {
    [Role.WEREWOLF]: `你的真实身份是**狼人**。
- **唯一胜利条件**：消灭所有村民 或 消灭所有神职。
- **胜利高于一切**：只要最终能达成胜利目标，你或队友在必要时均可牺牲。白天伪装成好人隐藏身份，根据场上胜算自主做出最有利于达成胜利的发言与投票决策。`,

    [Role.SEER]: `你的真实身份是**预言家**。你是好人核心，首日积极起跳报验人（金水/查杀）与警徽流。
- 面对对跳悍跳狼，用真实的夜间时间线和逻辑闭环说服大家，争取警徽带领好人。`,

    [Role.WITCH]: `你的真实身份是**女巫**。手握解药与毒药，白天低调隐藏身份。
- 首夜通常救人，毒药必须在高度确信狼人时使用。不到关键轮次不轻易亮明身份。`,

    [Role.HUNTER]: `你的真实身份是**猎人**。出局时开枪带走确信的狼人。
- 未出局前低调隐藏，防止被狼人针对；枪权是威慑，带错人等同帮狼，宁可压枪不乱带人。`,

    [Role.GUARD]: `你的真实身份是**守卫**。每晚守护一名好人免受袭击，不能连守同人。
- 严密隐藏身份像平民发言，博弈狼人刀口重点守护核心神职或关键好人。`,

    [Role.VILLAGER]: `你的真实身份是**村民**。闭眼玩家以客观事实与因果逻辑为唯一判据。
- 仔细核对死伤与查验，坚决不以发言长短或态度打好人，排清全场狼坑。`
};