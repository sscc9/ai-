import React, { useState, useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { clsx } from 'clsx';
import {
    playersAtom,
    currentSpeakerIdAtom,
    gamePhaseAtom,
    userInputAtom,
    isPortraitModeAtom,
    godStateAtom,
    isReplayModeAtom,
    isTheaterModeAtom,
    speakingQueueAtom,
    isDaytimeAtom
} from '../store';

import { GamePhase, PlayerStatus } from '../types';

const HumanInputPanel = () => {
    const players = useAtomValue(playersAtom);
    const currentSpeakerId = useAtomValue(currentSpeakerIdAtom);
    const phase = useAtomValue(gamePhaseAtom);
    const godState = useAtomValue(godStateAtom);
    const speakingQueue = useAtomValue(speakingQueueAtom);
    const setUserInput = useSetAtom(userInputAtom);
    const isPortrait = useAtomValue(isPortraitModeAtom);
    const isReplayMode = useAtomValue(isReplayModeAtom);
    const isTheaterMode = useAtomValue(isTheaterModeAtom);
    const isDay = useAtomValue(isDaytimeAtom);

    const humanPlayer = players.find(p => p.isHuman);
    const isMyTurn = humanPlayer && currentSpeakerId === humanPlayer.id;

    const [text, setText] = useState('');
    const [targetId, setTargetId] = useState<number | null>(null);
    const [isListening, setIsListening] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize speech textarea based on content (with bounds 60px to 200px)
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea && !isCollapsed) {
            textarea.style.height = 'auto';
            const scrollHeight = textarea.scrollHeight;
            if (scrollHeight > 200) {
                textarea.style.overflowY = 'auto';
            } else {
                textarea.style.overflowY = 'hidden';
            }
            textarea.style.height = `${Math.min(Math.max(scrollHeight, 60), 200)}px`;
        }
    }, [text, isCollapsed]);

    // Reset when turn changes
    useEffect(() => {
        if (isMyTurn) {
            setText('');
            setTargetId(null);
            setIsCollapsed(false); // Auto-expand when turn starts
        }
    }, [isMyTurn, phase]); // Also reset on phase change

    if (!isMyTurn || !humanPlayer || isReplayMode || isTheaterMode) return null;


    const aliveEveryone = players.filter(p => p.status === PlayerStatus.ALIVE);
    const isVoting = phase === GamePhase.VOTING || phase === GamePhase.SHERIFF_VOTE;
    
    // For voting, you can vote for anyone alive. For actions (kill/check), you target others.
    let targetCandidates = isVoting ? aliveEveryone : aliveEveryone.filter(p => p.id !== humanPlayer.id);
    if (phase === GamePhase.GUARD_ACTION) {
        // Guard can protect themselves, but not the same player consecutively
        targetCandidates = aliveEveryone.filter(p => p.id !== godState.lastGuardProtect);
    } else if (phase === GamePhase.SHERIFF_VOTE) {
        // Only candidates who did not quit can be voted for
        const candidates = godState.sheriffCandidates?.filter(c => !godState.sheriffQuitters?.includes(c)) || [];
        targetCandidates = aliveEveryone.filter(p => candidates.includes(p.id));
    } else if (phase === GamePhase.SHERIFF_TRANS) {
        // Badge can be passed to any alive player except yourself
        targetCandidates = aliveEveryone.filter(p => p.id !== humanPlayer.id);
    }

    // Determine special choice modes
    const isChoosingCampaign = phase === GamePhase.SHERIFF_ELECT && !(godState.sheriffCandidates?.includes(humanPlayer.id) || godState.sheriffQuitters?.includes(humanPlayer.id)) && !godState.sheriffCandidates;
    const isChoosingDirection = phase === GamePhase.DAY_DISCUSSION && godState.sheriffId === humanPlayer.id && speakingQueue.length === 0;
    const isCandidateSpeaking = phase === GamePhase.SHERIFF_ELECT && godState.sheriffCandidates?.includes(humanPlayer.id);

    let instruction = "";
    if (phase === GamePhase.WITCH_ACTION) {
        const dyingId = godState.wolfTarget;
        instruction = dyingId ? `昨晚 ${dyingId} 号玩家被刀。` : "昨晚无人被杀。";
    } else if (phase === GamePhase.SEER_ACTION) {
        instruction = "请选择查验一名玩家。";
    } else if (phase === GamePhase.GUARD_ACTION) {
        instruction = godState.lastGuardProtect 
            ? `请选择守护一名玩家（不能选择 ${godState.lastGuardProtect} 号）。` 
            : "请选择守护一名玩家。";
    } else if (phase === GamePhase.WEREWOLF_ACTION) {
        instruction = "与队友沟通并决定目标。";
    } else if (phase === GamePhase.VOTING) {
        instruction = "请投出你的一票。";
    } else if (phase === GamePhase.HUNTER_ACTION) {
        instruction = "请开枪带走一名玩家。";
    } else if (phase === GamePhase.SHERIFF_ELECT) {
        instruction = isCandidateSpeaking ? "竞选发言中（可选择退水）" : "选择是否竞选警长。";
    } else if (phase === GamePhase.SHERIFF_VOTE) {
        instruction = "请投出你的警长票。";
    } else if (phase === GamePhase.SHERIFF_TRANS) {
        instruction = "请交割警徽或选择撕毁。";
    }

    const handleSubmit = () => {
        if (isVoting && targetId === null) {
            if (!confirm("确定弃票吗？")) return;
        }

        if (!text.trim() && phase !== GamePhase.WITCH_ACTION && !isVoting && phase !== GamePhase.WEREWOLF_ACTION && phase !== GamePhase.SHERIFF_TRANS) {
            alert("请先输入发言或理由。");
            return;
        }

        setUserInput({
            speak: text || (isVoting ? "投票" : ""),
            actionTarget: targetId,
            useCure: phase === GamePhase.WITCH_ACTION && targetId === 0,
            poisonTarget: phase === GamePhase.WITCH_ACTION && targetId !== 0 && targetId !== null ? targetId : null
        });
    };

    const handleChooseCampaign = (run: boolean) => {
        setUserInput({
            runForSheriff: run,
            speak: run ? "我要上警竞选警长。" : "我留在警下。"
        });
    };

    const handleChooseDirection = (dir: "LEFT" | "RIGHT") => {
        setUserInput({
            direction: dir,
            speak: dir === "LEFT" ? "警长决定顺时针（左手边）发言。" : "警长决定逆时针（右手边）发言。"
        });
    };

    const handleQuitCampaign = () => {
        setUserInput({
            quitCampaign: true,
            speak: "我选择退水，退出警长竞选。"
        });
    };

    const startListening = () => {
        if (!('webkitSpeechRecognition' in window)) {
            alert("抱歉，您的浏览器不支持语音识别。");
            return;
        }

        const recognition = new (window as any).webkitSpeechRecognition();
        recognition.lang = 'zh-CN';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setText(prev => prev + transcript);
        };

        recognition.start();
    };

    const needsTarget = [
        GamePhase.VOTING,
        GamePhase.WEREWOLF_ACTION,
        GamePhase.SEER_ACTION,
        GamePhase.WITCH_ACTION,
        GamePhase.HUNTER_ACTION,
        GamePhase.GUARD_ACTION,
        GamePhase.SHERIFF_VOTE,
        GamePhase.SHERIFF_TRANS
    ].includes(phase);    return (
        <div className={clsx(
            "fixed bottom-0 left-0 right-0 z-[100] p-4 transition-all duration-300",
            isDay
                ? "bg-white/95 backdrop-blur-2xl border-t border-white/50 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]"
                : "bg-[#0b0f19]/95 backdrop-blur-2xl border-t border-slate-800 shadow-[0_-10px_40px_rgba(0,0,0,0.4)]"
        )}>
            <div className="max-w-6xl mx-auto w-full px-2 sm:px-4">
                {isCollapsed ? (
                    <div className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                            </span>
                            <span className={clsx("font-bold text-sm", isDay ? "text-indigo-600" : "text-indigo-400")}>
                                你的回合 ({humanPlayer.role})
                            </span>
                            {instruction && (
                                <span className={clsx(
                                    "text-xs font-medium border-l pl-2 ml-1 hidden sm:inline max-w-[250px] truncate",
                                    isDay ? "text-slate-500 border-slate-200" : "text-slate-400 border-slate-800"
                                )}>
                                    {instruction}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={() => setIsCollapsed(false)}
                            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-xs font-bold transition-all shadow-md active:scale-95"
                        >
                            <span>展开面板行动</span>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2.5">
                        {/* Header Row: Title, Role, Instruction, Voice, Collapse */}
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100/50 dark:border-slate-800/50">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className={clsx("font-bold text-sm shrink-0", isDay ? "text-indigo-600" : "text-indigo-400")}>你的回合</span>
                                <span className={clsx(
                                    "px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider shrink-0",
                                    isDay ? "bg-indigo-100 text-indigo-700" : "bg-indigo-950/80 text-indigo-300 border border-indigo-900/30"
                                )}>
                                    {humanPlayer.role}
                                </span>
                                {instruction && (
                                    <span className={clsx(
                                        "text-xs font-medium border-l pl-2 ml-1 truncate",
                                        isDay ? "text-slate-500 border-slate-200" : "text-slate-400 border-slate-800"
                                    )}>
                                        {instruction}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {!isVoting && !isChoosingCampaign && !isChoosingDirection && (
                                    <button
                                        onClick={startListening}
                                        className={clsx(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-300",
                                            isListening 
                                                ? "bg-red-500 text-white animate-pulse" 
                                                : (isDay ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-slate-800 text-slate-300 hover:bg-slate-700")
                                        )}
                                    >
                                        {isListening ? "正在聆听..." : "🎤 语音转文字"}
                                    </button>
                                )}
                                <button
                                    onClick={() => setIsCollapsed(true)}
                                    className={clsx(
                                        "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-300",
                                        isDay ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                                    )}
                                    title="收起发言面板"
                                >
                                    <span>收起 ▽</span>
                                </button>
                            </div>
                        </div>

                        {/* Content Area */}
                        {isChoosingCampaign ? (
                            <div className="flex gap-3 justify-end py-1">
                                <button
                                    onClick={() => handleChooseCampaign(false)}
                                    className={clsx(
                                        "px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-[0.97]",
                                        isDay
                                            ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
                                            : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                                    )}
                                >
                                    留在警下
                                </button>
                                <button
                                    onClick={() => handleChooseCampaign(true)}
                                    className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-[0.97]"
                                >
                                    上警竞选警长
                                </button>
                            </div>
                        ) : isChoosingDirection ? (
                            <div className="flex gap-3 justify-end py-1">
                                <button
                                    onClick={() => handleChooseDirection("LEFT")}
                                    className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-[0.97]"
                                >
                                    从左边开始 (顺时针)
                                </button>
                                <button
                                    onClick={() => handleChooseDirection("RIGHT")}
                                    className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-[0.97]"
                                >
                                    从右边开始 (逆时针)
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {/* Input Row: Speech Input and Actions */}
                                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center w-full">
                                    {/* Speech text input (if not voting) */}
                                    {!isVoting && (
                                        <div className="flex-grow w-full sm:self-center">
                                            <textarea
                                                ref={textareaRef}
                                                value={text}
                                                onChange={(e) => setText(e.target.value)}
                                                placeholder="输入你的发言或选择目标的理由..."
                                                style={{ minHeight: '60px' }}
                                                className={clsx(
                                                    "w-full p-3 text-sm rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none shadow-sm font-medium",
                                                    isDay
                                                        ? "bg-white border border-slate-200 text-slate-800 placeholder:text-slate-400"
                                                        : "bg-slate-800/40 border border-slate-750 text-slate-100 placeholder:text-slate-500"
                                                )}
                                            />
                                        </div>
                                    )}

                                    {/* Target input and Submit controls */}
                                    <div className="flex flex-row items-center gap-2 shrink-0 justify-between sm:justify-end w-full sm:w-auto sm:self-center">
                                        {needsTarget && (
                                            <div className={clsx(
                                                "flex items-center gap-1.5 border px-2.5 py-1.5 rounded-xl shadow-sm justify-start",
                                                isDay ? "bg-slate-50 border-slate-200" : "bg-slate-800/40 border-slate-750"
                                            )}>
                                                <div className="flex items-center gap-1.5">
                                                    <span className={clsx("text-xs font-bold whitespace-nowrap", isDay ? "text-slate-600" : "text-slate-400")}>
                                                        目标号码:
                                                    </span>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="15"
                                                        value={targetId === null ? '' : (targetId === 0 ? '' : targetId)}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            if (val === '') {
                                                                setTargetId(null);
                                                            } else {
                                                                setTargetId(parseInt(val));
                                                            }
                                                        }}
                                                        placeholder="输入"
                                                        className={clsx(
                                                            "w-11 py-0.5 text-center text-xs font-bold border rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500",
                                                            isDay ? "bg-white border-slate-300 text-slate-850" : "bg-slate-900 border-slate-700 text-slate-100"
                                                        )}
                                                    />
                                                    <span className={clsx("text-xs font-bold mr-1.5", isDay ? "text-slate-600" : "text-slate-400")}>号</span>
                                                </div>

                                                {/* Quick special action shortcuts */}
                                                <div className="flex gap-1 border-l pl-2 border-slate-200/60 dark:border-slate-700/60">
                                                    {phase === GamePhase.WITCH_ACTION && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setTargetId(targetId === 0 ? null : 0)}
                                                            className={clsx(
                                                                "px-2 py-0.5 rounded text-[10px] font-bold border transition-colors",
                                                                targetId === 0
                                                                    ? "bg-emerald-600 border-emerald-600 text-white"
                                                                    : (isDay ? "bg-white border-slate-200 text-slate-600 hover:bg-slate-100" : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800")
                                                            )}
                                                        >
                                                            救人
                                                        </button>
                                                    )}
                                                    {phase === GamePhase.SHERIFF_TRANS && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setTargetId(null)}
                                                            className={clsx(
                                                                "px-2 py-0.5 rounded text-[10px] font-bold border transition-colors",
                                                                targetId === null
                                                                    ? "bg-red-650 border-red-650 text-white"
                                                                    : (isDay ? "bg-white border-slate-200 text-slate-600 hover:bg-slate-100" : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800")
                                                            )}
                                                        >
                                                            撕警徽
                                                        </button>
                                                    )}
                                                    {phase !== GamePhase.SHERIFF_TRANS && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setTargetId(null)}
                                                            className={clsx(
                                                                "px-2 py-0.5 rounded text-[10px] font-bold border transition-colors",
                                                                targetId === null
                                                                    ? "bg-slate-700 border-slate-700 text-white"
                                                                    : (isDay ? "bg-white border-slate-200 text-slate-600 hover:bg-slate-100" : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800")
                                                            )}
                                                        >
                                                            {isVoting ? "弃票" : "不操作"}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex gap-2 items-center shrink-0 ml-auto sm:ml-0">
                                            {isCandidateSpeaking && (
                                                <button
                                                    onClick={handleQuitCampaign}
                                                    className={clsx(
                                                        "px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-[0.97]",
                                                        isDay
                                                            ? "bg-red-55 hover:bg-red-100 text-red-700 border-red-200"
                                                            : "bg-red-950/20 hover:bg-red-950/40 text-red-400 border-red-900/30"
                                                    )}
                                                >
                                                    退水
                                                </button>
                                            )}
                                            <button
                                                onClick={handleSubmit}
                                                disabled={needsTarget && targetId !== null && !targetCandidates.some(p => p.id === targetId) && !(phase === GamePhase.WITCH_ACTION && targetId === 0)}
                                                className={clsx(
                                                    "px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all active:scale-[0.97]",
                                                    "disabled:from-slate-400 disabled:to-slate-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                                                )}
                                            >
                                                确认行动
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Error display if user inputs an invalid target id */}
                                {needsTarget && targetId !== null && !targetCandidates.some(p => p.id === targetId) && !(phase === GamePhase.WITCH_ACTION && targetId === 0) && (
                                    <div className="text-[10px] text-red-500 font-bold ml-1 flex items-center gap-1">
                                        <span>⚠️</span>
                                        <span>可选目标号码: [{targetCandidates.map(p => p.id).join(', ')}] 号</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default HumanInputPanel;
