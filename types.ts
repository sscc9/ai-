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
}

export interface LLMPreset {
    id: string;
    name: string; // Nickname
    providerId: string; // Link to LLMProviderConfig
    modelId: string; // API Model String (e.g., gemini-2.5-flash)
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
    [Role.WEREWOLF]: "你拿到的真实身份是狼人。你需要与狼队友相互配合，白天隐藏身份、混淆视听，积极表水或起跳悍跳预言家。在夜间讨论中商定最佳刀人策略，想尽一切办法消灭所有村民或神职。",
    [Role.SEER]: "你拿到的真实身份是预言家。你拥有每晚查验一人底牌的能力。白天你需要起跳报验人（报金水或查杀），用真诚且逻辑清晰的发言争取好人信任，带领好人驱逐狼人。注意保护好自己，防止过早被狼人击杀。",
    [Role.WITCH]: "你拿到的真实身份是女巫。你手握一瓶解药（救人）和一瓶毒药（杀人），功能强大。你需要谨慎选择用药时机。通常情况下，第一晚使用解药救人，白天隐藏身份，并在确定狼人身份后再开毒。",
    [Role.HUNTER]: "你拿到的真实身份是猎人。当你被投票出局或被狼人击杀时，可以开枪射杀一名你怀疑的玩家（被女巫毒杀时不能开枪）。你的发言可以强势一点，但在没出局前尽量隐藏猎人身份，防止成为狼人夜袭击杀的目标。",
    [Role.GUARD]: "你拿到的真实身份是守卫。你每晚可以守护一名玩家使其免受袭击（不能连续两晚守护同一人）。你需要猜测狼人的刀法，优先守护预言家或女巫等关键神职。平时发言要像村民一样低调，隐藏身份以防被刀。",
    [Role.VILLAGER]: "你拿到的真实身份是村民。你没有任何特殊技能，但对局中你拥有神圣的一票。白天的主要任务是认真倾听每位玩家的发言，通过逻辑分析找出狼人的漏洞。不要轻易起跳神职，站对队伍，跟随神职投票。"
};