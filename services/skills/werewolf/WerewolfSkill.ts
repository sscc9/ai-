import { Skill, SkillContext } from '../types';
import { Player, Role, GamePhase, ROLE_INFO, PlayerStatus, PHASE_LABELS } from '../../../types';

const SYSTEM_PROMPT = "你是一位精通狼人杀的游戏大师和策略家。你的唯一目标是带领你的阵营（团队）获得胜利。个人的生存是次要的，团队的胜利高于一切。";

const INSTRUCTION_TEMPLATE = `
#### 当前游戏状态
{gameState}

#### 游戏历史与记忆
{history}

#### 你的身份
{roleInfo}

#### 当前任务
{task}

#### 规则与约束
- 必须严格输出 JSON 格式，不要包含任何 markdown 块标记或多余文字。
- **发言语言**：\`speak\` 字段必须使用自然、地道的简体中文口语。你可以使用狼人杀术语（如：悍跳、查杀、金水、银水、倒牌、表水、拍身份等）来使发言更像真人。
- **避免重复**：仔细阅读历史发言。如果你的逻辑或怀疑对象已经被前面的玩家说过了，请不要复述！你可以简单表示同意/反对，或者提出新的独特视角。
{constraints}
`.trim();

const GAME_RULES = `
- 狼人阵营：击杀所有村民 或 所有神职人员。
- 预言家：每晚可以查验一名玩家的身份（好人或狼人）。
- 女巫：拥有一瓶解药和一瓶毒药，每种药水每局只能使用一次。
- 猎人：出局时（被毒杀除外）可以开枪带走一名玩家。
- 守卫：每晚可以守护一名玩家免受狼人袭击，不能连续两晚守护同一个人。
- 结算优先级：守卫守护 > 女巫解药救人 > 狼人击杀。（若守卫与女巫同守同救，目标玩家会因“药效冲突”死亡）。
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
            .replace('{constraints}', constraints);

        return [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
        ];
    }

    // --- Core Builders ---

    private buildGameState(context: SkillContext, alivePlayers: Player[], roleConfigStr: string): string {
        const { phase } = context;
        const aliveList = alivePlayers.map(p => `${p.id}号`).join('、');

        return `
- 当前阶段: ${PHASE_LABELS[phase]}
- 板子配置: ${roleConfigStr}
- 基础规则:
${GAME_RULES}
- 存活玩家: [${aliveList}]
`.trim();
    }

    private buildHistory(player: Player, context: SkillContext): string {
        const { logs, turnCount, currentTurnLogs = [] } = context;

        // 1. Current Turn Transcript (Most important)
        const currentTranscript = currentTurnLogs.length > 0
            ? currentTurnLogs.map(l => {
                if (l.isSystem) return `[系统公告]: ${l.content}`;
                if (l.turn < turnCount) {
                    const summary = l.summary || (l.content.length > 15 ? l.content.slice(0, 15) + '...' : l.content);
                    return `[${l.speakerId}号玩家 (发言要点)]: ${summary}`;
                }
                return `[${l.speakerId}号玩家]: ${l.content}`;
            }).join('\n')
            : "(当前暂无发言记录)";

        // 2. Private Memory (for special roles)
        let privateMemory = "";

        if (player.role === Role.SEER) {
            const checks = logs.filter(l => l.phase === GamePhase.SEER_ACTION && l.turn < turnCount && l.isSystem && l.visibleTo?.includes(player.id));
            if (checks.length) privateMemory += "\n[你过去的查验记录]:\n" + checks.map(l => l.content).join('\n');
        }

        if (player.role === Role.WITCH) {
            const history = logs.filter(l => l.phase === GamePhase.WITCH_ACTION && l.turn < turnCount && l.isSystem && l.visibleTo?.includes(player.id));
            if (history.length) privateMemory += "\n[你过去的使用药水记录]:\n" + history.map(l => l.content).join('\n');
        }

        if (player.role === Role.WEREWOLF) {
            const history = logs.filter(l => l.phase === GamePhase.WEREWOLF_ACTION && l.turn < turnCount && !l.isSystem && l.visibleTo?.includes(player.id));
            if (history.length) privateMemory += "\n[过去的狼人夜间讨论]:\n" + history.map(l => `第 ${l.turn} 天晚上: ${l.content}`).join('\n');
        }

        return `
### 公共对局记录与发言
${currentTranscript}

### 你的私有记忆
${privateMemory || "无"}
`.trim();
    }

    private buildRoleInfo(player: Player): string {
        return `你是 ${player.id}号 玩家。你的角色是：${ROLE_INFO[player.role].label} (${player.role})。`;
    }

    private getPhaseInstruction(player: Player, context: SkillContext, instruction?: string): { task: string, constraints: string } {
        const { phase, godState, players, alivePlayers = [] } = context;

        // --- 1. Wolf Night ---
        if (phase === GamePhase.WEREWOLF_ACTION && player.role === Role.WEREWOLF) {
            const teammates = players.filter(p => p.role === Role.WEREWOLF && p.id !== player.id);
            const teammateStr = teammates.map(p => `${p.id}号(${p.status === PlayerStatus.ALIVE ? '存活' : '出局'})`).join('、') || "无";

            return {
                task: `与你的狼人队友沟通，选择今晚要袭击的玩家目标。**战术提示**：团队胜利是唯一目标。如果有助于胜利，你可以在白天的发言中踩队友或与队友拉开距离。你的队友是：${teammateStr}。${instruction || "表达你的意图。"}`,
                constraints: `- 输出 JSON 格式: { "thought": "今晚的刀人思路与战术规划（不对外公开）", "speak": "对队友说的话（私聊内容）" }`
            };
        }

        // --- 2. Seer ---
        if (phase === GamePhase.SEER_ACTION && player.role === Role.SEER) {
            return {
                task: "选择一名你今晚想要查验身份的玩家号码。",
                constraints: `- 输出 JSON 格式: { "thought": "选择该玩家查验的逻辑和原因", "actionTarget": 查验的玩家号码(数字), "speak": "内心独白（简短）" }`
            };
        }

        // --- 3. Witch ---
        if (phase === GamePhase.WITCH_ACTION && player.role === Role.WITCH) {
            const dyingId = godState?.wolfTarget;
            const info = dyingId ? `${dyingId}号 玩家被袭击` : "无人被袭击";
            const potions = `解药: ${player.potions?.cure ? '有' : '无'}, 毒药: ${player.potions?.poison ? '有' : '无'}`;

            return {
                task: `决定今晚是否使用解药或毒药。昨晚：${info}。你当前的药水情况：${potions}。`,
                constraints: `- 输出 JSON 格式: { "thought": "使用药水决策的思考与逻辑", "useCure": 是否使用解药救被袭击的人(布尔值，true或false), "poisonTarget": 使用毒药的目标玩家号码(数字，不用毒药填null), "speak": "内心独白（简短）" }`
            };
        }

        // --- 4. Hunter ---
        if (phase === GamePhase.HUNTER_ACTION && player.role === Role.HUNTER) {
            return {
                task: "你已经出局。选择一名存活玩家开枪带走，或者选择放弃开枪（压枪）。",
                constraints: `- 输出 JSON 格式: { "thought": "选择该目标开枪或放弃开枪的原因", "speak": "你的最后遗言", "actionTarget": 射击的目标玩家号码(数字，放弃开枪填null) }`
            };
        }

        // --- 5. Guard ---
        if (phase === GamePhase.GUARD_ACTION && player.role === Role.GUARD) {
            const lastProtected = godState?.lastGuardProtect;
            const lastInfo = lastProtected ? `昨晚你守护了 ${lastProtected}号 玩家。今晚你绝对不能重复守护他。` : "昨晚你没有守护任何人。";
            const targets = alivePlayers.filter(p => p.id !== lastProtected).map(p => p.id).join('、');

            return {
                task: `选择今晚你要守护免受狼人袭击的玩家。${lastInfo} 可选目标：[${targets}]。`,
                constraints: `- 输出 JSON 格式: { "thought": "决定守护该玩家的防御策略和逻辑", "actionTarget": 守护的玩家号码(数字), "speak": "内心独白（简短）" }`
            };
        }

        // --- 6. Voting ---
        if (phase === GamePhase.VOTING) {
            const targets = alivePlayers.map(p => p.id).join('、');
            return {
                task: `投票放逐一名玩家。可选目标：[${targets}]。`,
                constraints: `- 输出 JSON 格式: { "thought": "决定投给该玩家的原因（如：怀疑他是狼人，或是跟随队友归票）", "speak": "投票理由（白天公开宣布）", "actionTarget": 投票目标玩家号码(数字) }`
            };
        }

        // --- 7. Sheriff Election (Run / Speak) ---
        if (phase === GamePhase.SHERIFF_ELECT) {
            const isCandidate = godState?.sheriffCandidates?.includes(player.id);
            if (isCandidate) {
                return {
                    task: "你目前正在竞选警长。发表你的竞选演讲，说服警下玩家把警长票投给你。你可以选择继续竞选，或者选择“退水”退出竞选。",
                    constraints: `- 输出 JSON 格式: { "thought": "竞选策略与逻辑思考", "speak": "竞选演讲内容", "quitCampaign": 是否退水(退出竞选)(布尔值，true或false), "summary": "15字以内的发言核心要诀" }`
                };
            } else {
                return {
                    task: "警长竞选阶段：决定你是否要竞选警长（上警）。上警可以获得发言权和争夺警长（警徽的1.5票权）；留在警下可以拥有投票选举警长的权力。",
                    constraints: `- 输出 JSON 格式: { "thought": "决定是否上警竞选警长的原因", "runForSheriff": 是否参加竞选(布尔值，true或false) }`
                };
            }
        }

        // --- 8. Sheriff Voting ---
        if (phase === GamePhase.SHERIFF_VOTE) {
            const candidates = godState?.sheriffCandidates?.filter(c => !godState?.sheriffQuitters?.includes(c)) || [];
            const candidatesStr = candidates.join('、');
            return {
                task: `警长投票环节：请从以下候选人中投票选出你认为最合适的警长。候选人：[${candidatesStr}]。`,
                constraints: `- 输出 JSON 格式: { "thought": "选择把警徽投给该候选人的逻辑与考量", "speak": "内心独白（简短）", "actionTarget": 投票目标玩家号码(数字，弃票填null) }`
            };
        }

        // --- 9. Sheriff Badge Transfer ---
        if (phase === GamePhase.SHERIFF_TRANS) {
            const targets = alivePlayers.filter(p => p.id !== player.id).map(p => p.id).join('、');
            return {
                task: `你出局了。作为警长，你必须移交你的警徽给一位存活的好人玩家，或者选择撕毁警徽（本局不再有警长）。可选交割目标：[${targets}]。`,
                constraints: `- 输出 JSON 格式: { "thought": "决定交割给该玩家的战术考量", "speak": "交代警徽交割或撕毁的遗言", "actionTarget": 交割目标玩家号码(数字，撕毁警徽填null) }`
            };
        }

        // --- 10. Day Discussion ---
        if (phase === GamePhase.DAY_DISCUSSION || phase === GamePhase.LAST_WORDS || phase === GamePhase.DAY_ANNOUNCE) {
            // Check if this is the Sheriff choosing direction
            if (instruction && instruction.includes("发言方向")) {
                return {
                    task: instruction,
                    constraints: `- 输出 JSON 格式: { "thought": "选择发言方向的逻辑（例如让怀疑对象先发言以抓漏洞）", "direction": "选择方向：填'LEFT'(顺时针)或'RIGHT'(逆时针)" }`
                };
            }

            // Wolf Special Vision
            let wolfInfo = "";
            if (player.role === Role.WEREWOLF && godState?.wolfTarget) {
                const target = players.find(p => p.id === godState.wolfTarget);
                wolfInfo = `[狼人视角私密信息] 昨晚你们袭击了 ${godState.wolfTarget}号。袭击结果: ${target?.status === PlayerStatus.ALIVE ? '被救活（平安夜）' : '已死亡'}。`;
            }

            return {
                task: `组织白天的发言，**说服**其他玩家信任你，或者跟随你投票。${wolfInfo} ${instruction || "请开始你的发言。"}`,
                constraints: `- **主要目标**：极力争取好人信任你的身份，或者用逻辑引导大家放逐你怀疑的狼人。
- 发言要口语化，像真人在玩狼人杀，可以使用专业黑话（金水、查杀、脱衣服、聊爆等）。
- 如果没有新线索，发言务必言简意赅（如“同意前人发言，过”或“村民过”），避免冗长废话。
- 输出 JSON 格式: { "thought": "当下的局势分析与白天的策略思考", "speak": "你的公开演讲/发言内容", "summary": "15字以内的发言要点总结，例如：起跳预言家验3号好人" }`
            };
        }

        // Fallback
        return {
            task: "等待指令。",
            constraints: "- 输出 NO_OP。"
        };
    }
}

// Utility to match original logic (if needed by other files, typically not exported but good to keep if used elsewhere check)
function validTargets(players: Player[]) {
    return players.map(p => p.id);
}
