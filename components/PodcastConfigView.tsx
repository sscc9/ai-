
import React, { useState } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import { podcastConfigAtom, appScreenAtom, llmPresetsAtom, llmProvidersAtom, ttsPresetsAtom, edgeTtsVoicesAtom } from '../atoms';
import { initPodcastAtom } from '../store';
import { clsx } from 'clsx';
import { AudioService } from '../audio';

const PodcastConfigView = () => {
    const [config, setConfig] = useAtom(podcastConfigAtom);
    const llmPresets = useAtomValue(llmPresetsAtom);
    const llmProviders = useAtomValue(llmProvidersAtom);
    const ttsPresets = useAtomValue(ttsPresetsAtom);
    const voices = useAtomValue(edgeTtsVoicesAtom);
    const setScreen = useSetAtom(appScreenAtom);
    const initPodcast = useSetAtom(initPodcastAtom);

    return (
        <div className="h-full w-full bg-slate-950 text-white flex flex-col items-center justify-center p-6 overflow-y-auto font-sans">
            <div className="max-w-4xl w-full space-y-8 py-10">
                <div className="space-y-2 text-center">
                    <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">播客节目设置</h1>
                    <p className="text-slate-400 font-medium">设定你的讨论主题与嘉宾人设</p>
                </div>

                <div className="space-y-6 bg-slate-900/50 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-400 ml-1">讨论主题</label>
                        <textarea
                            value={config.topic}
                            onChange={(e) => setConfig({ ...config, topic: e.target.value })}
                            className="w-full bg-slate-800 border border-white/10 rounded-2xl p-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none h-20"
                            placeholder="输入你想让AI讨论的话题..."
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Host Config */}
                        <RoleConfigPanel
                            title="主持人"
                            roleType="host"
                            config={config}
                            setConfig={setConfig}
                            llmPresets={llmPresets}
                            llmProviders={llmProviders}
                            ttsPresets={ttsPresets}
                            voices={voices}
                            color="indigo"
                        />

                        {/* Guest Config */}
                        <RoleConfigPanel
                            title="嘉宾"
                            roleType="guest1"
                            config={config}
                            setConfig={setConfig}
                            llmPresets={llmPresets}
                            llmProviders={llmProviders}
                            ttsPresets={ttsPresets}
                            voices={voices}
                            color="purple"
                        />
                    </div>

                    <div className="pt-4 flex gap-4">
                        <button
                            onClick={() => setScreen('HOME')}
                            className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-2xl transition-all active:scale-95 border border-white/5"
                        >
                            返回
                        </button>
                        <button
                            onClick={initPodcast}
                            className="flex-[2] bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-4 rounded-2xl transition-all active:scale-95 shadow-xl shadow-indigo-500/20"
                        >
                            开始录制
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Generic Role Configuration Panel
const RoleConfigPanel = ({
    title,
    roleType,
    config,
    setConfig,
    llmPresets,
    llmProviders,
    ttsPresets,
    voices,
    color,
}: {
    title: string,
    roleType: 'host' | 'guest1',
    config: any,
    setConfig: any,
    llmPresets: any[],
    llmProviders: any[],
    ttsPresets: any[],
    voices: any[],
    color: 'indigo' | 'purple'
}) => {
    const nameKey = `${roleType}Name`;
    const promptKey = `${roleType}SystemPrompt`;
    const llmKey = `${roleType}LlmPresetId`;
    const ttsKey = `${roleType}TtsPresetId`;
    const voiceKey = `${roleType}VoiceId`;

    const [isPlaying, setIsPlaying] = useState(false);

    const handleTestVoice = async () => {
        if (isPlaying) return;
        setIsPlaying(true);
        try {
            const tts = ttsPresets.find(t => t.id === (config[ttsKey] || 'tts-edge')) || ttsPresets[0];
            const voiceId = config[voiceKey] || (voices.find(v => v.ShortName.startsWith('zh-CN'))?.ShortName || 'zh-CN-XiaoxiaoNeural');
            const text = `你好，我是${config[nameKey]}。这是一段声音测试。`;
            await AudioService.getInstance().playOrGenerate(text, voiceId, `test-${Date.now()}`, tts);
        } catch (e) {
            console.error(e);
        } finally {
            setIsPlaying(false);
        }
    };

    return (
        <div className={`space-y-5 p-6 rounded-3xl bg-${color}-500/5 border border-${color}-500/10`}>
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-${color}-500 flex items-center justify-center shadow-lg shadow-${color}-500/20`}>
                    <span className="text-xl">🎙️</span>
                </div>
                <h3 className="text-xl font-bold">{title}</h3>
            </div>

            <div className="space-y-4">
                {/* 1. Name & Desc */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">基本信息</label>
                    <div className="space-y-2">
                        <input
                            type="text"
                            value={config[nameKey]}
                            onChange={(e) => setConfig({ ...config, [nameKey]: e.target.value })}
                            className="w-full bg-slate-800 border border-white/10 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/50"
                            placeholder={`${title}名称...`}
                        />
                        <textarea
                            value={config[promptKey]}
                            onChange={(e) => setConfig({ ...config, [promptKey]: e.target.value })}
                            className="w-full bg-slate-800 border border-white/10 rounded-xl p-3 text-sm outline-none resize-none h-24 focus:ring-2 focus:ring-indigo-500/50"
                            placeholder={`${title}人设与指令...`}
                        />
                    </div>
                </div>

                {/* 2. Brain (LLM) */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">思考模型 (Brain)</label>
                    <div className="relative">
                        <select
                            value={config[llmKey] || ''}
                            onChange={(e) => setConfig({ ...config, [llmKey]: e.target.value })}
                            className="w-full bg-slate-800 border border-white/10 rounded-xl p-3 text-sm outline-none appearance-none"
                        >
                            <option value="">请选择模型...</option>
                            {llmProviders.map(provider => (
                                <optgroup key={provider.id} label={provider.name}>
                                    {llmPresets.filter(p => p.providerId === provider.id).map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7 7" /></svg>
                        </div>
                    </div>
                </div>

                {/* 3. Voice (TTS) */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">声音设置 (Voice)</label>

                    {/* Voice Selector */}
                    {voices.length > 0 ? (
                        <div className="relative">
                            <select
                                value={config[voiceKey] || ''}
                                onChange={(e) => setConfig({ ...config, [voiceKey]: e.target.value })}
                                className="w-full bg-slate-800 border border-white/10 rounded-xl p-3 text-sm outline-none appearance-none"
                            >
                                <option value="">使用默认</option>
                                {Array.from(new Set(voices.map(v => v.Locale))).sort().map(locale => (
                                    <optgroup key={locale} label={locale}>
                                        {voices.filter(v => v.Locale === locale).map(v => (
                                            <option key={v.ShortName} value={v.ShortName}>
                                                {v.FriendlyName.replace('Microsoft ', '').replace('Online (Natural) - ', '')} ({v.Gender})
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7 7" /></svg>
                            </div>
                        </div>
                    ) : (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
                            未同步音色库，请先前往设置页同步 Edge TTS。
                        </div>
                    )}

                    {/* Test Button */}
                    <button
                        onClick={handleTestVoice}
                        disabled={isPlaying}
                        className={`w-full py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${isPlaying ? 'bg-slate-700 text-slate-400' : `bg-${color}-500/20 text-${color}-300 hover:bg-${color}-500/30`}`}
                    >
                        {isPlaying ? '播放中...' : '🔊 试听声音'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PodcastConfigView;
