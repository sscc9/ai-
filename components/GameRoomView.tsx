

import React, { useState, useEffect, useRef } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import { clsx } from 'clsx';
import {
    gamePhaseAtom,
    playersAtom,
    logsAtom,
    exitGameAtom,
    isAutoPlayAtom,
    turnCountAtom,
    isTheaterModeAtom,
    timelineAtom,
    isPortraitModeAtom,
    isDaytimeAtom,
    replayPerspectiveAtom,
    isReplayModeAtom,
    gameWeatherAtom,
    GameWeather
} from '../store';
import { GamePhase, PHASE_LABELS } from '../types';
import { useGameEngine } from '../hooks/useGameEngine';
import { useTheaterEngine } from '../hooks/useTheaterEngine';
import PlayerCard from './PlayerCard';
import { AutoScrollLog } from './GameLogs';
import HumanInputPanel from './HumanInputPanel';
import WeatherBackground from './WeatherBackground';

const getWeatherLabel = (weather: GameWeather, isDay: boolean) => {
    switch (weather) {
        case GameWeather.SUNNY:
            return isDay ? { label: '晴空', icon: '☀️' } : { label: '星空', icon: '🌌' };
        case GameWeather.CLOUDY:
            return { label: '多云', icon: '☁️' };
        case GameWeather.RAINY:
            return isDay ? { label: '下雨', icon: '🌧️' } : { label: '夜雨', icon: '🌧️' };
        case GameWeather.THUNDERSTORM:
            return { label: '雷雨', icon: '⛈️' };
        default:
            return { label: '晴空', icon: '☀️' };
    }
};

const GameRoomView = () => {
    const players = useAtomValue(playersAtom);
    const logs = useAtomValue(logsAtom);
    const phase = useAtomValue(gamePhaseAtom);
    const [isAuto, setIsAuto] = useAtom(isAutoPlayAtom);
    const exitGame = useSetAtom(exitGameAtom);
    const turnCount = useAtomValue(turnCountAtom);
    const [isTheater, setIsTheater] = useAtom(isTheaterModeAtom);
    const timeline = useAtomValue(timelineAtom);
    const isDay = useAtomValue(isDaytimeAtom);
    const [perspective, setPerspective] = useAtom(replayPerspectiveAtom);
    const isReplayMode = useAtomValue(isReplayModeAtom);
    const isPortrait = useAtomValue(isPortraitModeAtom);
    const weather = useAtomValue(gameWeatherAtom);

    useGameEngine();
    useTheaterEngine();

    const rootRef = useRef<HTMLDivElement>(null);

    // Fullscreen Logic
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFsChange);

        // Force scroll to top on mount to prevent layout offsets
        window.scrollTo(0, 0);
        if (rootRef.current) {
            rootRef.current.scrollTop = 0;
        }

        return () => document.removeEventListener('fullscreenchange', handleFsChange);
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(e => console.error(e));
        } else {
            document.exitFullscreen().catch(e => console.error(e));
        }
    };

    const topRowCount = Math.ceil(players.length / 2);
    const topRowSeats = players.slice(0, topRowCount).map(p => p.seatNumber);
    const bottomRowSeats = players.slice(topRowCount, players.length).map(p => p.seatNumber);

    return (
        <div
            ref={rootRef}
            className="absolute inset-0 w-full bg-slate-950 flex flex-col overflow-hidden select-none text-slate-800 font-sans overscroll-none"
        >
            {/* --- Background Layers --- */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                {/* Day Mode Background: Warm, Sunrise, Energetic */}
                <div className={clsx(
                    "absolute inset-0 bg-gradient-to-br from-sky-50 via-rose-50 to-amber-50 transition-opacity duration-1000 ease-in-out",
                    isDay ? "opacity-100" : "opacity-0"
                )}>
                    <div className="absolute top-[-10%] right-[-5%] w-[60vw] h-[60vw] bg-orange-200/30 rounded-full blur-[80px] mix-blend-multiply" />
                    <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-blue-200/30 rounded-full blur-[80px] mix-blend-multiply" />
                </div>

                {/* Night Mode Background: Dark, Mystical, Starry Night (Deep Indigo/Dark Purple) */}
                <div className={clsx(
                    "absolute inset-0 bg-gradient-to-br from-[#090d16] via-[#0f172a] to-[#181530] transition-opacity duration-1000 ease-in-out",
                    !isDay ? "opacity-100" : "opacity-0"
                )}>
                    <div className="absolute top-[10%] left-[20%] w-[50vw] h-[50vw] bg-indigo-500/10 rounded-full blur-[100px]" />
                    <div className="absolute bottom-[10%] right-[10%] w-[60vw] h-[60vw] bg-purple-500/10 rounded-full blur-[100px]" />
                    {/* Moon glow hint */}
                    <div className="absolute top-10 right-20 w-32 h-32 bg-indigo-400/20 blur-[60px] rounded-full" />
                </div>
                {/* Weather effects (stars, drifting clouds, rain particles, lightning glow) */}
                <WeatherBackground />
            </div>

            {/* --- Controls Overlay --- */}
            <div className={clsx("absolute top-4 z-50", isPortrait ? "left-8" : "left-4")}>
                <button
                    onClick={exitGame}
                    className={clsx(
                        "backdrop-blur-md border shadow-sm rounded-full p-2.5 transition-all active:scale-95",
                        isDay
                            ? "bg-white/20 hover:bg-white/40 text-slate-700 border-white/30"
                            : "bg-slate-800/40 hover:bg-slate-800/60 text-slate-200 border-slate-700/30"
                    )}
                    title="退出游戏"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>

            <div className={clsx("absolute top-4 z-50 flex items-center gap-2", isPortrait ? "right-8" : "right-4")}>
                {/* --- Replay Perspective Switcher (Visible in Replay Mode) --- */}
                {isReplayMode && (
                    <div className={clsx(
                        "backdrop-blur-md border rounded-full p-1 flex mr-2 transition-all duration-1000",
                        isDay
                            ? "bg-white/30 border-white/40"
                            : "bg-slate-800/40 border-slate-700/30"
                    )}>
                        <button
                            onClick={() => setPerspective('GOOD')}
                            className={clsx(
                                "px-3 py-1 rounded-full text-xs font-bold transition-all",
                                perspective === 'GOOD'
                                    ? (isDay ? "bg-white text-indigo-600 shadow-sm" : "bg-slate-700 text-white shadow-sm")
                                    : (isDay ? "text-slate-600 hover:bg-white/50" : "text-slate-400 hover:bg-slate-800/50")
                            )}
                        >
                            好人
                        </button>
                        <button
                            onClick={() => setPerspective('WOLF')}
                            className={clsx(
                                "px-3 py-1 rounded-full text-xs font-bold transition-all",
                                perspective === 'WOLF'
                                    ? "bg-red-500 text-white shadow-sm"
                                    : (isDay ? "text-slate-600 hover:bg-white/50" : "text-slate-400 hover:bg-slate-800/50")
                            )}
                        >
                            狼人
                        </button>
                        <button
                            onClick={() => setPerspective('GOD')}
                            className={clsx(
                                "px-3 py-1 rounded-full text-xs font-bold transition-all",
                                perspective === 'GOD'
                                    ? (isDay ? "bg-indigo-600 text-white shadow-sm" : "bg-indigo-600 text-white shadow-sm")
                                    : (isDay ? "text-slate-600 hover:bg-white/50" : "text-slate-400 hover:bg-slate-800/50")
                            )}
                        >
                            上帝
                        </button>
                    </div>
                )}
            </div>

            {/* --- Top Player Row --- */}
            {/* Using flex, we need to ensure it stacks properly. pt-20 accounts for top controls */}
            <div className={clsx(
                "z-20 w-full flex justify-center items-end pointer-events-none",
                isPortrait ? "pt-24 pb-1 px-4" : "pt-20 pb-2 px-4"
            )}>
                <div className={clsx(
                    "pointer-events-auto flex flex-nowrap justify-center max-w-7xl",
                    isPortrait ? "gap-1.5" : "gap-1 md:gap-3"
                )}>
                    {topRowSeats.map(i => <PlayerCard key={i} seat={i} isTop={true} />)}
                </div>
            </div>

            {/* --- Main Stage (Glassmorphism) --- */}
            {/* Changed h-full to flex-1 to work with flex-col parent correctly */}
            <div className={clsx(
                "relative z-10 w-full flex-1 overflow-hidden flex flex-col justify-center items-center min-h-0",
                isPortrait ? "px-8" : "px-4"
            )}>
                <div className={clsx(
                    "w-full h-full max-h-full transition-all duration-1000 relative flex flex-col",
                    isPortrait ? "py-3 rounded-xl max-w-full" : "py-6 rounded-3xl max-w-6xl", // Tighter padding & radius for portrait
                    isDay
                        ? "bg-white/60 backdrop-blur-xl border border-white/50 ring-1 ring-white/60 text-slate-800 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)]"
                        : "bg-slate-900/65 backdrop-blur-xl border border-slate-800/60 ring-1 ring-slate-800/40 text-slate-100 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
                )}>
                    <div className={clsx(
                        "flex-none flex justify-between items-center border-b",
                        isDay ? "border-slate-900/5" : "border-slate-100/10",
                        isPortrait ? "mb-2 pb-1 px-3" : "mb-4 pb-2 px-6"
                    )}>
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold opacity-50 tracking-widest">DAY {turnCount}</span>
                            <span className={clsx(
                                "text-xs font-bold px-3 py-1 rounded-full transition-colors shadow-sm",
                                isDay 
                                    ? "bg-orange-100 text-orange-700" 
                                    : "bg-indigo-950/80 text-indigo-300 border border-indigo-900/30"
                            )}>
                                {perspective === 'GOD' ? PHASE_LABELS[phase] : (isDay ? "白天" : "夜晚")}
                            </span>
                            <span className={clsx(
                                "text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-full transition-all duration-1000 shadow-sm flex items-center gap-1",
                                isDay 
                                    ? "bg-slate-100 text-slate-700 border border-slate-200/50" 
                                    : "bg-slate-800/80 text-slate-300 border border-slate-700/25"
                            )}>
                                <span>{getWeatherLabel(weather, isDay).icon}</span>
                                <span>{getWeatherLabel(weather, isDay).label}</span>
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {!isTheater && !isReplayMode && phase !== GamePhase.GAME_REVIEW && (
                                <>
                                    <button
                                        onClick={() => setIsAuto(!isAuto)}
                                        className={clsx(
                                            "px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5",
                                            isAuto 
                                                ? "bg-emerald-500 text-white shadow-emerald-500/30" 
                                                : (isDay ? "bg-slate-200 text-slate-600 hover:bg-slate-300" : "bg-slate-800 text-slate-300 hover:bg-slate-700")
                                        )}
                                    >
                                        {isAuto ? (
                                            <>
                                                <svg className="w-3.5 h-3.5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                <span>暂停</span>
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                <span>自动推进</span>
                                            </>
                                        )}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                    <AutoScrollLog logs={logs} className={clsx("flex-1 min-h-0", isPortrait ? "px-3" : "px-6")} />
                </div>
            </div>

            {/* --- Bottom Player Row --- */}
            <div className={clsx(
                "z-20 w-full flex justify-center items-start pointer-events-none",
                isPortrait ? "pt-1 px-4" : "pt-2 px-4"
            )}
                style={{
                    paddingBottom: isPortrait
                        ? 'calc(2.5rem + var(--safe-area-inset-bottom))'
                        : 'calc(1.5rem + var(--safe-area-inset-bottom))'
                }}
            >
                <div className={clsx(
                    "pointer-events-auto flex flex-nowrap justify-center max-w-7xl",
                    isPortrait ? "gap-1.5" : "gap-1 md:gap-3"
                )}>
                    {bottomRowSeats.map(i => <PlayerCard key={i} seat={i} isTop={false} />)}
                </div>
            </div>

            <HumanInputPanel />
        </div>
    );
}

export default GameRoomView;