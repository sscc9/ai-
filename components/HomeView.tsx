
import React, { useState, useEffect } from 'react';
import { useSetAtom, useAtom } from 'jotai';
import { clsx } from 'clsx';
import { initGameAtom, appScreenAtom, isHumanModeAtom } from '../store';

const HomeView = () => {
    const initGame = useSetAtom(initGameAtom);
    const setScreen = useSetAtom(appScreenAtom);
    const [selectedMode, setSelectedMode] = useState<9 | 12>(9);
    const [isHumanMode, setIsHumanMode] = useAtom(isHumanModeAtom);

    // Detect fullscreen mode to fix mobile scrolling issue
    const [isFullscreen, setIsFullscreen] = useState(false);
    useEffect(() => {
        const handleFsChange = () => {
            // Check both standard and webkit prefixed fullscreen element
            const fsElement = document.fullscreenElement || (document as any).webkitFullscreenElement;
            setIsFullscreen(!!fsElement);
        };
        // Listen to both standard and webkit events for Android Chrome compatibility
        document.addEventListener('fullscreenchange', handleFsChange);
        document.addEventListener('webkitfullscreenchange', handleFsChange);
        // Check initial state
        handleFsChange();
        return () => {
            document.removeEventListener('fullscreenchange', handleFsChange);
            document.removeEventListener('webkitfullscreenchange', handleFsChange);
        };
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
            const docElm = document.documentElement;
            if (docElm.requestFullscreen) {
                docElm.requestFullscreen();
            } else if ((docElm as any).webkitRequestFullscreen) {
                (docElm as any).webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if ((document as any).webkitExitFullscreen) {
                (document as any).webkitExitFullscreen();
            }
        }
    };

    return (
        <div className={clsx(
            "h-full w-full bg-[#f8fafc] text-slate-800 flex flex-col items-center relative font-sans selection:bg-indigo-100 scrollbar-hide",
            isFullscreen
                ? "justify-center overflow-hidden"
                : "justify-start sm:justify-center overflow-y-auto pt-3 pb-0 sm:py-4"
        )}>
            {/* Top Right Controls - Only show in mobile or if not fullscreen */}
            <div className="absolute top-4 right-4 z-50">
                <button
                    onClick={toggleFullscreen}
                    className="bg-white/20 hover:bg-white/40 text-slate-700 backdrop-blur-md border border-white/30 shadow-sm rounded-full p-2.5 transition-all active:scale-95"
                    title="全屏切换"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                </button>
            </div>

            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-indigo-200/30 rounded-full blur-[120px] mix-blend-multiply"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-blue-200/30 rounded-full blur-[120px] mix-blend-multiply"></div>
                <div className="absolute top-[20%] right-[10%] w-32 h-32 bg-purple-200/30 rounded-full blur-[60px] mix-blend-multiply"></div>
            </div>

            <div className="z-10 flex flex-col items-center space-y-4 sm:space-y-6 w-full max-w-md px-6 animate-fade-in-up">
                {/* Title Section */}
                <div className="text-center space-y-1">
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
                            "group relative flex flex-col items-center p-4 rounded-2xl border-2 transition-all duration-300 ease-out",
                            selectedMode === 9
                                ? "bg-white border-indigo-600 shadow-xl shadow-indigo-100 scale-105 z-10"
                                : "bg-white/50 border-transparent hover:bg-white hover:border-indigo-200 hover:shadow-lg"
                        )}
                    >
                        <div className={clsx("w-12 h-12 rounded-2xl flex items-center justify-center mb-3 transition-transform duration-300", selectedMode === 9 ? "scale-110 bg-indigo-100" : "group-hover:scale-110 bg-slate-100")}>
                            <svg className={clsx("w-6 h-6", selectedMode === 9 ? "text-indigo-500" : "text-slate-400")} viewBox="0 0 24 24" fill="currentColor">
                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                            </svg>
                        </div>
                        <span className={clsx("font-bold text-base", selectedMode === 9 ? "text-slate-900" : "text-slate-600")}>9人 标准局</span>
                        <span className="text-[10px] text-slate-400 mt-1 font-medium bg-slate-100 px-2 py-0.5 rounded-full">预女猎</span>
                        {selectedMode === 9 && <div className="absolute top-2 right-2 w-2 h-2 bg-indigo-600 rounded-full"></div>}
                    </button>

                    <button
                        onClick={() => setSelectedMode(12)}
                        className={clsx(
                            "group relative flex flex-col items-center p-4 rounded-2xl border-2 transition-all duration-300 ease-out",
                            selectedMode === 12
                                ? "bg-white border-indigo-600 shadow-xl shadow-indigo-100 scale-105 z-10"
                                : "bg-white/50 border-transparent hover:bg-white hover:border-indigo-200 hover:shadow-lg"
                        )}
                    >
                        <div className={clsx("w-12 h-12 rounded-2xl flex items-center justify-center mb-3 transition-transform duration-300", selectedMode === 12 ? "scale-110 bg-indigo-100" : "group-hover:scale-110 bg-slate-100")}>
                            <svg className={clsx("w-6 h-6", selectedMode === 12 ? "text-indigo-500" : "text-slate-400")} viewBox="0 0 24 24" fill="currentColor">
                                <path d="M4.5 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM14.25 8.625a3.375 3.375 0 1 1 6.75 0 3.375 3.375 0 0 1-6.75 0ZM1.5 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM17.25 19.128l-.001.144a2.25 2.25 0 0 1-.233.96 10.088 10.088 0 0 0 5.06-1.01.75.75 0 0 0 .42-.643 4.875 4.875 0 0 0-6.957-4.611 8.586 8.586 0 0 1 1.71 5.157v.003Z" />
                            </svg>
                        </div>
                        <span className={clsx("font-bold text-base", selectedMode === 12 ? "text-slate-900" : "text-slate-600")}>12人 进阶局</span>
                        <span className="text-[10px] text-slate-400 mt-1 font-medium bg-slate-100 px-2 py-0.5 rounded-full">女猎守</span>
                        {selectedMode === 12 && <div className="absolute top-2 right-2 w-2 h-2 bg-indigo-600 rounded-full"></div>}
                    </button>
                </div>
                {/* Human Mode Toggle */}
                <div className="w-full flex items-center justify-between p-4 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-2xl shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-50 flex-shrink-0">
                            <svg className="w-5 h-5 text-indigo-500" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                            </svg>
                        </div>
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
                <div className="flex flex-col w-full space-y-2">
                    <button
                        onClick={() => initGame(selectedMode)}
                        className="w-full py-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 transform transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        开始游戏
                    </button>

                    <button
                        onClick={() => setScreen('TTS')}
                        className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-200 transform transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                        </svg>
                        <span>TTS 朗读模式</span>
                    </button>

                    <button
                        onClick={() => setScreen('HISTORY')}
                        className="w-full py-3.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-600 rounded-xl font-bold shadow-sm transition-all flex items-center justify-center gap-2 group"
                    >
                        <svg className="w-5 h-5 text-slate-500 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z" />
                        </svg>
                        <span>历史对局</span>
                    </button>

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setScreen('SETTINGS')}
                            className="py-3.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-600 rounded-xl font-bold shadow-sm transition-all flex items-center justify-center gap-2 group"
                        >
                            <svg className="w-5 h-5 text-slate-500 group-hover:rotate-90 transition-transform duration-500" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.06 7.06 0 0 0-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                            </svg>
                            <span>设置</span>
                        </button>
                        <button
                            onClick={() => setScreen('AGENT')}
                            className="py-3.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-600 rounded-xl font-bold shadow-sm transition-all flex items-center justify-center gap-2 group"
                        >
                            <svg className="w-5 h-5 text-slate-500 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2L9.1 9.1 2 12l7.1 2.9L12 22l2.9-7.1L22 12l-7.1-2.9L12 2zm0 3.5l1.9 4.6 4.6 1.9-4.6 1.9-1.9 4.6-1.9-4.6-4.6-1.9 4.6-1.9L12 5.5z" />
                            </svg>
                            <span>助手</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Footer Copyright - Balanced spacing with safe area */}
            <div className="text-slate-400 text-[10px] w-full text-center mt-4 pb-[calc(0.25rem+var(--safe-area-inset-bottom))] shrink-0">
                Powered by Google Gemini & Jotai
            </div>
        </div>
    );
};

export default HomeView;
