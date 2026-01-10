import React, { useEffect, useRef } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
    podcastLogsAtom,
    podcastConfigAtom,
    podcastPhaseAtom,
    isAutoPlayAtom,
    actorProfilesAtom,
    appScreenAtom,
    isReplayModeAtom,
    logsAtom
} from '../atoms';
import { exitGameAtom } from '../store';
import { usePodcastEngine } from '../hooks/usePodcastEngine';
import { useTheaterEngine } from '../hooks/useTheaterEngine';
import { AutoScrollLog } from './GameLogs';
import { clsx } from 'clsx';

const PodcastRoomView = () => {
    const liveLogs = useAtomValue(podcastLogsAtom);
    const replayLogs = useAtomValue(logsAtom); // From Theater Engine
    const isReplay = useAtomValue(isReplayModeAtom);

    // Choose logs source based on mode
    const logs = isReplay ? replayLogs : liveLogs;

    const config = useAtomValue(podcastConfigAtom);
    const phase = useAtomValue(podcastPhaseAtom);
    const actors = useAtomValue(actorProfilesAtom);
    const [isAuto, setIsAuto] = useAtom(isAutoPlayAtom);
    // const isReplay = useAtomValue(isReplayModeAtom); // Already defined
    const exit = useSetAtom(exitGameAtom);

    // Inject engine
    const { runTurn } = usePodcastEngine();

    // Inject theater engine for replay support
    useTheaterEngine();

    const hostActor = { id: 'host-mock', name: config.hostName };
    const guest1Actor = { id: 'guest1-mock', name: config.guest1Name };

    return (
        <div className="h-full w-full bg-slate-950 flex flex-col overflow-hidden font-sans relative">
            {/* Background Decoration */}
            <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500 rounded-full blur-[120px] animate-pulse-slow" />
            </div>

            {/* Header */}
            <div className="z-10 h-20 bg-black/40 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-6">
                <div className="flex items-center gap-4">
                    <button onClick={exit} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    <div>
                        <h2 className="text-white font-black tracking-tight truncate max-w-md">{config.topic}</h2>
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Recording Room</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {isReplay ? (
                        <div className="flex items-center gap-3">
                            <span className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 text-[10px] font-bold border border-amber-500/30 uppercase tracking-widest">
                                正在进行回放
                            </span>
                            <button
                                onClick={exit}
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-white/10 text-white hover:bg-white/20 transition-all border border-white/10"
                            >
                                退出回放
                            </button>
                        </div>
                    ) : (
                        <>
                            <button
                                onClick={() => setIsAuto(!isAuto)}
                                className={clsx(
                                    "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border",
                                    isAuto ? "bg-indigo-500 text-white border-indigo-400" : "bg-white/5 text-slate-400 border-white/10"
                                )}
                            >
                                {isAuto ? '正在自动录制' : '暂停录制'}
                            </button>
                            {!isAuto && (
                                <button
                                    onClick={runTurn}
                                    className="px-4 py-2 rounded-xl text-xs font-bold bg-white text-black hover:bg-slate-200 transition-all active:scale-95"
                                >
                                    下一位发言
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Stage: Guest Visuals */}
            <div className="z-10 flex-none h-48 flex justify-center items-center gap-16 py-4">
                {[hostActor, guest1Actor].map((actor, i) => {
                    // Check if speaking based on logs or current speaker state if available
                    // Host (i=0) speaks if speakerName matches hostName or if it's their turn
                    // Guest (i=1) speaks if speakerName matches guest1Name

                    const lastLog = logs[logs.length - 1];
                    const isSpeaking = lastLog?.speakerName === (i === 0 ? config.hostName : config.guest1Name);

                    return (
                        <div key={actor.id} className="flex flex-col items-center gap-4">
                            <div className={clsx(
                                "w-32 h-32 rounded-full border-4 overflow-hidden transition-all duration-500",
                                isSpeaking ? "border-indigo-500 scale-110 shadow-2xl shadow-indigo-500/30" : "border-white/10 grayscale opacity-60 scale-90"
                            )}>
                                <img src={`https://picsum.photos/seed/${actor.id}/200`} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex flex-col items-center">
                                <span className={clsx("text-sm font-bold transition-colors", isSpeaking ? "text-indigo-400" : "text-slate-500")}>
                                    {i === 0 ? config.hostName : config.guest1Name}
                                </span>
                                {i === 0 && <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">Host</span>}
                                {i === 1 && <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">Guest</span>}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Log Area */}
            <div className="z-10 flex-1 px-6 pb-6 overflow-hidden">
                <div className="h-full bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-inner overflow-hidden">
                    <AutoScrollLog logs={logs} className="h-full text-slate-200" />
                </div>
            </div>
        </div>
    );
};

export default PodcastRoomView;
