import { atom, type WritableAtom, type PrimitiveAtom } from 'jotai';
import { atomWithStorage, loadable } from 'jotai/utils';
import { get as idbGetVal, set as idbSetVal, del as idbDelVal } from 'idb-keyval';
import {
    GameConfig, GamePhase, Player, GameLog, GameSnapshot, GodState, AgentMessage,
    PRESETS, DEFAULT_ROLE_PROMPTS, DEFAULT_PHASE_PROMPTS, TimelineEvent,
    TTSPreset, ActorProfile, GameArchive, LLMPreset, GlobalApiConfig, Role, PlayerStatus, ROLE_INFO,
    Perspective, LLMProviderConfig, EdgeVoice, PodcastPhase, PodcastConfig
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
export const appScreenAtom = atom<'HOME' | 'GAME' | 'SETTINGS' | 'AGENT' | 'HISTORY' | 'PODCAST_CONFIG' | 'PODCAST_ROOM'>('HOME');

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

// --- Podcast Atoms ---
export const podcastPhaseAtom = atom<PodcastPhase>(PodcastPhase.CONFIG);
export const podcastConfigAtom = atomWithStorage<PodcastConfig>('werewolf-podcastConfig', {
    topic: '人工智能的未来会影响人类的创造力吗？',

    // Host defaults
    hostName: '主持人',
    hostSystemPrompt: '你是一档热门播客节目的主持人。你谈吐得体、幽默，擅长引导话题并调节气氛。',
    hostLlmPresetId: 'llm-1',
    hostTtsPresetId: 'tts-edge',
    hostVoiceId: 'zh-CN-YunxiNeural',

    // Guest defaults
    guest1Name: '嘉宾',
    guest1SystemPrompt: '你是一名科幻作家，对新技术充满热情和好奇，经常引用科幻电影。',
    guest1LlmPresetId: 'llm-1',
    guest1TtsPresetId: 'tts-edge',
    guest1VoiceId: 'zh-CN-XiaoxiaoNeural',

    outline: '1. 开场寒暄：介绍嘉宾背景\n2. 核心话题：AI能否拥有真正的创造力？\n3. 延伸讨论：人机协作的未来模式\n4. 总结与结束：对听众的寄语'
});
export const podcastLogsAtom = atom<GameLog[]>([]);

