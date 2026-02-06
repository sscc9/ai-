import { Player, PlayerStatus, GamePhase, Role, GameLog } from '../../types';

export interface SkillContext {
    phase: GamePhase;
    turnCount: number;
    players: Player[];
    logs: GameLog[];
    // Simplified Global Config (only what's needed for prompts)
    roleConfigStr: string;

    // Dynamic God State (optional, for specific phases)
    godState?: any;

    // Derived Data (Engine helper results)
    currentTurnLogs?: GameLog[];
    alivePlayers?: Player[];
}

export interface Skill {
    id: string;
    name: string;
    description: string;

    /**
     * Generates the prompt messages (System + User) for the LLM.
     */
    generatePrompts(player: Player, context: SkillContext, instruction?: string): Promise<{ role: string; content: string }[]>;
}
