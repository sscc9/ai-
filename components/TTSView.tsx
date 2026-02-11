
import React, { useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
    ttsStateAtom,
    appScreenAtom,
    edgeTtsVoicesAtom,
    ttsPresetsAtom,
    isPlayingAudioAtom
} from '../atoms';
import { AudioService } from '../audio';
import { clsx } from 'clsx';

const TTSView = () => {
    const [state, setState] = useAtom(ttsStateAtom);
    const setScreen = useSetAtom(appScreenAtom);
    const voices = useAtomValue(edgeTtsVoicesAtom);
    const ttsPresets = useAtomValue(ttsPresetsAtom);
    const [isPlaying, setIsPlaying] = useAtom(isPlayingAudioAtom);
    const [isGenerating, setIsGenerating] = useState(false);

    const handlePlay = async () => {
        if (!state.text.trim() || isPlaying) return;

        setIsGenerating(true);
        try {
            const tts = ttsPresets.find(t => t.id === 'tts-edge') || ttsPresets[0];
            await AudioService.getInstance().playOrGenerate(
                state.text,
                state.voiceId,
                `tts-${Date.now()}`,
                tts,
                () => setIsPlaying(true),
                () => setIsPlaying(false),
                state.speed
            );
        } catch (e) {
            console.error("TTS Playback Error:", e);
        } finally {
            setIsGenerating(false);
            setIsPlaying(false);
        }
    };

    const handleStop = () => {
        AudioService.getInstance().stop();
        setIsPlaying(false);
    };

    const handleDownload = async () => {
        if (!state.text.trim()) return;

        setIsGenerating(true);
        try {
            // Use the internal fetchTTS if exposed or just call the API directly
            const response = await fetch('/api/edge-tts-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: state.text,
                    voice: state.voiceId,
                    rate: state.speed >= 1.0 ? `+${Math.round((state.speed - 1) * 100)}%` : `${Math.round((state.speed - 1) * 100)}%`,
                    pitch: '+0Hz'
                })
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `tts-audio-${Date.now()}.mp3`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        } catch (e) {
            console.error("Download Error:", e);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="h-full w-full bg-slate-950 text-white flex flex-col items-center justify-start p-4 sm:p-8 overflow-y-auto font-sans scrollbar-hide">
            <div className="max-w-4xl w-full space-y-8 py-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setScreen('HOME')}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="text-center flex-1">
                        <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">TTS 朗读工具</h1>
                        <p className="text-slate-400 text-sm font-medium">输入文字，即刻发声</p>
                    </div>
                    <div className="w-10"></div> {/* Spacer */}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left: Input Area */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="relative group">
                            <textarea
                                value={state.text}
                                onChange={(e) => setState({ ...state, text: e.target.value })}
                                className="w-full h-[400px] bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-3xl p-6 text-white focus:ring-2 focus:ring-blue-500/50 outline-none transition-all resize-none leading-relaxed text-lg"
                                placeholder="在这里粘贴或输入你想朗读的文字..."
                            />
                            {state.text.length > 0 && (
                                <div className="absolute bottom-4 right-6 text-slate-500 text-xs font-mono">
                                    {state.text.length} 字符
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Controls */}
                    <div className="space-y-6">
                        {/* Voice Selection */}
                        <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-3xl p-6 space-y-4">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <span className="text-lg">🗣️</span> 选择音色
                            </label>
                            <div className="relative">
                                <select
                                    value={state.voiceId}
                                    onChange={(e) => setState({ ...state, voiceId: e.target.value })}
                                    className="w-full bg-slate-800 border border-white/10 rounded-xl p-3 text-sm outline-none appearance-none focus:ring-2 focus:ring-blue-500/50"
                                >
                                    {Array.from(new Set(voices.map(v => v.Locale))).sort().map(locale => (
                                        <optgroup key={locale} label={locale}>
                                            {voices.filter(v => v.Locale === locale).map(v => (
                                                <option key={v.ShortName} value={v.ShortName}>
                                                    {v.FriendlyName.replace('Microsoft ', '').replace('Online (Natural) - ', '')} ({v.Gender === 'Male' ? '男' : '女'})
                                                </option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7 7" /></svg>
                                </div>
                            </div>
                        </div>

                        {/* Speed Control */}
                        <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-3xl p-6 space-y-4">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <span className="text-lg">⏩</span> 朗读语速
                                </label>
                                <span className="text-blue-400 font-mono text-sm font-bold">{state.speed.toFixed(1)}x</span>
                            </div>
                            <input
                                type="range"
                                min="0.5"
                                max="2.0"
                                step="0.1"
                                value={state.speed}
                                onChange={(e) => setState({ ...state, speed: parseFloat(e.target.value) })}
                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                            <div className="flex justify-between text-[10px] text-slate-600 font-bold px-1">
                                <span>慢</span>
                                <span>标准</span>
                                <span>快</span>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="space-y-3">
                            {!isPlaying ? (
                                <button
                                    onClick={handlePlay}
                                    disabled={!state.text.trim() || isGenerating}
                                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-bold text-lg shadow-xl shadow-blue-500/20 transform transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                                >
                                    {isGenerating ? (
                                        <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    ) : (
                                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                                    )}
                                    开始朗读
                                </button>
                            ) : (
                                <button
                                    onClick={handleStop}
                                    className="w-full py-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-bold text-lg shadow-xl shadow-red-500/20 transform transition-all active:scale-[0.98] flex items-center justify-center gap-3 animate-pulse"
                                >
                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1H9a1 1 0 01-1-1V7z" clipRule="evenodd" /></svg>
                                    正在播放 (点击停止)
                                </button>
                            )}

                            <button
                                onClick={handleDownload}
                                disabled={!state.text.trim() || isGenerating}
                                className="w-full py-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-2xl font-bold text-lg border border-white/5 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                下载音频
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TTSView;
