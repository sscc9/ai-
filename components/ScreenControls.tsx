
import React from 'react';
import { useAtom } from 'jotai';
import { clsx } from 'clsx';
import { isPortraitModeAtom } from '../atoms';
import { useScreenRecorder } from '../hooks/useScreenRecorder';

// Premium SVG Icons
const PortraitIcon = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="5" y="2" width="14" height="20" rx="2" strokeWidth="2" />
        <path d="M12 18h.01" strokeWidth="3" strokeLinecap="round" />
    </svg>
);

const LandscapeIcon = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="2" y="5" width="20" height="14" rx="2" strokeWidth="2" />
        <path d="M18 12h.01" strokeWidth="3" strokeLinecap="round" />
    </svg>
);

const RecordIcon = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" strokeWidth="2" />
        <circle cx="12" cy="12" r="4" fill="currentColor" />
    </svg>
);

const StopIcon = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" />
        <circle cx="12" cy="12" r="9" strokeWidth="2" />
    </svg>
);

const ControlButton = ({ onClick, active, children, label, danger = false }: { onClick: () => void, active?: boolean, children: React.ReactNode, label: string, danger?: boolean }) => (
    <button
        onClick={onClick}
        className={clsx(
            "group relative flex items-center justify-center w-14 h-14 rounded-2xl shadow-xl backdrop-blur-xl transition-all duration-500 ease-out transform active:scale-95",
            active
                ? (danger ? "bg-red-500 text-white shadow-red-500/40 ring-4 ring-red-500/20" : "bg-indigo-600 text-white shadow-indigo-600/40 ring-4 ring-indigo-600/20")
                : "bg-white/90 text-slate-600 hover:bg-white hover:text-indigo-600 border border-slate-200/50"
        )}
    >
        <div className="z-10">{children}</div>

        {/* Tooltip */}
        <div className="absolute right-full mr-4 px-3 py-1.5 bg-slate-900/90 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap backdrop-blur-md">
            {label}
        </div>
    </button>
);

const ScreenControls = ({ targetId }: { targetId: string }) => {
    const [isPortrait, setIsPortrait] = useAtom(isPortraitModeAtom);
    const { isRecording, startRecording, stopRecording } = useScreenRecorder();

    // Device detection: Hide on mobile/tablets
    const isMobile = typeof window !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isMobile) return null;

    const handleRecordClick = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording(targetId);
        }
    };

    return (
        <div className="fixed bottom-8 right-8 z-50 flex flex-col gap-5 items-end">

            {/* Elegant Recording Status */}
            {isRecording && (
                <div className="flex items-center gap-3 bg-slate-900/80 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/10 shadow-2xl animate-in fade-in slide-in-from-right-4">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                    <span className="text-white text-[10px] font-black tracking-widest leading-none">RECORDING</span>
                </div>
            )}

            <div className="flex flex-col gap-4">
                <ControlButton
                    onClick={() => setIsPortrait(!isPortrait)}
                    active={isPortrait}
                    label={isPortrait ? "切换至桌面横屏" : "切换至手机竖屏"}
                >
                    {isPortrait ? <LandscapeIcon /> : <PortraitIcon />}
                </ControlButton>

                <ControlButton
                    onClick={handleRecordClick}
                    active={isRecording}
                    danger={true}
                    label={isRecording ? "停止大片录制" : "开启 4K 画质录制"}
                >
                    {isRecording ? <StopIcon /> : <RecordIcon />}
                </ControlButton>
            </div>
        </div>
    );
};

export default ScreenControls;
