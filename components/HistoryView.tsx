
import React, { useState, useEffect, useCallback } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import { clsx } from 'clsx';
import {
    appScreenAtom,
    gameArchivesAtom,
    gameArchivesLoadableAtom,
    loadGameArchiveAtom,
    globalApiConfigAtom,
    actorProfilesAtom,
    ttsPresetsAtom
} from '../store';
import { Role, ROLE_INFO, TTSPreset } from '../types';
import { AudioService, PrefetchResult } from '../audio';

const HistoryView = () => {
    const setScreen = useSetAtom(appScreenAtom);

    // Use loadable atom to avoid global suspense
    const archivesLoadable = useAtomValue(gameArchivesLoadableAtom);
    const setArchives = useSetAtom(gameArchivesAtom);
    const archives = archivesLoadable.state === 'hasData' ? archivesLoadable.data : [];
    const isArchivesLoading = archivesLoadable.state === 'loading';

    const loadGame = useSetAtom(loadGameArchiveAtom);

    const globalConfig = useAtomValue(globalApiConfigAtom);
    const actors = useAtomValue(actorProfilesAtom);
    const ttsPresets = useAtomValue(ttsPresetsAtom);

    const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
    const [audioCoverage, setAudioCoverage] = useState<Record<string, number>>({});
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // Track current generating item to show detailed status
    const [generatingStatus, setGeneratingStatus] = useState<string>("");

    const checkAllCoverage = useCallback(async () => {
        if (archives.length === 0) return;
        const coverage: Record<string, number> = {};
        await Promise.all(archives.map(async (game) => {
            if (!game.timeline || game.timeline.length === 0) {
                coverage[game.id] = 0;
                return;
            }
            const keys = game.timeline.map(t => t.audioKey);
            const found = await AudioService.getInstance().checkCacheStatus(keys);
            coverage[game.id] = Math.floor((found / keys.length) * 100);
        }));
        setAudioCoverage(coverage);
    }, [archives]);

    useEffect(() => {
        checkAllCoverage();
    }, [checkAllCoverage]);

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();

        if (deleteConfirmId === id) {
            // Second click: Perform delete
            const newArchives = archives.filter(a => a.id !== id);
            setArchives(newArchives);
            setDeleteConfirmId(null);
        } else {
            // First click: Request confirmation
            setDeleteConfirmId(id);
            // Reset after 3 seconds if not confirmed
            setTimeout(() => {
                setDeleteConfirmId(prev => prev === id ? null : prev);
            }, 3000);
        }
    };

    const handleDownloadAudio = async (gameId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const game = archives.find(a => a.id === gameId);
        if (!game || !game.timeline || game.timeline.length === 0) return;

        setDownloadProgress(prev => ({ ...prev, [gameId]: 0 }));

        const total = game.timeline.length;
        const timeline = game.timeline;
        const CONCURRENCY = 10; // 改为 10 并发

        try {
            // 定义处理单个事件的函数
            const processEvent = async (index: number) => {
                const event = timeline[index];

                // 更新状态提示（显示当前最新触发的任务）
                setGeneratingStatus(`${index + 1}/${total}: ${event.speakerName}`);

                let ttsPresetToUse: TTSPreset;
                let voiceIdToUse: string;

                if (event.type === 'NARRATOR') {
                    const narratorActor = actors.find(a => a.id === globalConfig.narratorActorId) || actors[0];
                    const narratorTts = ttsPresets.find(p => p.id === narratorActor.ttsPresetId) || ttsPresets[0];

                    voiceIdToUse = narratorActor.voiceId;
                    ttsPresetToUse = narratorTts;
                } else {
                    voiceIdToUse = event.voiceId;
                    ttsPresetToUse = {
                        id: 'temp-replay',
                        name: 'Temp Replay',
                        provider: event.ttsProvider,
                        modelId: event.ttsModel,
                        baseUrl: event.ttsBaseUrl,
                        apiKey: event.ttsApiKey
                    };
                }

                let result: PrefetchResult = 'FAILED';
                let attempts = 0;

                // 简单的重试逻辑
                while (result === 'FAILED' && attempts < 3) {
                    try {
                        result = await AudioService.getInstance().prefetch(
                            event.text,
                            voiceIdToUse,
                            event.audioKey,
                            ttsPresetToUse
                        );
                    } catch (err) {
                        console.warn("Prefetch error", err);
                    }

                    if (result === 'FAILED') {
                        attempts++;
                        // 失败后随机延迟 1-3 秒再重试，避免瞬间并发过高导致持续 429
                        if (attempts < 3) await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
                    }
                }
                return result;
            };

            // 分批次执行 (Chunk Processing)
            for (let i = 0; i < total; i += CONCURRENCY) {
                // 生成当前批次的索引数组
                const batchIndices = Array.from({ length: Math.min(CONCURRENCY, total - i) }, (_, k) => i + k);

                // 并发执行当前批次
                await Promise.all(batchIndices.map(idx => processEvent(idx)));

                // 批次完成后更新进度条
                const completedCount = Math.min(i + CONCURRENCY, total);
                setDownloadProgress(prev => ({ ...prev, [gameId]: Math.floor((completedCount / total) * 100) }));
            }

            // 全部完成后检查缓存覆盖率
            await checkAllCoverage();

        } catch (error) {
            console.error("Batch download halted:", error);
            alert("生成过程中断，请重试。");
        } finally {
            setGeneratingStatus("");
            setTimeout(() => {
                setDownloadProgress(prev => { const next = { ...prev }; delete next[gameId]; return next; });
            }, 1000);
        }
    };

    return (
        <div className="h-full w-full bg-[#f8fafc] flex flex-col relative overflow-hidden font-sans">
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-10%] left-[20%] w-[600px] h-[600px] bg-indigo-100/50 rounded-full blur-[100px] mix-blend-multiply"></div>
                <div className="absolute bottom-[10%] right-[-10%] w-[600px] h-[600px] bg-blue-100/50 rounded-full blur-[100px] mix-blend-multiply"></div>
            </div>

            <div className="flex items-center h-16 bg-white/70 backdrop-blur-md border-b border-slate-200 px-6 sticky top-0 z-20 shadow-sm">
                <button onClick={() => setScreen('HOME')} className="flex items-center text-indigo-600 font-bold hover:text-indigo-700 transition-colors">
                    <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                    主页
                </button>
                <div className="absolute left-1/2 transform -translate-x-1/2 text-lg font-black text-slate-800 tracking-tight">历史对局</div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 relative z-10 max-w-4xl mx-auto w-full space-y-4">
                {isArchivesLoading ? (
                    <div className="flex flex-col items-center justify-center mt-20 gap-4">
                        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                        <p className="text-slate-400 font-bold animate-pulse">加载历史记录中...</p>
                    </div>
                ) : archives.length === 0 ? (
                    <div className="text-center text-slate-400 mt-20 flex flex-col items-center">
                        <div className="text-6xl mb-4 opacity-50">📜</div>
                        <p className="text-lg font-medium">暂无历史记录</p>
                        <p className="text-xs mt-2">完成一局游戏后会自动保存到这里</p>
                    </div>
                ) : (
                    archives.slice().reverse().map((game) => {
                        const isDownloading = downloadProgress[game.id] !== undefined;
                        const coverage = audioCoverage[game.id] || 0;
                        const isComplete = coverage === 100;
                        const hasPartial = coverage > 0 && coverage < 100;

                        return (
                            <div
                                key={game.id}
                                onClick={() => !isDownloading && loadGame(game)}
                                className={clsx(
                                    "bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200 p-4 transition-all duration-300 group relative",
                                    isDownloading ? "cursor-wait opacity-90" : "cursor-pointer hover:bg-white hover:shadow-lg hover:border-indigo-200"
                                )}
                            >
                                <div className="flex justify-between items-start gap-2">
                                    {/* Left Side: Info */}
                                    <div className="flex flex-col gap-1.5 min-w-0">
                                        <div className="text-xl font-black text-slate-800 tracking-tight leading-none flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-2">
                                            <span>{new Date(game.timestamp).toLocaleString('zh-CN', { month: 'short', day: 'numeric' })}</span>
                                            <span className="text-sm font-bold text-slate-400 mb-0.5">{new Date(game.timestamp).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <div className="text-slate-500 text-xs font-bold flex items-center gap-2 font-mono">
                                            <div className="flex items-center gap-1">
                                                <span className="opacity-70">👤</span>
                                                <span>{game.playerCount}</span>
                                            </div>
                                            <div className="w-0.5 h-0.5 rounded-full bg-slate-300"></div>
                                            <div className="flex items-center gap-1">
                                                <span className="opacity-70">🔄</span>
                                                <span>{game.turnCount}天</span>
                                            </div>
                                            <div className="w-0.5 h-0.5 rounded-full bg-slate-300"></div>
                                            <div className="flex items-center gap-1">
                                                <span className="opacity-70">💬</span>
                                                <span>{game.logs.length}条</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Side: Actions & Status */}
                                    <div className="flex flex-col items-end gap-2">
                                        <div className="flex items-center gap-2 flex-wrap justify-end">
                                            {/* Winner Badge moved here */}
                                            <span className={clsx("px-2 py-1.5 rounded-lg text-[10px] font-bold border shadow-sm whitespace-nowrap",
                                                game.winner === 'GOOD' ? "bg-blue-50 text-blue-600 border-blue-100" :
                                                    game.winner === 'WOLF' ? "bg-red-50 text-red-600 border-red-100" : "bg-slate-50 text-slate-500 border-slate-100"
                                            )}>
                                                {game.winner === 'GOOD' ? '好人胜利' : game.winner === 'WOLF' ? '狼人胜利' : '未知结果'}
                                            </span>

                                            {isDownloading ? (
                                                <div className="flex items-center gap-1 bg-indigo-50 rounded-lg px-2 py-1.5 text-[10px] text-indigo-600 font-bold border border-indigo-100 shadow-sm">
                                                    <div className="w-2.5 h-2.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                                    {downloadProgress[game.id]}%
                                                    <span className="ml-1 text-[9px] opacity-70 truncate max-w-[80px]">{generatingStatus}</span>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={(e) => handleDownloadAudio(game.id, e)}
                                                    className={clsx(
                                                        "px-2 py-1.5 rounded-lg transition-all flex items-center gap-1 border text-[10px] font-bold shadow-sm whitespace-nowrap",
                                                        isComplete ? "text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100" :
                                                            hasPartial ? "text-orange-600 border-orange-200 bg-orange-50 hover:bg-orange-100" :
                                                                "text-slate-600 border-slate-200 bg-white hover:bg-slate-50"
                                                    )}
                                                >
                                                    {isComplete ? (
                                                        <>
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                            <span>已生成</span>
                                                        </>
                                                    ) : hasPartial ? (
                                                        <>
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                            <span>补全 {coverage}%</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                                            <span>生成语音</span>
                                                        </>
                                                    )}
                                                </button>
                                            )}

                                            {!isDownloading && (
                                                <button
                                                    onClick={(e) => handleDelete(game.id, e)}
                                                    className={clsx(
                                                        "w-12 py-1.5 flex items-center justify-center rounded-lg transition-all",
                                                        deleteConfirmId === game.id
                                                            ? "bg-red-50 text-red-600 text-[10px] font-bold"
                                                            : "text-slate-300 hover:text-red-500 hover:bg-slate-50"
                                                    )}
                                                >
                                                    {deleteConfirmId === game.id ? (
                                                        "确认?"
                                                    ) : (
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1.5">
                                    {game.players.map(p => (
                                        <div key={p.id} className="relative w-8 h-8 rounded-full overflow-hidden ring-2 ring-white shadow-sm" title={`${p.seatNumber}号 ${ROLE_INFO[p.role].label}`}>
                                            <img src={`https://picsum.photos/seed/${p.avatarSeed}/50`} className="w-full h-full object-cover" />
                                            <div className="absolute bottom-0 right-0 bg-slate-900/80 text-[8px] text-white px-1 font-bold">{p.seatNumber}</div>
                                            {p.role === Role.WEREWOLF && <div className="absolute top-0 right-0 text-[8px] bg-red-500/80 rounded-bl p-0.5">🐺</div>}
                                        </div>
                                    ))}
                                </div>

                                {!isDownloading && (
                                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                                        <div className="bg-indigo-600/90 backdrop-blur-sm text-white px-6 py-2 rounded-full font-bold shadow-xl flex items-center gap-2 transform scale-90 group-hover:scale-100 transition-transform">
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
                                            回放对局
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default HistoryView;
