
import React, { Suspense } from 'react';
import { useAtomValue } from 'jotai';
import { clsx } from 'clsx';
import { appScreenAtom, isPortraitModeAtom } from './store';

import HomeView from './components/HomeView';
import GameRoomView from './components/GameRoomView';
import SettingsView from './components/SettingsView';
import AgentView from './components/AgentView';
import HistoryView from './components/HistoryView';
import ScreenControls from './components/ScreenControls';
import StateHydrator from './components/StateHydrator';
import TTSView from './components/TTSView';


const App = () => {
    const screen = useAtomValue(appScreenAtom);
    const isPortrait = useAtomValue(isPortraitModeAtom);

    // ID for the container we want to capture
    const APP_CONTENT_ID = "app-content-area";

    const renderContent = () => {
        switch (screen) {
            case 'HOME':
                return <HomeView />;
            case 'GAME':
                return <GameRoomView />;
            case 'SETTINGS':
                return <SettingsView />;
            case 'AGENT':
                return <AgentView />;
            case 'HISTORY':
                return <HistoryView />;
            case 'TTS':
                return <TTSView />;
            default:
                return <HomeView />;
        }
    };

    return (
        <React.Fragment>
            {/* Outer Container controlling the background layout */}
            <div className={clsx(
                "w-full h-full transition-all duration-500 ease-in-out scrollbar-hide",
                isPortrait
                    ? "fixed inset-0 bg-black flex items-center justify-center" // Clean black background for video focus
                    : "" // Normal Fullscreen
            )}>
                {/* 
                    Target Container for Recording 
                    This is what we crop to. 
                    In Portrait Mode: Pure 9:16 video ratio, no borders, no padding.
                */}
                <div
                    id={APP_CONTENT_ID}
                    className={clsx(
                        "relative highlight-white/5 transition-all duration-500",
                        isPortrait
                            ? "h-full max-h-full w-auto max-w-full aspect-[9/16] shadow-2xl mx-auto overflow-hidden"
                            : "w-full h-full min-h-screen sm:min-h-full"
                    )}
                >
                    {renderContent()}
                </div>
            </div>

            {/* Force hydration of persistent atoms */}
            <Suspense fallback={null}>
                <StateHydrator />
            </Suspense>

            {/* Global Controls - Outside the recorded area */}
            <ScreenControls targetId={APP_CONTENT_ID} />
        </React.Fragment>
    );
};

export default App;
