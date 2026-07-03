import { atom, type WritableAtom, type PrimitiveAtom } from 'jotai';
import { atomWithStorage, loadable } from 'jotai/utils';
import { get as idbGetVal, set as idbSetVal, del as idbDelVal } from 'idb-keyval';
import {
    GameConfig, GamePhase, Player, GameLog, GameSnapshot, GodState, AgentMessage,
    PRESETS, DEFAULT_ROLE_PROMPTS, DEFAULT_PHASE_PROMPTS, TimelineEvent,
    TTSPreset, ActorProfile, GameArchive, LLMPreset, GlobalApiConfig, Role, PlayerStatus, ROLE_INFO,
    Perspective, LLMProviderConfig, EdgeVoice, TTSState
} from './types';

// Define IndexedDB storage adapter
const idbStorage = {
    getItem: async (key: string, initialValue: any) => {
        const val = await idbGetVal(key);
        return val === undefined ? initialValue : val;
    },
    setItem: async (key: string, newValue: any) => {
        await idbSetVal(key, newValue);
    },
    removeItem: async (key: string) => {
        await idbDelVal(key);
    },
};

// --- State Atoms ---
export const appScreenAtom = atom<'HOME' | 'GAME' | 'SETTINGS' | 'AGENT' | 'HISTORY' | 'TTS'>('HOME');

export const gameConfigAtom = atom<GameConfig>({
    playerCount: 9,
    roles: PRESETS[9].roles,
    phasePrompts: { ...DEFAULT_PHASE_PROMPTS },
    rolePrompts: { ...DEFAULT_ROLE_PROMPTS },
    globalAiInstructions: "你正在参与一场高水平的狼人杀对局。请使用简短、口语化的中文发言。不要复述规则，直接表达观点。逻辑要清晰，符合你的身份视角。"
});

const defaultLlmProviders: LLMProviderConfig[] = [
    { id: 'provider-gemini', name: 'Google Gemini', type: 'gemini', apiKey: '' },
    { id: 'provider-deepseek', name: 'DeepSeek', type: 'openai', baseUrl: 'https://api.deepseek.com', apiKey: '' },
    { id: 'provider-volc', name: 'Volcengine (DeepSeek)', type: 'openai', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', apiKey: '' }
];

const defaultLlmPresets: LLMPreset[] = [
    { id: 'llm-1', name: 'Gemini 3 Flash', providerId: 'provider-gemini', modelId: 'gemini-3-flash-preview' },
    { id: 'llm-2', name: 'Gemini 3 Pro', providerId: 'provider-gemini', modelId: 'gemini-3-pro-preview' },
    { id: 'llm-3', name: 'DeepSeek Chat', providerId: 'provider-deepseek', modelId: 'deepseek-chat' },
    { id: 'llm-4', name: 'DeepSeek R1', providerId: 'provider-deepseek', modelId: 'deepseek-reasoner' },
    { id: 'llm-deepseek-v3.1', name: 'DeepSeek v3.1 (Terminus)', providerId: 'provider-volc', modelId: 'deepseek-v3-1-terminus' },
];

const defaultTtsPresets: TTSPreset[] = [
    { id: 'tts-edge', name: 'Edge TTS (内置服务)', provider: 'edge-tts', modelId: '', baseUrl: '/api/edge-tts-generate', apiKey: 'free' }
];

const DEFAULT_ACTORS: ActorProfile[] = [
    { id: 'n1', name: '上帝 (旁白)', llmPresetId: 'llm-1', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-XiaoxiaoNeural', stylePrompt: '' },
    { id: 'a1', name: 'Gemini 3 Pro', llmPresetId: 'llm-1', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-YunxiNeural', stylePrompt: '' },
    { id: 'a2', name: 'Gemini 3 Pro (Clone 1)', llmPresetId: 'llm-1', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-XiaoyiNeural', stylePrompt: '' },
    { id: 'a3', name: 'Gemini 3 Pro (Clone 2)', llmPresetId: 'llm-1', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-YunjianNeural', stylePrompt: '' },
    { id: 'a4', name: 'DeepSeek Chat', llmPresetId: 'llm-3', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-XiaochenNeural', stylePrompt: '' },
    { id: 'a5', name: 'DeepSeek R1', llmPresetId: 'llm-4', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-YunyangNeural', stylePrompt: '' },
    { id: 'a8', name: '路人甲', llmPresetId: 'llm-1', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-YunxiNeural', stylePrompt: '' },
    { id: 'a9', name: '路人乙', llmPresetId: 'llm-1', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-XiaoxiaoNeural', stylePrompt: '' },
    { id: 'a10', name: '路人丙', llmPresetId: 'llm-1', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-YunjianNeural', stylePrompt: '' },
    { id: 'a11', name: '路人丁', llmPresetId: 'llm-1', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-XiaoyiNeural', stylePrompt: '' },
    { id: 'a12', name: '路人戊', llmPresetId: 'llm-1', ttsPresetId: 'tts-edge', voiceId: 'zh-CN-YunyangNeural', stylePrompt: '' },
];

export const llmProvidersAtom = atomWithStorage<LLMProviderConfig[]>('werewolf-llmProviders', defaultLlmProviders);
export const llmPresetsAtom = atomWithStorage<LLMPreset[]>('werewolf-llmPresets', defaultLlmPresets);
export const ttsPresetsAtom = atomWithStorage<TTSPreset[]>('werewolf-ttsPresets-v3', defaultTtsPresets);
export const actorProfilesAtom = atomWithStorage<ActorProfile[]>('werewolf-actorProfiles-v2', DEFAULT_ACTORS);
export const edgeTtsVoicesAtom = atomWithStorage<EdgeVoice[]>('werewolf-edgeTtsVoices', []);
export const globalApiConfigAtom = atomWithStorage<GlobalApiConfig>('werewolf-globalApiConfig', { enabled: false, narratorActorId: 'n1' });
export const gameArchivesAtom = atomWithStorage<GameArchive[]>('werewolf-gameArchives', [], idbStorage);
export const gameArchivesLoadableAtom = loadable(gameArchivesAtom);

export const timelineAtom = atom<TimelineEvent[]>([]);
export const replaySourceLogsAtom = atom<GameLog[]>([]);
export const isPlayingAudioAtom = atom<boolean>(false);
export const isTheaterModeAtom = atom<boolean>(false);
export const gamePhaseAtom = atom<GamePhase>(GamePhase.SETUP);
export const turnCountAtom = atom(1);
export const isAutoPlayAtom = atom<boolean>(false);
export const isProcessingAtom = atom<boolean>(false);
export const isReplayModeAtom = atom<boolean>(false);
export const isPortraitModeAtom = atom<boolean>(false);
export const areRolesVisibleAtom = atom<boolean>(true);
export const replayPerspectiveAtom = atom<Perspective>('GOOD');

export const isHumanModeAtom = atom<boolean>(false);
export const humanPlayerSeatAtom = atom<number>(1);
export const userInputAtom = atom<any>(null);

export const godStateAtom = atom<GodState>({
    wolfTarget: null,
    seerCheck: null,
    witchSave: false,
    witchPoison: null,
    guardProtect: null,
    deathsTonight: []
});

export const playersAtom = atom<Player[]>([]);
export const logsAtom = atom<GameLog[]>([]);
export const gameHistoryAtom = atom<GameSnapshot[]>([]);
export const speakingQueueAtom = atom<number[]>([]);
export const currentSpeakerIdAtom = atom<number | null>(null);
export const agentMessagesAtom = atom<AgentMessage[]>([
    { id: 'welcome', role: 'model', content: '你好！我是狼人杀上帝助手。我可以协助你控制游戏流程。', timestamp: Date.now() }
]);

// --- TTS Atoms ---
export const ttsStateAtom = atomWithStorage<TTSState>('werewolf-ttsState', {
    text: '',
    voiceId: 'zh-CN-XiaoxiaoNeural',
    speed: 1.0
});

// --- Custom Prompts Atoms ---
export const DEFAULT_ROLE_PROMPTS: Record<string, string> = {
    werewolf: "你拿到的真实身份是狼人。你需要与狼队友相互配合，白天隐藏身份、混淆视听，积极表水或起跳悍跳预言家。在夜间讨论中商定最佳刀人策略，想尽一切办法消灭所有村民或神职。",
    seer: "你拿到的真实身份是预言家。你拥有每晚查验一人底牌的能力。白天你需要起跳报验人（报金水或查杀），用真诚且逻辑清晰的发言争取好人信任，带领好人驱逐狼人。注意保护好自己，防止过早被狼人击杀。",
    witch: "你拿到的真实身份是女巫。你手握一瓶解药（救人）和一瓶毒药（杀人），功能强大。你需要谨慎选择用药时机。通常情况下，第一晚使用解药救人，白天隐藏身份，并在确定狼人身份后再开毒。",
    hunter: "你拿到的真实身份是猎人。当你被投票出局或被狼人击杀时，可以开枪射杀一名你怀疑的玩家（被女巫毒杀时不能开枪）。你的发言可以强势一点，但在没出局前尽量隐藏猎人身份，防止成为狼人夜袭击杀的目标。",
    guard: "你拿到的真实身份是守卫。你每晚可以守护一名玩家使其免受袭击（不能连续两晚守护同一人）。你需要猜测狼人的刀法，优先守护预言家或女巫等关键神职。平时发言要像村民一样低调，隐藏身份以防被刀。",
    villager: "你拿到的真实身份是村民。你没有任何特殊技能，但对局中你拥有神圣的一票。白天的主要任务是认真倾听每位玩家的发言，通过逻辑分析找出狼人的漏洞。不要轻易起跳神职，站对队伍，跟随神职投票。"
};

export const enabledCustomPromptsAtom = atomWithStorage<boolean>('werewolf-enabledCustomPrompts', false);
export const customRolePromptsAtom = atomWithStorage<Record<string, string>>('werewolf-customRolePrompts', {});


