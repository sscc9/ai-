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

    GAME_OVER = 'GAME_OVER',
    GAME_REVIEW = 'GAME_REVIEW' // Post-game chat
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
}

export interface LLMPreset {
    id: string;
    name: string; // Nickname
    providerId: string; // Link to LLMProviderConfig
    modelId: string; // API Model String (e.g., gemini-2.5-flash)
}

// 2. TTS Definition (302.ai Format)
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
}

// "God's Notebook" - Tracks logic for the current night/turn
export interface GodState {
    wolfTarget: number | null;
    seerCheck: number | null;
    witchSave: boolean;
    witchPoison: number | null;
    guardProtect: number | null;
    deathsTonight: number[]; // IDs of players who died
}

// The structure of a log entry
export interface GameLog {
    id: string;
    turn: number;
    phase: GamePhase;
    speakerId?: number; // Null if system message
    content: string; // markdown supported
    thought?: string; // The internal monologue (CoT)
    timestamp: number;
    isSystem: boolean;
    visibleTo?: number[]; // If set, only these player IDs (and user) can see this log. E.g. Seer result.
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
    summaries: string[];
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
    [Role.WEREWOLF]: "你是狼人。你的目标是杀死所有好人。白天你需要伪装成好人，混淆视听。晚上与队友配合刀人。",
    [Role.VILLAGER]: "你是普通村民。你没有任何特殊能力。你的目标是找出所有狼人并投票放逐他们。通过逻辑分析和观察别人的发言。",
    [Role.SEER]: "你是预言家。你是好人的核心。每晚你可以查验一个人的身份。白天你需要适时跳身份带领好人，但也要注意保护自己。",
    [Role.WITCH]: "你是女巫。你有一瓶解药和一瓶毒药。解药可以救活晚上被杀的人，毒药可以毒死一个人。合理使用你的药水。",
    [Role.HUNTER]: "你是猎人。如果你被狼人杀害或被投票放逐，你可以开枪带走一人。但在被女巫毒死时不能开枪。",
    [Role.GUARD]: "你是守卫。每晚你可以守护一个人不被狼人杀害。你不能连续两晚守护同一个人。",
};