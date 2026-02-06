import { Skill, SkillContext } from '../types';
import { Player, Role, GamePhase, ROLE_INFO, PlayerStatus, PHASE_LABELS } from '../../../types';

const SYSTEM_PROMPT = "You are a master strategist playing the game of Werewolf. Your goal is to win for your team.";

const INSTRUCTION_TEMPLATE = `
#### CURRENT GAME STATE
{gameState}

#### HISTORY / LOGS
{history}

#### YOUR ROLE
{roleInfo}

#### TASK
{task}

#### CONSTRAINTS
- Output strictly in JSON format.
{additionalConstraints}
`.trim();

const GAME_RULES = `
1. **胜负条件**：
   - **狼人胜利**：屠边（杀光所有村民 OR 杀光所有神职）。
   - **好人胜利**：放逐所有狼人。
2. **角色技能**：
   - **预言家**：每晚查验一人身份。
   - **女巫**：一瓶解药（救人）和一瓶毒药（杀人）。全场各用一次。同晚不能双药。
   - **猎人**：死亡时（除被毒）可开枪带走一人。
   - **守卫**：每晚守护一人。不可连续两晚守同一人。
3. **夜间结算**：守卫 > 女巫 > 狼人。同守同救 = 奶穿（死）。
`.trim();

export class WerewolfSkill implements Skill {
    id = 'werewolf_core';
    name = 'Werewolf Game Core';
    description = 'Standard Werewolf game logic and role-playing engine.';

    async generatePrompts(player: Player, context: SkillContext, instruction?: string): Promise<{ role: string; content: string }[]> {
        const { phase, roleConfigStr, alivePlayers = [] } = context;

        // 1. Build Game State Section
        const gameState = this.buildGameState(context, alivePlayers, roleConfigStr);

        // 2. Build History Section
        const history = this.buildHistory(player, context);

        // 3. Build Role Info
        const roleInfo = this.buildRoleInfo(player);

        // 4. Determine Task & Constraints
        const { task, constraints } = this.getPhaseInstruction(player, context, instruction);

        // 5. Assemble User Prompt
        const userPrompt = INSTRUCTION_TEMPLATE
            .replace('{gameState}', gameState)
            .replace('{history}', history)
            .replace('{roleInfo}', roleInfo)
            .replace('{task}', task)
            .replace('{additionalConstraints}', constraints);

        return [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
        ];
    }

    // --- Core Builders ---

    private buildGameState(context: SkillContext, alivePlayers: Player[], roleConfigStr: string): string {
        const { phase } = context;
        const aliveList = alivePlayers.map(p => `${p.id} 号`).join('、');

        return `
- Phase: ${PHASE_LABELS[phase]}
- Config: ${roleConfigStr}
- Rules:
${GAME_RULES}
- Alive Players: [${aliveList}]
`.trim();
    }

    private buildHistory(player: Player, context: SkillContext): string {
        const { logs, turnCount, currentTurnLogs = [] } = context;

        // 1. Current Turn Transcript (Most important)
        const currentTranscript = currentTurnLogs.length > 0
            ? currentTurnLogs.map(l => l.isSystem ? `[SYSTEM]: ${l.content}` : `[Player ${l.speakerId}]: ${l.content}`).join('\n')
            : "(No speeches yet)";

        // 2. Private Memory (for special roles)
        let privateMemory = "";

        if (player.role === Role.SEER) {
            const checks = logs.filter(l => l.phase === GamePhase.SEER_ACTION && l.turn < turnCount && l.isSystem && l.visibleTo?.includes(player.id));
            if (checks.length) privateMemory += "\n[Your Past Checks]:\n" + checks.map(l => l.content).join('\n');
        }

        if (player.role === Role.WITCH) {
            const history = logs.filter(l => l.phase === GamePhase.WITCH_ACTION && l.turn < turnCount && l.isSystem && l.visibleTo?.includes(player.id));
            if (history.length) privateMemory += "\n[Your Past Actions]:\n" + history.map(l => l.content).join('\n');
        }

        if (player.role === Role.WEREWOLF) {
            const history = logs.filter(l => l.phase === GamePhase.WEREWOLF_ACTION && l.turn < turnCount && !l.isSystem && l.visibleTo?.includes(player.id));
            if (history.length) privateMemory += "\n[Past Night Chats]:\n" + history.map(l => `Turn ${l.turn}: ${l.content}`).join('\n');
        }

        return `
### Current Transcript
${currentTranscript}

### Private Memory
${privateMemory || "None"}
`.trim();
    }

    private buildRoleInfo(player: Player): string {
        return `You are Player ${player.id}. Role: ${ROLE_INFO[player.role].label} (${player.role}).`;
    }

    private getPhaseInstruction(player: Player, context: SkillContext, instruction?: string): { task: string, constraints: string } {
        const { phase, godState, players, alivePlayers = [] } = context;

        // --- 1. Wolf Night ---
        if (phase === GamePhase.WEREWOLF_ACTION && player.role === Role.WEREWOLF) {
            const teammates = players.filter(p => p.role === Role.WEREWOLF && p.id !== player.id);
            const teammateStr = teammates.map(p => `${p.id}(${p.status})`).join(', ') || "None";

            return {
                task: `Discuss with teammates to choose a kill target. Teammates: ${teammateStr}. ${instruction || "Speak now."}`,
                constraints: `- JSON Schema: { "thought": "strategy", "speak": "message to teammates" }`
            };
        }

        // --- 2. Seer ---
        if (phase === GamePhase.SEER_ACTION && player.role === Role.SEER) {
            return {
                task: "Choose one player to inspect.",
                constraints: `- JSON Schema: { "thought": "reasoning", "actionTarget": number, "speak": "internal monologue (short)" }`
            };
        }

        // --- 3. Witch ---
        if (phase === GamePhase.WITCH_ACTION && player.role === Role.WITCH) {
            const dyingId = godState?.wolfTarget;
            const info = dyingId ? `Player ${dyingId} was attacked.` : "No one was attacked.";
            const potions = `Cure: ${player.potions?.cure ? 'YES' : 'NO'}, Poison: ${player.potions?.poison ? 'YES' : 'NO'}`;

            return {
                task: `Decide potion usage. ${info}. ${potions}.`,
                constraints: `- JSON Schema: { "thought": "reasoning", "useCure": boolean, "poisonTarget": number | null, "speak": "internal monologue" }`
            };
        }

        // --- 4. Hunter ---
        if (phase === GamePhase.HUNTER_ACTION && player.role === Role.HUNTER) {
            return {
                task: "You died. Choose a player to shoot, or pass.",
                constraints: `- JSON Schema: { "thought": "reasoning", "speak": "last words", "actionTarget": number | null }`
            };
        }

        // --- 5. Voting ---
        if (phase === GamePhase.VOTING) {
            const targets = alivePlayers.map(p => p.id).join(', ');
            return {
                task: `Vote for a player to exile. Valid targets: [${targets}].`,
                constraints: `- JSON Schema: { "thought": "reasoning", "speak": "vote reason", "actionTarget": number }`
            };
        }

        // --- 6. Day Discussion ---
        if (phase === GamePhase.DAY_DISCUSSION || phase === GamePhase.LAST_WORDS || phase === GamePhase.DAY_ANNOUNCE) {
            // Wolf Special Vision
            let wolfInfo = "";
            if (player.role === Role.WEREWOLF && godState?.wolfTarget) {
                const target = players.find(p => p.id === godState.wolfTarget);
                wolfInfo = `[Secret] Last night you attacked ${godState.wolfTarget}. Result: ${target?.status === PlayerStatus.ALIVE ? 'Saved (Peace Night)' : 'Dead'}.`;
            }

            return {
                task: `Analyze the situation and speak to persuade others. ${wolfInfo} ${instruction || "Speak now."}`,
                constraints: `- JSON Schema: { "thought": "strategy", "speak": "public message" }`
            };
        }

        // Fallback
        return {
            task: "Wait for instructions.",
            constraints: "- Output NO_OP."
        };
    }
}

// Utility to match original logic (if needed by other files, typically not exported but good to keep if used elsewhere check)
function validTargets(players: Player[]) {
    return players.map(p => p.id);
}
