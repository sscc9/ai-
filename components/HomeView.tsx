
import React, { useState } from 'react';
import { useSetAtom, useAtom } from 'jotai';
import { clsx } from 'clsx';
import { initGameAtom, appScreenAtom, isHumanModeAtom } from '../store';

const HomeView = () => {
    const initGame = useSetAtom(initGameAtom);
    const setScreen = useSetAtom(appScreenAtom);
    const [selectedMode, setSelectedMode] = useState<9 | 12>(9);
    const [isHumanMode, setIsHumanMode] = useAtom(isHumanModeAtom);

    return (
        <div className="h-full w-full bg-[#f8fafc] text-slate-800 flex flex-col items-center justify-start sm:justify-center relative overflow-y-auto font-sans selection:bg-indigo-100 pt-6 pb-12 sm:py-0 scrollbar-hide">
            {/* Background Elements - Light & Harmonious */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-indigo-200/30 rounded-full blur-[120px] animate-pulse-slow mix-blend-multiply"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-blue-200/30 rounded-full blur-[120px] mix-blend-multiply"></div>
                <div className="absolute top-[20%] right-[10%] w-32 h-32 bg-purple-200/30 rounded-full blur-[60px] mix-blend-multiply"></div>
            </div>

            <div className="z-10 flex flex-col items-center space-y-6 sm:space-y-10 w-full max-w-md px-6 animate-fade-in-up">
                {/* Title Section */}
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-slate-200 shadow-sm mb-2">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                        </span>
                        <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Next-Gen Simulation</span>
                    </div>
                    <h1 className="text-6xl md:text-7xl font-black tracking-tight text-slate-900 drop-shadow-sm">
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-600">
                            AI 狼人杀
                        </span>
                    </h1>
                    <p className="text-slate-500 text-sm font-medium tracking-wide">
                        Pro Simulation Engine v2.0
                    </p>
                </div>

                {/* Selection Cards */}
                <div className="grid grid-cols-2 gap-4 w-full">
                    <button
                        onClick={() => setSelectedMode(9)}
                        className={clsx(
                            "group relative flex flex-col items-center p-5 rounded-2xl border-2 transition-all duration-300 ease-out",
                            selectedMode === 9
                                ? "bg-white border-indigo-600 shadow-xl shadow-indigo-100 scale-105 z-10"
                                : "bg-white/50 border-transparent hover:bg-white hover:border-indigo-200 hover:shadow-lg"
                        )}
                    >
                        <div className={clsx("text-3xl mb-3 transition-transform duration-300", selectedMode === 9 ? "scale-110" : "group-hover:scale-110")}>🌙</div>
                        <span className={clsx("font-bold text-base", selectedMode === 9 ? "text-slate-900" : "text-slate-600")}>9人 标准局</span>
                        <span className="text-[10px] text-slate-400 mt-1 font-medium bg-slate-100 px-2 py-0.5 rounded-full">预女猎</span>
                        {selectedMode === 9 && <div className="absolute top-2 right-2 w-2 h-2 bg-indigo-600 rounded-full"></div>}
                    </button>

                    <button
                        onClick={() => setSelectedMode(12)}
                        className={clsx(
                            "group relative flex flex-col items-center p-5 rounded-2xl border-2 transition-all duration-300 ease-out",
                            selectedMode === 12
                                ? "bg-white border-indigo-600 shadow-xl shadow-indigo-100 scale-105 z-10"
                                : "bg-white/50 border-transparent hover:bg-white hover:border-indigo-200 hover:shadow-lg"
                        )}
                    >
                        <div className={clsx("text-3xl mb-3 transition-transform duration-300", selectedMode === 12 ? "scale-110" : "group-hover:scale-110")}>🐺</div>
                        <span className={clsx("font-bold text-base", selectedMode === 12 ? "text-slate-900" : "text-slate-600")}>12人 进阶局</span>
                        <span className="text-[10px] text-slate-400 mt-1 font-medium bg-slate-100 px-2 py-0.5 rounded-full">女猎守</span>
                        {selectedMode === 12 && <div className="absolute top-2 right-2 w-2 h-2 bg-indigo-600 rounded-full"></div>}
                    </button>
                </div>
                {/* Human Mode Toggle */}
                <div className="w-full flex items-center justify-between p-4 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-2xl shadow-sm">
                    <div className="flex items-center gap-3">
                        <span className="text-xl">🧑‍💻</span>
                        <div>
                            <span className="text-sm font-bold text-slate-800 block">人类玩家参与</span>
                            <span className="text-[10px] text-slate-400 font-medium">你将作为一名玩家随机加入游戏</span>
                        </div>
                    </div>
                    <div
                        onClick={() => setIsHumanMode(!isHumanMode)}
                        className={clsx(
                            "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                            isHumanMode ? 'bg-indigo-500' : 'bg-slate-300'
                        )}
                    >
                        <span
                            className={clsx(
                                "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                isHumanMode ? 'translate-x-5' : 'translate-x-0'
                            )}
                        />
                    </div>
                </div>

                {/* Buttons */}
                <div className="flex flex-col w-full space-y-3">
                    <button
                        onClick={() => initGame(selectedMode)}
                        className="w-full py-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 transform transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        开始游戏
                    </button>

                    <button
                        onClick={() => setScreen('PODCAST_CONFIG')}
                        className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-purple-200 transform transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        <span className="text-xl">🎙️</span>
                        <span>讨论模式 (播客)</span>
                    </button>

                    <button
                        onClick={() => setScreen('HISTORY')}
                        className="w-full py-3.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-600 rounded-xl font-bold shadow-sm transition-all flex items-center justify-center gap-2 group"
                    >
                        <span className="group-hover:scale-110 transition-transform text-lg">📜</span>
                        <span>历史对局</span>
                    </button>

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setScreen('SETTINGS')}
                            className="py-3.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-600 rounded-xl font-bold shadow-sm transition-all flex items-center justify-center gap-2 group"
                        >
                            <span className="group-hover:rotate-90 transition-transform duration-500 text-lg">⚙️</span>
                            <span>设置</span>
                        </button>
                        <button
                            onClick={() => setScreen('AGENT')}
                            className="py-3.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-600 rounded-xl font-bold shadow-sm transition-all flex items-center justify-center gap-2 group"
                        >
                            <span className="group-hover:scale-110 transition-transform text-lg">✨</span>
                            <span>助手</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Footer Copyright - Balanced spacing with safe area */}
            <div className="mt-4 pb-[calc(1rem+var(--safe-area-inset-bottom))] text-slate-400 text-[10px] w-full text-center sm:absolute sm:bottom-4 sm:mt-0 sm:pb-0">
                Powered by Google Gemini & Jotai
            </div>
        </div>
    );
};

export default HomeView;
