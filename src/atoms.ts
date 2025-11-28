import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { get, set, del } from 'idb-keyval';
import type { PrimitiveAtom } from 'jotai';
import { 
    GameConfig, GamePhase, Player, GameLog, GameSnapshot, GodState, AgentMessage, 
    PRESETS, DEFAULT_ROLE_PROMPTS, DEFAULT_PHASE_PROMPTS, TimelineEvent, 
    TTSPreset, ActorProfile, GameArchive, LLMPreset, GlobalApiConfig, Role, PlayerStatus, ROLE_INFO,
    Perspective
} from './types';

// --- State Atoms ---

export const appScreenAtom = atom<'HOME' | 'GAME' | 'SETTINGS' | 'AGENT' | 'HISTORY'>('HOME');

export const gameConfigAtom = atom<GameConfig>({
    playerCount: 12,
    roles: PRESETS[12].roles,
    phasePrompts: { ...DEFAULT_PHASE_PROMPTS },
    rolePrompts: { ...DEFAULT_ROLE_PROMPTS },
    globalAiInstructions: "你正在参与一场高水平的狼人杀对局。请使用简短、口语化的中文发言。不要复述规则，直接表达观点。逻辑要清晰，符合你的身份视角。"
});

// Define IndexedDB storage adapter
const idbStorage = {
  getItem: async (key: string, initialValue: any) => {
    const val = await get(key);
    // if there is no value, return initialValue
    return val === undefined ? initialValue : val;
  },
  setItem: async (key: string, newValue: any) => {
    await set(key, newValue);
  },
  removeItem: async (key: string) => {
    await del(key);
  },
};


// --- Hierarchical Settings Atoms (with Persistence) ---

const defaultLlmPresets: LLMPreset[] = [
    { 
        id: 'llm-1', 
        name: 'Gemini 3 Pro', 
        provider: 'gemini', 
        modelId: 'gemini-3-pro-preview',
        apiKey: '' 
    },
    { 
        id: 'llm-2', 
        name: 'Gemini 2.5 Pro', 
        provider: 'gemini', 
        modelId: 'gemini-2.5-pro',
        apiKey: ''
    },
    { 
        id: 'llm-3', 
        name: 'DeepSeek Chat', 
        provider: 'openai', 
        modelId: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com',
        apiKey: ''
    },
    { 
        id: 'llm-4', 
        name: 'DeepSeek R1', 
        provider: 'openai', 
        modelId: 'deepseek-reasoner',
        baseUrl: 'https://api.deepseek.com',
        apiKey: ''
    },
    { 
        id: 'llm-deepseek-v3.1', 
        name: 'DeepSeek v3.1 (Terminus)', 
        provider: 'openai', 
        modelId: 'deepseek-v3-1-terminus', // This ID triggers the logic in llm.ts
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', 
        apiKey: '' 
    },
];

const defaultTtsPresets: TTSPreset[] = [
    { 
        id: 'tts-1', 
        name: '302.ai (Doubao)', 
        provider: 'doubao', 
        modelId: '', 
        baseUrl: 'https://api.302.ai/302/tts/generate', 
        apiKey: ''
    },
    {
        id: 'tts-2',
        name: '302.ai (OpenAI)',
        provider: 'openai',
        modelId: 'tts-1',
        baseUrl: 'https://api.302.ai/302/tts/generate',
        apiKey: ''
    }
];

const DEFAULT_ACTORS: ActorProfile[] = [
    // Narrator: Gentle Female (Doubao Voice)
    { id: 'n1', name: '上帝 (旁白)', llmPresetId: 'llm-1', ttsPresetId: 'tts-1', voiceId: 'zh_female_shentong_moon_bigtts', stylePrompt: '' },
    
    // Gemini Clones (Using various high-quality Doubao voices)
    { id: 'a1', name: 'Gemini 3 Pro', llmPresetId: 'llm-1', ttsPresetId: 'tts-1', voiceId: 'zh_male_yuanbo_moon_bigtts', stylePrompt: '' },
    { id: 'a2', name: 'Gemini 3 Pro (Clone 1)', llmPresetId: 'llm-1', ttsPresetId: 'tts-1', voiceId: 'zh_female_shuangkuai_hongliang_common_bigtts', stylePrompt: '' },
    { id: 'a3', name: 'Gemini 3 Pro (Clone 2)', llmPresetId: 'llm-1', ttsPresetId: 'tts-1', voiceId: 'zh_male_quanshen_moon_bigtts', stylePrompt: '' },
    
    // DeepSeek Clones
    { id: 'a4', name: 'DeepSeek Chat', llmPresetId: 'llm-3', ttsPresetId: 'tts-1', voiceId: 'zh_female_zhixing_moon_bigtts', stylePrompt: '' },
    { id: 'a5', name: 'DeepSeek R1', llmPresetId: 'llm-4', ttsPresetId: 'tts-1', voiceId: 'zh_male_yibo_moon_bigtts', stylePrompt: '' },
    
    // Fillers
    { id: 'a8', name: '路人甲', llmPresetId: 'llm-1', ttsPresetId: 'tts-1', voiceId: 'zh_male_chunhou_moon_bigtts', stylePrompt: '' },
    { id: 'a9', name: '路人乙', llmPresetId: 'llm-1', ttsPresetId: 'tts-1', voiceId: 'zh_female_qingshang_moon_bigtts', stylePrompt: '' },
    { id: 'a10', name: '路人丙', llmPresetId: 'llm-1', ttsPresetId: 'tts-1', voiceId: 'zh_male_adong_moon_bigtts', stylePrompt: '' },
    { id: 'a11', name: '路人丁', llmPresetId: 'llm-1', ttsPresetId: 'tts-1', voiceId: 'zh_female_ruqi_moon_bigtts', stylePrompt: '' },
    { id: 'a12', name: '路人戊', llmPresetId: 'llm-1', ttsPresetId: 'tts-1', voiceId: 'zh_male_qinqie_moon_bigtts', stylePrompt: '' },
];

export const llmPresetsAtom = atomWithStorage<LLMPreset[]>('werewolf-llmPresets', defaultLlmPresets);
export const ttsPresetsAtom = atomWithStorage<TTSPreset[]>('werewolf-ttsPresets-v2', defaultTtsPresets);
export const actorProfilesAtom = atomWithStorage<ActorProfile[]>('werewolf-actorProfiles', DEFAULT_ACTORS);
export const globalApiConfigAtom = atomWithStorage<GlobalApiConfig>('werewolf-globalApiConfig', {
    enabled: false,
    narratorActorId: 'n1'
});
export const gameArchivesAtom = atomWithStorage<GameArchive[]>('werewolf-gameArchives', [], idbStorage);

export const timelineAtom = atom<TimelineEvent[]>([]);
export const replaySourceLogsAtom = atom<GameLog[]>([]);

export const isPlayingAudioAtom = atom<boolean>(false);
export const isTheaterModeAtom = atom<boolean>(false);

export const gamePhaseAtom = atom<GamePhase>(GamePhase.SETUP);
export const turnCountAtom = atom(1);

export const isAutoPlayAtom = atom<boolean>(false);
export const isProcessingAtom = atom<boolean>(false);
export const isReplayModeAtom = atom<boolean>(false);
export const areRolesVisibleAtom = atom<boolean>(true);

// New atom for replay perspective
export const replayPerspectiveAtom = atom<Perspective>('GOOD');

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
export const summariesAtom = atom<string[]>([]); 
export const gameHistoryAtom = atom<GameSnapshot[]>([]);

export const speakingQueueAtom = atom<number[]>([]);
export const currentSpeakerIdAtom = atom<number | null>(null);

export const agentMessagesAtom = atom<AgentMessage[]>([
    { id: 'welcome', role: 'model', content: '你好！我是狼人杀上帝助手。我可以协助你控制游戏流程。', timestamp: Date.now() }
]);