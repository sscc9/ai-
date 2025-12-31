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
    isTheaterModeAtom
} from '../store';

import { GamePhase, PlayerStatus } from '../types';

const HumanInputPanel = () => {
    const players = useAtomValue(playersAtom);
    const currentSpeakerId = useAtomValue(currentSpeakerIdAtom);
    const phase = useAtomValue(gamePhaseAtom);
    const godState = useAtomValue(godStateAtom);
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
    const isVoting = phase === GamePhase.VOTING;
    // For voting, you can vote for anyone alive. For actions (kill/check), you target others.
    const targetCandidates = isVoting ? aliveEveryone : aliveEveryone.filter(p => p.id !== humanPlayer.id);

    let instruction = "";
    if (phase === GamePhase.WITCH_ACTION) {
        const dyingId = godState.wolfTarget;
        instruction = dyingId ? `昨晚 ${dyingId} 号玩家被刀。` : "昨晚无人被杀。";
    } else if (phase === GamePhase.SEER_ACTION) {
        instruction = "请选择查验一名玩家。";
    } else if (phase === GamePhase.WEREWOLF_ACTION) {
        instruction = "与队友沟通并决定目标。";
    } else if (phase === GamePhase.VOTING) {
        instruction = "请投出你的一票。";
    } else if (phase === GamePhase.HUNTER_ACTION) {
        instruction = "请开枪带走一名玩家。";
    }

    const handleSubmit = () => {
        if (isVoting && targetId === null) {
            if (!confirm("确定弃票吗？")) return;
        }

        if (!text.trim() && phase !== GamePhase.WITCH_ACTION && !isVoting && phase !== GamePhase.WEREWOLF_ACTION) {
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
        GamePhase.GUARD_ACTION
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
                    {!isVoting && (
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
                        </div>
                    </div>
                )}

                <button
                    onClick={handleSubmit}
                    className="w-full py-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-2xl font-bold text-lg shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
                >
                    确认行动
                </button>
            </div>
        </div>
    );
};

export default HumanInputPanel;
