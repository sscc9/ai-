
import React from 'react';
import { useAtom } from 'jotai';
import { clsx } from 'clsx';
import { isPortraitModeAtom } from '../atoms';
import { useScreenRecorder } from '../hooks/useScreenRecorder';

// Reusable Button Component for consistency
const ControlButton = ({ onClick, active, icon, label, danger = false }: { onClick: () => void, active?: boolean, icon: string, label: string, danger?: boolean }) => (
    <button
        onClick={onClick}
        className={clsx(
            "flex flex-col items-center justify-center w-12 h-12 rounded-full shadow-lg backdrop-blur-md transition-all duration-300 transform hover:scale-105 active:scale-95",
            active
                ? (danger ? "bg-red-500/90 text-white shadow-red-500/30 animate-pulse" : "bg-indigo-500/90 text-white shadow-indigo-500/30")
                : "bg-white/80 text-slate-700 hover:bg-white border border-slate-200"
        )}
        title={label}
    >
        <span className="text-xl">{icon}</span>
    </button>
);

const ScreenControls = ({ targetId }: { targetId: string }) => {
    const [isPortrait, setIsPortrait] = useAtom(isPortraitModeAtom);
    const { isRecording, startRecording, stopRecording } = useScreenRecorder();

    const handleRecordClick = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording(targetId);
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-4 items-end pointer-events-auto">

            {/* Recording Indicator */}
            {isRecording && (
                <div className="bg-red-500/90 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg animate-pulse flex items-center gap-2 backdrop-blur-sm">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                    REC
                </div>
            )}

            {/* Controls Group */}
            <div className="flex flex-col gap-3">
                <ControlButton
                    onClick={() => setIsPortrait(!isPortrait)}
                    active={isPortrait}
                    icon={isPortrait ? "📱" : "💻"}
                    label={isPortrait ? "切换横屏" : "切换竖屏"}
                />

                <ControlButton
                    onClick={handleRecordClick}
                    active={isRecording}
                    danger={true}
                    icon={isRecording ? "⏹️" : "⏺️"}
                    label={isRecording ? "停止录制" : "开始录制"}
                />
            </div>
        </div>
    );
};

export default ScreenControls;
