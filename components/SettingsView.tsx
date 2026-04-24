
import React, { useState, useRef } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import { clsx } from 'clsx';
import { appScreenAtom, globalApiConfigAtom, llmPresetsAtom, ttsPresetsAtom, actorProfilesAtom, gameArchivesAtom, gameArchivesLoadableAtom, llmProvidersAtom, edgeTtsVoicesAtom } from '../store';
import { LLMPreset, TTSPreset, ActorProfile, LLMProviderConfig } from '../types';
import { AudioService } from '../audio';

type SettingsPage =
    | { type: 'ROOT' }
    | { type: 'LLM_LIST' }
    | { type: 'TTS_LIST' }
    | { type: 'ACTOR_LIST' }
    | { type: 'PROVIDER_LIST' }
    | { type: 'PROVIDER_EDIT', id?: string }
    | { type: 'LLM_EDIT', id?: string }
    | { type: 'TTS_EDIT', id?: string }
    | { type: 'ACTOR_EDIT', id?: string };

// --- Components (Unified Style) ---

const Background = () => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-indigo-200/30 rounded-full blur-[120px] animate-pulse-slow mix-blend-multiply"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-blue-200/30 rounded-full blur-[120px] mix-blend-multiply"></div>
    </div>
);

const ListItem = ({ label, sub, onClick, icon }: { label: string, sub?: string, onClick: () => void, icon?: string }) => (
    <div onClick={onClick} className="group flex items-center justify-between p-5 bg-white/60 hover:bg-white border border-slate-200/60 hover:border-indigo-200 shadow-sm hover:shadow-md rounded-xl cursor-pointer transition-all duration-200 mb-2">
        <div className="flex items-center gap-4">
            {icon && <span className="text-2xl group-hover:scale-110 transition-transform duration-300">{icon}</span>}
            <div>
                <div className="text-slate-800 font-bold text-base">{label}</div>
                {sub && <div className="text-slate-500 text-xs mt-0.5 font-medium">{sub}</div>}
            </div>
        </div>
        <svg className="w-5 h-5 text-slate-400 group-hover:text-indigo-400 transform group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
    </div>
);

const SectionHeader = ({ text }: { text: string }) => (
    <div className="px-2 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider mt-6 mb-1">{text}</div>
);

const Card = ({ children }: { children?: React.ReactNode }) => (
    <div className="bg-white/60 backdrop-blur-sm border border-slate-200 rounded-2xl p-6 shadow-sm">{children}</div>
);

const InputGroup = ({ label, value, onChange, placeholder, type = "text", sub }: any) => (
    <div className="mb-5">
        <label className="block text-xs font-bold text-indigo-500 uppercase tracking-wide mb-1.5 ml-1">{label}</label>
        <input
            type={type}
            value={value}
            onChange={onChange}
            className="w-full bg-white border border-slate-200 rounded-xl p-3.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm placeholder:text-slate-300"
            placeholder={placeholder}
        />
        {sub && <p className="text-[10px] text-slate-400 mt-1.5 ml-1">{sub}</p>}
    </div>
);

const SettingsView = () => {
    const setScreen = useSetAtom(appScreenAtom);
    const [stack, setStack] = useState<SettingsPage[]>([{ type: 'ROOT' }]);
    const currentPage = stack[stack.length - 1];
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Atoms
    const [config, setConfig] = useAtom(globalApiConfigAtom);
    const [llmPresets, setLlmPresets] = useAtom(llmPresetsAtom);
    const [llmProviders, setLlmProviders] = useAtom(llmProvidersAtom);
    const [ttsPresets, setTtsPresets] = useAtom(ttsPresetsAtom);
    const [actors, setActors] = useAtom(actorProfilesAtom);
    const [voices, setVoices] = useAtom(edgeTtsVoicesAtom);
    const [isSyncing, setIsSyncing] = useState(false);

    // Use Loadable for Archives to prevent suspense flash
    const archivesLoadable = useAtomValue(gameArchivesLoadableAtom);
    const setArchives = useSetAtom(gameArchivesAtom);

    const syncVoices = async () => {
        setIsSyncing(true);
        try {
            const resp = await fetch('/api/edge-tts-voices');
            if (resp.ok) {
                const data = await resp.json();
                setVoices(data);
                alert(`同步成功！已发现 ${data.length} 个音色。`);
            } else {
                alert('同步失败，请确保后端服务已启动。');
            }
        } catch (e) {
            console.error(e);
            alert('网络错误，请检查后端运行状态。');
        } finally {
            setIsSyncing(false);
        }
    };

    const archives = archivesLoadable.state === 'hasData' ? archivesLoadable.data : [];
    const isArchivesLoading = archivesLoadable.state === 'loading';

    const pushPage = (page: SettingsPage) => setStack(prev => [...prev, page]);
    const popPage = () => setStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev);

    // --- Import/Export Logic ---
    const handleExport = () => {
        const settingsToExport = {
            llmPresets,
            ttsPresets,
            actorProfiles: actors,
            globalApiConfig: config,
            gameArchives: archives,
        };
        const blob = new Blob([JSON.stringify(settingsToExport, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-werewolf-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                const importedData = JSON.parse(text);
                if (
                    'llmPresets' in importedData &&
                    'ttsPresets' in importedData &&
                    'actorProfiles' in importedData &&
                    'globalApiConfig' in importedData
                ) {
                    setLlmPresets(importedData.llmPresets);
                    setTtsPresets(importedData.ttsPresets);
                    setActors(importedData.actorProfiles);
                    setConfig(importedData.globalApiConfig);
                    if (Array.isArray(importedData.gameArchives)) {
                        setArchives(importedData.gameArchives);
                    }
                    alert('数据恢复成功！');
                } else {
                    alert('导入失败：文件格式不正确。');
                }
            } catch (error) {
                alert(`导入失败：无法解析文件。 ${error}`);
            }
        };
        reader.readAsText(file);
        if (event.target) event.target.value = '';
    };


    // --- Helper CRUD Functions ---
    const updateProvider = (id: string, updates: Partial<LLMProviderConfig>) => setLlmProviders(p => p.map(i => i.id === id ? { ...i, ...updates } : i));
    const createProvider = () => {
        const id = `provider-${Date.now()}`;
        // Use functional update to ensure we have the latest state, but we don't need 'p' for the new item
        setLlmProviders(p => [...p, { id, name: 'New Provider', type: 'openai', baseUrl: '', apiKey: '' }]);
        // Small timeout to ensure state propagation before navigation (though usually not needed with Jotai, it's safer for "Blue Screen" fix)
        setTimeout(() => pushPage({ type: 'PROVIDER_EDIT', id }), 0);
    };
    const deleteProvider = (id: string) => {
        // 1. Find all models belonging to this provider
        const modelsToDelete = llmPresets.filter(m => m.providerId === id).map(m => m.id);

        // 2. Reset any actors using these models
        setActors(prevActors => prevActors.map(actor => {
            if (modelsToDelete.includes(actor.llmPresetId)) {
                // Reset to the first available model that ISN'T being deleted, or a safe fallback
                const safeModel = llmPresets.find(m => !modelsToDelete.includes(m.id) && m.providerId !== id);
                return { ...actor, llmPresetId: safeModel?.id || '' };
            }
            return actor;
        }));

        // 3. Delete the models
        setLlmPresets(p => p.filter(m => m.providerId !== id));

        // 4. Delete the provider
        setLlmProviders(p => p.filter(i => i.id !== id));

        popPage();
    };

    const updateLlm = (id: string, updates: Partial<LLMPreset>) => setLlmPresets(p => p.map(i => i.id === id ? { ...i, ...updates } : i));
    const createLlm = () => {
        const id = `llm-${Date.now()}`;
        const name = '新 AI 模型';
        setLlmPresets(p => [...p, { id, name, providerId: llmProviders[0]?.id || 'provider-gemini', modelId: 'gemini-2.5-flash' }]);
        const actorId = `a-${Date.now()}`;
        setActors(p => [...p, { id: actorId, name: name, llmPresetId: id, ttsPresetId: ttsPresets[0]?.id || 'tts-1', voiceId: 'zh_male_yuanbo_moon_bigtts', stylePrompt: '' }]);
        pushPage({ type: 'LLM_EDIT', id });
    };
    const deleteLlm = (id: string) => {
        // 1. Reset any actors using this model
        setActors(prevActors => prevActors.map(actor => {
            if (actor.llmPresetId === id) {
                // Reset to the first available model that ISN'T the one being deleted
                const safeModel = llmPresets.find(m => m.id !== id);
                return { ...actor, llmPresetId: safeModel?.id || '' };
            }
            return actor;
        }));

        // 2. Delete the model
        setLlmPresets(p => p.filter(i => i.id !== id));
        popPage();
    };

    const updateTts = (id: string, updates: Partial<TTSPreset>) => setTtsPresets(p => p.map(i => i.id === id ? { ...i, ...updates } : i));
    const createTts = () => {
        const id = `tts-${Date.now()}`;
        setTtsPresets(p => [...p, {
            id,
            name: 'Edge TTS (免费)',
            provider: 'edge-tts',
            modelId: '',
            baseUrl: '/api/edge-tts',
            apiKey: 'free'
        }]);
        pushPage({ type: 'TTS_EDIT', id });
    };
    const deleteTts = (id: string) => { setTtsPresets(p => p.filter(i => i.id !== id)); popPage(); };

    const updateActor = (id: string, updates: Partial<ActorProfile>) => setActors(p => p.map(i => i.id === id ? { ...i, ...updates } : i));
    const cloneActor = (sourceId: string) => {
        const source = actors.find(a => a.id === sourceId);
        if (!source) return;
        const id = `a-${Date.now()}`;
        setActors(p => [...p, { ...source, id, name: `${source.name} (分身)` }]);
    };
    const createActor = () => {
        const id = `a-${Date.now()}`;
        setActors(p => [...p, {
            id,
            name: '新玩家',
            llmPresetId: llmPresets[0]?.id || 'llm-1',
            ttsPresetId: ttsPresets[0]?.id || 'tts-1',
            voiceId: 'zh_male_yuanbo_moon_bigtts',
            stylePrompt: ''
        }]);
        pushPage({ type: 'ACTOR_EDIT', id });
    };
    const deleteActor = (id: string) => { setActors(p => p.filter(i => i.id !== id)); popPage(); };

    // Header component remains here to access 'stack' and 'popPage'
    const Header = ({ title, backLabel }: { title: string, backLabel?: string }) => (
        <div className="flex items-center h-16 bg-white/70 backdrop-blur-md border-b border-slate-200 px-6 sticky top-0 z-20 shadow-sm">
            {stack.length > 1 ? (
                <button onClick={popPage} className="flex items-center text-indigo-600 font-bold hover:text-indigo-700 transition-colors">
                    <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                    {backLabel || '返回'}
                </button>
            ) : (
                <button onClick={() => setScreen('HOME')} className="text-indigo-600 font-bold hover:text-indigo-700 transition-colors flex items-center">
                    <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7 7-7" /></svg>
                    主页
                </button>
            )}
            <div className="absolute left-1/2 transform -translate-x-1/2 text-lg font-black text-slate-800 tracking-tight">{title}</div>
        </div>
    );

    // --- Page Renders ---

    if (currentPage.type === 'ROOT') {
        return (
            <div className="h-full w-full bg-[#f8fafc] flex flex-col relative overflow-hidden font-sans">
                <Background />
                <Header title="设置" />
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-10 relative z-10 max-w-3xl mx-auto w-full">
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />

                    <SectionHeader text="全局开关" />
                    <Card>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <span className="text-base font-bold text-slate-800 block">启用语音 (TTS)</span>
                                <span className="text-xs text-slate-500 block mt-0.5">需要配置 TTS 引擎的 API Key</span>
                            </div>
                            <div
                                onClick={() => setConfig(p => ({ ...p, enabled: !p.enabled }))}
                                className={clsx(
                                    "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none mr-2",
                                    config.enabled ? 'bg-indigo-500' : 'bg-slate-300'
                                )}
                            >
                                <span
                                    className={clsx(
                                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                        config.enabled ? 'translate-x-5' : 'translate-x-0'
                                    )}
                                />
                            </div>
                        </div>

                        {/* TTS Speed Control */}
                        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                            <div>
                                <span className="text-sm font-bold text-slate-800 block">朗读倍速</span>
                                <span className="text-xs text-slate-500 block mt-0.5">调整所有语音播放的速度 (0.5x - 2.0x)</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded min-w-[3rem] text-center">
                                    {(config.ttsSpeed || 1.0).toFixed(1)}x
                                </span>
                                <input
                                    type="range"
                                    min="0.5"
                                    max="2.0"
                                    step="0.1"
                                    value={config.ttsSpeed || 1.0}
                                    onChange={(e) => setConfig(p => ({ ...p, ttsSpeed: parseFloat(e.target.value) }))}
                                    className="w-24 accent-indigo-500 cursor-pointer"
                                />
                            </div>
                        </div>
                    </Card>

                    <SectionHeader text="模型与语音" />
                    <div className="space-y-0">
                        <ListItem label="AI 模型库" sub="管理 AI 供应商与模型" icon="🧠" onClick={() => pushPage({ type: 'LLM_LIST' })} />
                        <ListItem label="TTS 语音设置" sub="管理 Edge TTS 基础配置" icon="🗣️" onClick={() => pushPage({ type: 'TTS_EDIT', id: 'tts-edge' })} />
                    </div>

                    <SectionHeader text="玩家与分身" />
                    <div className="space-y-0">
                        <ListItem label="玩家列表" sub="管理所有模型分身、声音与性格" icon="👥" onClick={() => pushPage({ type: 'ACTOR_LIST' })} />
                        <div onClick={() => pushPage({ type: 'ACTOR_EDIT', id: config.narratorActorId })} className="group flex items-center justify-between p-5 bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-100 hover:border-indigo-200 shadow-sm hover:shadow-md rounded-xl cursor-pointer transition-all duration-200 mt-2">
                            <div className="flex items-center gap-4">
                                <span className="text-2xl">☁️</span>
                                <div>
                                    <div className="text-indigo-900 font-bold text-base">上帝 (旁白) 设置</div>
                                    <div className="text-indigo-400 text-xs mt-0.5 font-medium">设置上帝的声音与风格</div>
                                </div>
                            </div>
                            <svg className="w-5 h-5 text-indigo-300 group-hover:text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </div>
                    </div>

                    <SectionHeader text="数据管理" />
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={handleExport}
                            disabled={isArchivesLoading}
                            className={clsx(
                                "flex flex-col items-center justify-center p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:bg-slate-50 transition-all",
                                isArchivesLoading ? "opacity-50 cursor-wait" : ""
                            )}
                        >
                            <span className="text-2xl mb-2">{isArchivesLoading ? "⏳" : "📤"}</span>
                            <span className="font-bold text-slate-700 text-sm">{isArchivesLoading ? "数据加载中..." : "导出备份"}</span>
                        </button>
                        <button onClick={handleImportClick} className="flex flex-col items-center justify-center p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:bg-slate-50 transition-all">
                            <span className="text-2xl mb-2">📥</span>
                            <span className="font-bold text-slate-700 text-sm">导入备份</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (currentPage.type === 'LLM_LIST') {
        return (
            <div className="h-full w-full bg-[#f8fafc] flex flex-col relative overflow-hidden font-sans">
                <Background />
                <Header title="AI 模型库" backLabel="设置" />
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 relative z-10 max-w-3xl mx-auto w-full">
                    <div className="grid grid-cols-2 gap-3 mb-6">
                    <button onClick={createProvider} className="py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all active:scale-95">+ 新供应商</button>
                    <button 
                        onClick={() => {
                            const providerId = `provider-deepseek-${Date.now()}`;
                            setLlmProviders(p => [...p, { id: providerId, name: 'DeepSeek', type: 'openai', baseUrl: 'https://api.deepseek.com', apiKey: '' }]);
                            const modelId = `llm-v4-${Date.now()}`;
                            setLlmPresets(p => [...p, { id: modelId, name: 'DeepSeek V4 Pro', providerId: providerId, modelId: 'deepseek-v4-pro' }]);
                            const actorId = `a-${Date.now()}`;
                            setActors(p => [...p, { id: actorId, name: 'DeepSeek V4 Pro', llmPresetId: modelId, ttsPresetId: ttsPresets[0]?.id || 'tts-1', voiceId: 'zh_male_yuanbo_moon_bigtts', stylePrompt: '' }]);
                            pushPage({ type: 'PROVIDER_EDIT', id: providerId });
                        }} 
                        className="py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-lg shadow-emerald-200 transition-all active:scale-95"
                    >
                        ⚡ 极速添加 V4
                    </button>
                </div>

                    <div className="grid grid-cols-1 gap-4">
                        {llmProviders.map(provider => {
                            const modelCount = llmPresets.filter(m => m.providerId === provider.id).length;
                            return (
                                <div key={provider.id} onClick={() => pushPage({ type: 'PROVIDER_EDIT', id: provider.id })} className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className={clsx("w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-sm transition-transform group-hover:scale-110", provider.type === 'gemini' ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600")}>
                                                {provider.type === 'gemini' ? 'G' : 'O'}
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-800 text-lg group-hover:text-indigo-700 transition-colors">{provider.name}</div>
                                                <div className="text-xs font-medium text-slate-400 mt-0.5">{modelCount} 个模型 · {provider.type === 'gemini' ? 'Google Gemini' : 'OpenAI 兼容'}</div>
                                            </div>
                                        </div>
                                        <svg className="w-6 h-6 text-slate-300 group-hover:text-indigo-400 transform group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    if (currentPage.type === 'PROVIDER_EDIT') {
        const provider = llmProviders.find(i => i.id === currentPage.id);
        if (!provider) return (
            <div className="h-screen w-screen bg-[#f8fafc] flex flex-col items-center justify-center">
                <div className="text-slate-400">Provider Not Found</div>
                <button onClick={popPage} className="mt-4 text-indigo-600 font-bold">Back</button>
            </div>
        );

        return (
            <div className="h-full w-full bg-[#f8fafc] flex flex-col relative overflow-hidden font-sans">
                <Background />
                <Header title={provider.name} backLabel="模型库" />
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 relative z-10 max-w-2xl mx-auto w-full pb-10">

                    <SectionHeader text="供应商设置" />
                    <Card>
                        <InputGroup label="供应商名称" value={provider.name} onChange={(e: any) => updateProvider(provider.id, { name: e.target.value })} placeholder="例如: OpenRouter" />

                        <div className="mb-5">
                            <label className="block text-xs font-bold text-indigo-500 uppercase tracking-wide mb-2 ml-1">接口类型</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => updateProvider(provider.id, { type: 'gemini' })} className={clsx("p-3 rounded-xl border text-sm font-bold transition-all", provider.type === 'gemini' ? "bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50")}>Google Gemini</button>
                                <button onClick={() => updateProvider(provider.id, { type: 'openai' })} className={clsx("p-3 rounded-xl border text-sm font-bold transition-all", provider.type === 'openai' ? "bg-emerald-50 border-emerald-500 text-emerald-700 ring-1 ring-emerald-500" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50")}>OpenAI 兼容</button>
                            </div>
                        </div>

                        {provider.type === 'openai' && (
                            <InputGroup label="Base URL" value={provider.baseUrl || ''} onChange={(e: any) => updateProvider(provider.id, { baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" sub="请输入 API 基础地址" />
                        )}

                        <div className="mb-2">
                            <label className="block text-xs font-bold text-indigo-500 uppercase tracking-wide mb-1.5 ml-1">API Key</label>
                            <InputGroup type="password" value={provider.apiKey || ''} onChange={(e: any) => updateProvider(provider.id, { apiKey: e.target.value })} placeholder="sk-..." sub="仅存储在本地浏览器中" />
                        </div>
                    </Card>

                    <SectionHeader text="模型列表" />
                    <div className="space-y-3">
                        {llmPresets.filter(m => m.providerId === provider.id).map(llm => (
                            <div key={llm.id} onClick={() => pushPage({ type: 'LLM_EDIT', id: llm.id })} className="bg-white/80 backdrop-blur-md p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer flex justify-between items-center group">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">M</div>
                                    <div>
                                        <div className="font-bold text-slate-800 text-sm">{llm.name}</div>
                                        <div className="text-[10px] font-mono text-slate-400">{llm.modelId}</div>
                                    </div>
                                </div>
                                <svg className="w-4 h-4 text-slate-300 group-hover:text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </div>
                        ))}

                        <button
                            onClick={() => {
                                const id = `llm-${Date.now()}`;
                                setLlmPresets(p => [...p, { id, name: '新模型', providerId: provider.id, modelId: '' }]);
                                pushPage({ type: 'LLM_EDIT', id });
                            }}
                            className="w-full py-3 border border-dashed border-slate-300 text-slate-400 hover:text-indigo-500 hover:border-indigo-300 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 bg-white/50"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            添加模型 ID
                        </button>
                    </div>

                    <div className="mt-10">
                        <button onClick={() => deleteProvider(provider.id)} className="w-full py-3 text-red-600 border border-red-100 bg-red-50 hover:bg-red-100 rounded-xl font-bold transition-colors">删除此供应商</button>
                    </div>
                </div>
            </div>
        );
    }

    if (currentPage.type === 'LLM_EDIT') {
        const llm = llmPresets.find(i => i.id === currentPage.id);
        if (!llm) return null;
        const provider = llmProviders.find(p => p.id === llm.providerId);

        return (
            <div className="h-full w-full bg-[#f8fafc] flex flex-col relative overflow-hidden font-sans">
                <Background />
                <Header title="编辑模型" backLabel={provider?.name || "AI 模型库"} />
                <div className="p-4 pt-8 relative z-10 max-w-2xl mx-auto w-full">
                    <Card>
                        <InputGroup label="模型昵称" value={llm.name} onChange={(e: any) => updateLlm(llm.id, { name: e.target.value })} />

                        <div className="mb-5">
                            <label className="block text-xs font-bold text-indigo-500 uppercase tracking-wide mb-2 ml-1">所属供应商</label>
                            <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-slate-600 font-medium flex items-center gap-2">
                                <span className={clsx("w-2 h-2 rounded-full", provider?.type === 'gemini' ? "bg-blue-500" : "bg-emerald-500")}></span>
                                {provider?.name || 'Unknown Provider'}
                            </div>
                        </div>

                        <InputGroup label="Model ID" value={llm.modelId} onChange={(e: any) => updateLlm(llm.id, { modelId: e.target.value })} placeholder="gemini-2.5-flash" sub="请输入该供应商支持的模型 ID" />

                        <button onClick={() => deleteLlm(llm.id)} className="w-full py-3 text-red-600 border border-red-100 bg-red-50 hover:bg-red-100 rounded-xl font-bold transition-colors">删除模型</button>
                    </Card>
                </div>
            </div>
        );
    }

    if (currentPage.type === 'TTS_EDIT') {
        const tts = ttsPresets.find(i => i.id === currentPage.id) || ttsPresets[0];
        if (!tts) return null;
        return (
            <div className="h-full w-full bg-[#f8fafc] flex flex-col relative overflow-hidden font-sans">
                <Background />
                <Header title="Edge TTS 设置" backLabel="设置" />
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 relative z-10 max-w-2xl mx-auto w-full pb-10">
                    <Card>
                        <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100 mb-8 mt-4 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 text-indigo-200 pointer-events-none">
                                <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" /></svg>
                            </div>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-2xl bg-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <div>
                                    <div className="font-black text-indigo-900 text-base">Python 核心驱动</div>
                                    <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Edge-TTS Engine Active</div>
                                </div>
                            </div>
                            <p className="text-xs text-indigo-600 leading-relaxed font-medium mt-1">
                                已切换至高性能 Python 后端。支持更稳定的语音合成、精细的语速调节以及全量微软音色库。
                            </p>
                        </div>

                        <InputGroup label="后端地址" value={tts.baseUrl || ''} onChange={(e: any) => updateTts(tts.id, { baseUrl: e.target.value })} placeholder="/api/edge-tts-generate" sub="通常保持默认即可" />

                        <div className="mt-8">
                            <button
                                onClick={syncVoices}
                                disabled={isSyncing}
                                className={clsx(
                                    "w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2",
                                    isSyncing ? "bg-slate-100 text-slate-400" : "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-indigo-200"
                                )}
                            >
                                {isSyncing ? (
                                    <>
                                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        同步中...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5 font-bold" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        同步云端音色库
                                    </>
                                )}
                            </button>
                            <p className="text-[10px] text-slate-400 mt-3 text-center px-4">
                                点击同步将从 Python 后端获取最新的微软音色列表
                            </p>
                        </div>
                    </Card>
                </div>
            </div>
        );
    }

    if (currentPage.type === 'ACTOR_LIST') {
        return (
            <div className="h-full w-full bg-[#f8fafc] flex flex-col relative overflow-hidden font-sans">
                <Background />
                <Header title="玩家列表" backLabel="设置" />
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 relative z-10 max-w-3xl mx-auto w-full">
                    <button onClick={createActor} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold mb-6 shadow-lg shadow-indigo-200 transition-all active:scale-95">+ 添加新玩家</button>
                    <div className="space-y-3">
                        {actors.filter(a => a.id !== config.narratorActorId).map(actor => {
                            const llm = llmPresets.find(l => l.id === actor.llmPresetId);
                            const tts = ttsPresets.find(t => t.id === actor.ttsPresetId);
                            return (
                                <div key={actor.id} onClick={() => pushPage({ type: 'ACTOR_EDIT', id: actor.id })} className="bg-white/80 backdrop-blur-md p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer flex justify-between items-center group">
                                    <div>
                                        <div className="font-bold text-slate-800 text-lg">{actor.name}</div>
                                        <div className="text-xs mt-1.5 flex gap-2">
                                            <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100 font-medium">{llm?.name || 'Unknown LLM'}</span>
                                            <span className="bg-purple-50 text-purple-600 px-2 py-0.5 rounded border border-purple-100 font-medium">{tts?.name || 'Unknown TTS'}</span>
                                        </div>
                                    </div>
                                    <svg className="w-5 h-5 text-slate-300 group-hover:text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-xs text-slate-400 mt-8 text-center">如需添加新类型玩家，请先在“AI 模型库”中添加模型。点击玩家可进行分身。</p>
                </div>
            </div>
        );
    }

    if (currentPage.type === 'ACTOR_EDIT') {
        const actor = actors.find(i => i.id === currentPage.id);
        if (!actor) return null;
        const llm = llmPresets.find(p => p.id === actor.llmPresetId);
        const llmModelId = llm?.modelId || "未知ID";
        const isNarrator = actor.id === config.narratorActorId;
        const tts = ttsPresets.find(t => t.id === actor.ttsPresetId);

        return (
            <div className="h-full w-full bg-[#f8fafc] flex flex-col relative overflow-hidden font-sans">
                <Background />
                <Header title={isNarrator ? "设置上帝" : "编辑玩家"} backLabel={isNarrator ? "设置" : "玩家列表"} />
                <div className="p-4 pt-8 relative z-10 max-w-2xl mx-auto w-full">
                    <Card>
                        <InputGroup label={isNarrator ? "旁白称呼" : "玩家名称"} value={actor.name} onChange={(e: any) => updateActor(actor.id, { name: e.target.value })} />

                        <div className="grid grid-cols-2 gap-5 mb-6">
                            <div>
                                <label className="block text-xs font-bold text-indigo-500 uppercase tracking-wide mb-1.5 ml-1">基础模型 (Brain)</label>
                                <div className="relative">
                                    <select value={actor.llmPresetId} onChange={e => updateActor(actor.id, { llmPresetId: e.target.value })} className="w-full bg-white border border-slate-200 rounded-xl p-3.5 text-slate-800 appearance-none font-medium shadow-sm focus:ring-2 focus:ring-indigo-500/20">
                                        {llmProviders.map(provider => (
                                            <optgroup key={provider.id} label={provider.name}>
                                                {llmPresets.filter(p => p.providerId === provider.id).map(p => (
                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                ))}
                                            </optgroup>
                                        ))}
                                        {/* Handle orphaned presets if any */}
                                        {llmPresets.filter(p => !llmProviders.find(prov => prov.id === p.providerId)).length > 0 && (
                                            <optgroup label="其他">
                                                {llmPresets.filter(p => !llmProviders.find(prov => prov.id === p.providerId)).map(p => (
                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-purple-500 uppercase tracking-wide mb-1.5 ml-1">TTS 引擎 (Mouth)</label>
                                <div className="relative">
                                    <select value={actor.ttsPresetId} onChange={e => updateActor(actor.id, { ttsPresetId: e.target.value })} className="w-full bg-white border border-slate-200 rounded-xl p-3.5 text-slate-800 appearance-none font-medium shadow-sm focus:ring-2 focus:ring-purple-500/20">
                                        {ttsPresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100 mb-8">
                            <label className="block text-xs font-bold text-indigo-800 uppercase tracking-wide mb-2">音色设置 (Voice)</label>

                            {/* Full Voice Selector (If Synced) */}
                            {voices.length > 0 && (
                                <div className="mb-4">
                                    <div className="relative">
                                        <select
                                            value={actor.voiceId}
                                            onChange={e => updateActor(actor.id, { voiceId: e.target.value })}
                                            className="w-full bg-white border border-slate-200 rounded-xl p-3 text-slate-800 appearance-none font-medium shadow-sm focus:ring-2 focus:ring-indigo-500/20 text-sm"
                                        >
                                            <option value="">-- 选择音色 --</option>
                                            {/* Group by Locale */}
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
                                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </div>
                                    </div>
                                    <p className="text-[9px] text-indigo-400 mt-1.5 ml-1 font-bold italic uppercase tracking-tighter">
                                        Found {voices.length} voices from backend
                                    </p>
                                </div>
                            )}

                            <div className="flex gap-3 mb-3">
                                <input
                                    value={actor.voiceId}
                                    onChange={e => updateActor(actor.id, { voiceId: e.target.value })}
                                    className="flex-1 bg-white border border-slate-200 rounded-xl p-3 font-mono text-xs text-slate-700 shadow-sm"
                                    placeholder="zh-CN-XiaoxiaoNeural"
                                />
                                <button
                                    onClick={async () => {
                                        if (tts) await AudioService.getInstance().playOrGenerate(
                                            `你好，我是${actor.name}。很高兴见到大家。`,
                                            actor.voiceId,
                                            `test-${Date.now()}`,
                                            tts,
                                            undefined,
                                            undefined,
                                            config.ttsSpeed || 1.0
                                        );
                                    }}
                                    className="px-5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-md shadow-purple-200 transition-all active:scale-95 text-xs"
                                >试听</button>
                            </div>

                            <div className="mt-4">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">推荐音色</label>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓 (女)' },
                                        { id: 'zh-CN-YunxiNeural', name: '云希 (男)' },
                                        { id: 'zh-CN-YunjianNeural', name: '云健 (男-稳重)' },
                                        { id: 'zh-CN-XiaochenNeural', name: '晓辰 (女-知性)' },
                                        { id: 'zh-CN-XiaoyiNeural', name: '晓伊 (女-资讯)' },
                                        { id: 'zh-CN-YunyangNeural', name: '云扬 (男-新闻)' },
                                        { id: 'en-US-AriaNeural', name: 'Aria (EN-F)' },
                                    ].map(v => (
                                        <button
                                            key={v.id}
                                            onClick={() => updateActor(actor.id, { voiceId: v.id })}
                                            className={clsx(
                                                "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border",
                                                actor.voiceId === v.id
                                                    ? "bg-indigo-100 border-indigo-300 text-indigo-700"
                                                    : "bg-white border-slate-200 text-slate-500 hover:border-indigo-200"
                                            )}
                                        >
                                            {v.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <p className="text-[10px] text-slate-500 mt-3 ml-1 leading-relaxed">
                                使用微软 Edge TTS 引擎。同步后可选择全量音色。
                            </p>
                        </div>

                        {!isNarrator && (
                            <div className="flex gap-4 border-t border-slate-100 pt-6">
                                <button onClick={() => { cloneActor(actor.id); pushPage({ type: 'ACTOR_LIST' }) }} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 transition-all active:scale-95 flex items-center justify-center gap-2">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                    创建分身
                                </button>

                                <button onClick={() => deleteActor(actor.id)} className="flex-1 py-3 text-red-600 border border-red-100 bg-red-50 hover:bg-red-100 rounded-xl font-bold transition-colors">
                                    删除玩家
                                </button>
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        );
    }

    return null;
};

export default SettingsView;
