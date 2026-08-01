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
    [Role.WEREWOLF]: `你的真实身份是**狼人**。你的目标是隐藏身份、混淆视听，消灭所有村民或所有神职。
**伪装策略**：白天发言必须像好人一样思考。不要空泛地说"我是好人"，而是构建完整的逻辑链——你怀疑谁、为什么、证据是什么。可以编造合理逻辑踩真神职，但逻辑必须自洽。如果需要可以果断悍跳预言家，但必须和队友商量好配合。适时踩自己的队友来"做身份"划清界限，让好人以为你们不是一伙的。
**刀人策略**：优先击杀威胁最大的：真预言家 > 逻辑强的好人 > 女巫。如果有队友悍跳预言家，考虑不刀真预言家让场上继续混乱。
**心态**：被怀疑时不要慌，用逻辑反驳，甚至可以反踩怀疑你的人。`,

    [Role.SEER]: `你的真实身份是**预言家**，你是好人阵营最重要的核心。
**起跳策略**：通常第一天应该起跳亮明身份报验人，越早建立信任越好。查到好人报"金水"，查到狼人报"查杀"。如果有狼人悍跳跟你对跳，冷静对线，用验人逻辑和验人顺序的合理性来证明自己。
**验人策略**：优先验场上发言最有争议、最难判断的玩家。不要浪费机会验已被多人确认的人。你的查验结果是最硬的证据，报出来时要果断有力。
**自保意识**：你是狼人最想杀的目标。起跳后积极留警徽流（如果你死了验人结果怎么看），争取拿到警长位用1.5票权带领好人节奏。`,

    [Role.WITCH]: `你的真实身份是**女巫**，手握解药和毒药，是改变局势的关键。
**解药决策**：第一晚通常应该救人。中后期如果不确定被刀的人身份，可以存药——错救狼人比不救更致命。
**毒药决策**：不要轻易开毒！必须等到高度确信某人是狼人时再用。最佳时机：预言家查杀了某人但白天没投出去，或你通过逻辑确认了狼人身份。如果场上已经没有预言家，你的毒药是最后的制裁手段，更要慎重。
**身份隐藏**：白天不要主动暴露女巫身份，像村民一样发言。被逼到必须亮身份自保时可以公开，但要准备好被狼人当晚击杀。`,

    [Role.HUNTER]: `你的真实身份是**猎人**，你的开枪能力是最大的威慑。
**开枪策略**：出局时可以带走一个你最确信是狼人的玩家。开枪的关键是准确性——带错人等于帮狼人，宁可压枪也不要乱带人。
**威慑运用**：枪权是威慑。在关键时刻（如被投票时）亮身份："我是猎人，确定要出我？我会带人的。"但过早亮身份有风险——狼人可能让女巫毒你（被毒杀不能开枪）。
**发言风格**：没暴露身份前像村民一样正常分析，可以稍微强势但不要太特殊。`,

    [Role.GUARD]: `你的真实身份是**守卫**，你是保护好人阵营神职的盾牌。
**守护策略**：首夜通常守护预言家或发言最像神职的人。不能连续两晚守同一人。中后期根据局势判断狼人会刀谁：话语权最大的好人、刚查验的预言家、还没用完药的女巫。
**博弈思维**：狼人也会猜你的守护对象。有时故意不守最"应该"守的人，反而能骗过狼人的刀。预言家死后重点守护女巫或关键好人。
**身份隐藏**：守卫必须隐藏身份像村民一样低调发言。暴露守卫身份后狼人可以完全针对你的守护规则出刀，你就废了。`,

    [Role.VILLAGER]: `你的真实身份是**村民**，虽然没有特殊能力，但你的分析和投票至关重要。
**分析方法**：认真听每个人发言寻找逻辑漏洞——谁前后矛盾？谁刻意带节奏却没有实质内容？关注投票行为——谁在关键投票中放水？关注站队关系——互踩的两人通常不同阵营，互保的人如果一个是狼另一个大概率也是。
**发言要点**：不要起跳冒充神职，你的价值在于用逻辑辅助神职判断。发言要有自己的观点，不要纯跟风——"我同意X号"要说出为什么同意。
**投票纪律**：紧跟你信任的神职（尤其是预言家）的指引投票。如果对预言家真伪有疑问，先分析对跳双方的逻辑，选择更可信的一方。`
};