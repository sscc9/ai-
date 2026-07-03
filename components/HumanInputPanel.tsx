import React, { useState, useEffect } from 'react';
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
    speakingQueueAtom
} from '../store';

import { GamePhase, PlayerStatus } from '../types';

const HumanInputPanel = () => {
    const players = useAtomValue(playersAtom);
    const currentSpeakerId = useAtomValue(currentSpeakerIdAtom);
    const phase = useAtomValue(gamePhaseAtom);
    const godState = useAtomValue(godStateAtom);
    const speakingQueue = useAtomValue(speakingQueueAtom);
    const setUserInput = useSetAtom(userInputAtom) as any;
    const isPortrait = useAtomValue(isPortraitModeAtom);
    const isReplayMode = useAtomValue(isReplayModeAtom);
    const isTheaterMode = useAtomValue(isTheaterModeAtom);

    const humanPlayer = players.find(p => p.isHuman);
    const isMyTurn = humanPlayer && currentSpeakerId === humanPlayer.id;

    const [text, setText] = useState('');
    const [targetId, setTargetId] = useState<number | null>(null);
    const [isListening, setIsListening] = useState(false);

    // Reset when turn changes
    useEffect(() => {
        if (isMyTurn) {
            setText('');
            setTargetId(null);
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
    ].includes(phase);

    return (
        <div className={clsx(
            "fixed bottom-0 left-0 right-0 z-[100] p-4 animate-slide-up",
            "bg-white/90 backdrop-blur-2xl border-t border-white/50 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]"
        )}>
            <div className="max-w-4xl mx-auto space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-indigo-600 font-bold">你的回合</span>
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-full uppercase tracking-wider">
                            {humanPlayer.role}
                        </span>
                        {instruction && (
                            <span className="text-xs text-slate-500 font-medium border-l border-slate-200 pl-2 ml-1">
                                {instruction}
                            </span>
                        )}
                    </div>
                    {!isVoting && !isChoosingCampaign && !isChoosingDirection && (
                        <button
                            onClick={startListening}
                            className={clsx(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                                isListening ? "bg-red-500 text-white animate-pulse" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            )}
                        >
                            {isListening ? "正在聆听..." : "🎤 语音转文字"}
                        </button>
                    )}
                </div>

                {isChoosingCampaign ? (
                    <div className="flex gap-4">
                        <button
                            onClick={() => handleChooseCampaign(true)}
                            className="flex-1 py-4 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-amber-100 transition-all active:scale-[0.98]"
                        >
                            我要上警竞选警长
                        </button>
                        <button
                            onClick={() => handleChooseCampaign(false)}
                            className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-lg shadow-sm transition-all active:scale-[0.98]"
                        >
                            留在警下投票
                        </button>
                    </div>
                ) : isChoosingDirection ? (
                    <div className="flex gap-4">
                        <button
                            onClick={() => handleChooseDirection("LEFT")}
                            className="flex-1 py-4 bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-indigo-100 transition-all active:scale-[0.98]"
                        >
                            从左边开始 (顺时针)
                        </button>
                        <button
                            onClick={() => handleChooseDirection("RIGHT")}
                            className="flex-1 py-4 bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-indigo-100 transition-all active:scale-[0.98]"
                        >
                            从右边开始 (逆时针)
                        </button>
                    </div>
                ) : (
                    <>
                        {!isVoting && (
                            <textarea
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                placeholder="输入你的发言或理由..."
                                className="w-full h-20 p-3 bg-white/50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none shadow-sm text-slate-800 placeholder:text-slate-400 font-medium"
                            />
                        )}

                        {needsTarget && (
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                                    {phase === GamePhase.WITCH_ACTION ? "选择操作目标 (可选)" : "选择目标"}
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {targetCandidates.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => setTargetId(p.id)}
                                            className={clsx(
                                                "px-4 py-2 rounded-xl text-sm font-bold transition-all border",
                                                targetId === p.id
                                                    ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200"
                                                    : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300 shadow-sm"
                                            )}
                                        >
                                            {p.id}号
                                        </button>
                                    ))}
                                    {phase === GamePhase.WITCH_ACTION && (
                                        <button
                                            onClick={() => setTargetId(targetId === 0 ? null : 0)}
                                            className={clsx(
                                                "px-4 py-2 rounded-xl text-sm font-bold transition-all border",
                                                targetId === 0
                                                    ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-200"
                                                    : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300 shadow-sm"
                                            )}
                                        >
                                            使用解药 (救人)
                                        </button>
                                    )}
                                    {phase === GamePhase.SHERIFF_TRANS && (
                                        <button
                                            onClick={() => setTargetId(null)}
                                            className={clsx(
                                                "px-4 py-2 rounded-xl text-sm font-bold transition-all border",
                                                targetId === null
                                                    ? "bg-red-600 border-red-600 text-white shadow-lg shadow-red-200"
                                                    : "bg-white border-slate-200 text-slate-600 hover:border-red-300 shadow-sm"
                                            )}
                                        >
                                            撕毁警徽 (撕警徽)
                                        </button>
                                    )}
                                    {phase !== GamePhase.SHERIFF_TRANS && (
                                        <button
                                            onClick={() => setTargetId(null)}
                                            className={clsx(
                                                "px-4 py-2 rounded-xl text-sm font-bold transition-all border",
                                                targetId === null
                                                    ? (isVoting ? "bg-slate-700 border-slate-700 text-white" : "bg-slate-800 border-slate-800 text-white")
                                                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 shadow-sm"
                                            )}
                                        >
                                            {isVoting ? "弃票" : "弃权/不操作"}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-4">
                            {isCandidateSpeaking && (
                                <button
                                    onClick={handleQuitCampaign}
                                    className="px-6 py-4 bg-red-100 hover:bg-red-200 text-red-700 rounded-2xl font-bold text-lg shadow-sm transition-all active:scale-[0.98]"
                                >
                                    退水 (退出竞选)
                                </button>
                            )}
                            <button
                                onClick={handleSubmit}
                                className="flex-grow py-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-2xl font-bold text-lg shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
                            >
                                确认行动
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default HumanInputPanel;
