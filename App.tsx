
import React from 'react';
import { useAtomValue } from 'jotai';
import { appScreenAtom } from './store';

import HomeView from './components/HomeView';
import GameRoomView from './components/GameRoomView';
import SettingsView from './components/SettingsView';
import AgentView from './components/AgentView';
import HistoryView from './components/HistoryView';

const App = () => {
    const screen = useAtomValue(appScreenAtom);

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
        default:
            return <HomeView />;
    }
};

export default App;
