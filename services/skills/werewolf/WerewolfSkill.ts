import { Skill, SkillContext } from '../types';
import { Player, Role, GamePhase, ROLE_INFO, PlayerStatus, PHASE_LABELS } from '../../../types';

const GAME_RULES = `
# 游戏规则核心 (CORE RULES)
1. **胜负条件**：
   - **狼人胜利**：屠边（杀光所有村民 OR 杀光所有神职）。
   - **好人胜利**：放逐所有狼人。
2. **角色技能**：
   - **预言家**：每晚查验一人身份（也就是他是好人还是狼人）。
   - **女巫**：有一瓶解药（救人）和一瓶毒药（杀人）。全场游戏各只能用一次。同一个晚上不能同时双药。
   - **猎人**：死亡时（被刀或被投，被毒除外）可开枪带走一人。
   - **守卫**：每晚守护一人免受狼刀。不可连续两晚守同一人。
3. **夜间结算优先级**：守卫守护 > 女巫解药 > 狼人刀。
   - 同守同救 = 奶穿（死亡）。
`.trim();

export class WerewolfSkill implements Skill {
    id = 'werewolf_core';
    name = 'Werewolf Game Core';
    description = 'Standard Werewolf game logic and role-playing engine.';

    async generatePrompts(player: Player, context: SkillContext, instruction?: string): Promise<{ role: string; content: string }[]> {
        const { phase, players, logs, turnCount, roleConfigStr, godState, alivePlayers = [], currentTurnLogs = [] } = context;

        // 1. Base System Prompt (Persona & Rules)
        const systemPrompt = this.buildSystemPrompt(player, alivePlayers, roleConfigStr);

        // 2. Assemble Context (Public & Private)
        let userPrompt = "";

        // --- COMMON CONTEXT ---
        const aliveList = alivePlayers.map(p => `${p.id}号`).join(', ');
        const currentTurnText = currentTurnLogs.map(l => l.isSystem ? `[系统]: ${l.content}` : `[${l.speakerId}号]: ${l.content}`).join('\n');

        // --- SPECIFIC PHASE LOGIC ---

        // A. Night Actions (Wolf, Seer, Witch)
        if (phase === GamePhase.WEREWOLF_ACTION && player.role === Role.WEREWOLF) {
            userPrompt = this.buildWolfNightPrompt(player, context, instruction);
        }
        else if (phase === GamePhase.SEER_ACTION && player.role === Role.SEER) {
            userPrompt = this.buildSeerPrompt(player, context);
        }
        else if (phase === GamePhase.WITCH_ACTION && player.role === Role.WITCH) {
            userPrompt = this.buildWitchPrompt(player, context, godState);
        }
        else if (phase === GamePhase.HUNTER_ACTION && player.role === Role.HUNTER) {
            userPrompt = this.buildHunterPrompt(player, context, instruction);
        }
        else if (phase === GamePhase.VOTING) {
            userPrompt = this.buildVotingPrompt(player, context, validTargets(alivePlayers));
        }
        // B. Day Discussion
        else if (phase === GamePhase.DAY_DISCUSSION || phase === GamePhase.LAST_WORDS || phase === GamePhase.DAY_ANNOUNCE) {
            userPrompt = this.buildDayDiscussionPrompt(player, context, instruction, aliveList, currentTurnText);
        }
        else {
            // Fallback
            userPrompt = `当前阶段：${PHASE_LABELS[phase]}。\n${instruction || "请等待指令。"}`;
        }

        return [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];
    }

    // --- Private Builders ---

    private buildSystemPrompt(player: Player, alivePlayers: Player[], roleConfigStr: string): string {
        return `
# 核心指令 (CORE DIRECTIVE)
你是一名精通“狼人杀”的高级博弈玩家。
* **你的身份：** ${player.id} 号玩家
* **你的底牌：** 【${ROLE_INFO[player.role].label}】
* **板子配置：** ${roleConfigStr}
* **当前存活：** ${alivePlayers.map(p => `${p.id}号`).join('、')}
* **游戏规则：** 本局为【无警长/无警徽】模式。没有竞选警长环节，也没有警徽流。

${GAME_RULES}

# 终极目标 (OBJECTIVE)
${player.role === Role.WEREWOLF
                ? `**【屠边获胜】**：你的终极目标是消灭所有【平民】或所有【神职】（预言家、女巫、猎人、守卫）。只要其中一个阵营全灭，狼人即获胜。你需要在白天伪装身份、混淆视听，并在晚上精准出刀，打击对方的关键人物。`
                : `**【放逐狼人】**：你的终极目标是找出并出局场上所有的狼人。你需要通过逻辑分析、观察发言细节，并保护好同伴（特别是关键神职），将狼人一一投票放逐。只有狼人全灭，好人方可获胜。`
            }

# 高级博弈思维 (ADVANCED LOGIC)
1. **心智理论 (Theory of Mind)**: 
   - 你拥有**私有信息**（如夜间行动、你的具体身份）。**其他玩家不知道这些信息，除非你说出来。你需要在合适的时候，公开这些信息**。
   - 当你评价其他玩家的行为时，必须**模拟他们的视角**。不要因为他们不知道你掌握的内幕信息而攻击他们逻辑混乱。
   - *例子*：如果你是女巫救了人，预言家去查验了被救的人，预言家是**合乎逻辑**的，因为他不知道那是银水。不要攻击他“查银水”，因为在他视角里那只是个未知身份的玩家。

2. **事实核查 (Fact Verification)**:
   - 绝不轻信他人转述的发言。如果有人攻击某玩家说了X，**必须查看【公聊记录】核实**。
   - 如果公聊记录显示该玩家没说过X，那么攻击者在撒谎或记错了。请基于事实反击。

# 行为准则 (GAMEPLAY RULES)
1.  **极致理性：** 不要情绪化。你的每一次发言、每一次投票都必须是为了推进己方阵营的胜利。
2.  **语言风格：** 简洁、干练、逻辑性强。像一个真实的逻辑流高玩。不要说废话。
3.  **伪装（如果你是狼人）：**
    * 你的目标是最大化“好人面（Villager Probability）”。
    * 不要为了撒谎而撒谎。最高级的谎言是**“90%的真话 + 10%的关键假逻辑”**。
    * 保持逻辑的一致性。一旦你的逻辑前后矛盾，你就会被票出局。

# 输出格式 (OUTPUT FORMAT)
必须输出严格的 JSON。请务必先进行 **思维链 (Chain of Thought)** 推理，再给出最终发言。

{
  "thought": "（你的内心独白/战术思考。这是逻辑推理的地方，例如：'3号刚才聊炸了，我要踩他' 或 '我是预言家，今晚必须验5号'。不要输出给其他玩家看。）",
  "speak": "（最终的公屏发言/对队友说的话。直接展示你的逻辑产物。）",
  "actionTarget": null (仅在投票/行动阶段填写数字ID)
}
`.trim();
    }

    private buildWolfNightPrompt(player: Player, context: SkillContext, instruction?: string): string {
        const { players, logs, turnCount, phase } = context;

        const allWolves = players.filter(p => p.role === Role.WEREWOLF);
        const teammateStatusStr = allWolves
            .filter(p => p.id !== player.id)
            .map(p => `${p.id}号(${p.status === PlayerStatus.ALIVE ? '存活' : '已出局'})`)
            .join('，');

        let privateContext = `\n[狼人视野] 你的队友状态：${teammateStatusStr || '无 (你是孤狼)'}。`;

        const pastNightLogs = logs.filter(l =>
            l.phase === GamePhase.WEREWOLF_ACTION &&
            l.turn < turnCount &&
            !l.isSystem &&
            (l.visibleTo && l.visibleTo.includes(player.id))
        );

        if (pastNightLogs.length > 0) {
            const nightHistoryStr = pastNightLogs.map(l => `[第${l.turn}夜] ${l.speakerId}号: ${l.content}`).join('\n');
            privateContext += `\n\n### 过往夜晚对话记忆\n${nightHistoryStr}`;
        }

        // Check for nightly kills history (optional, if we want them to remember who they killed)
        // Accessing godState logs logic would be ideal here but logs are sufficient for dialogue.

        return `
**狼人行动阶段**
你是狼人。你的目标是准确刀中关键神职或做高自己身份。请与队友进行战术沟通。
**注意：本次夜间讨论只有一轮发言，每位玩家在本轮只有一次说话机会**。JSON 的 "thought" 是你的战术思考，"speak" 是你对队友说的话。

${privateContext}

${instruction || "请发言。"}
`.trim();
    }

    private buildSeerPrompt(player: Player, context: SkillContext): string {
        const { logs, turnCount } = context;
        let privateContext = "";

        const pastCheckLogs = logs.filter(l =>
            l.phase === GamePhase.SEER_ACTION &&
            l.turn < turnCount &&
            l.isSystem &&
            l.visibleTo?.includes(player.id)
        );

        if (pastCheckLogs.length > 0) {
            const checkHistoryStr = pastCheckLogs.map(l => `[第${l.turn}夜] ${l.content}`).join('\n');
            privateContext += `\n\n### 【关键】过往查验记录\n${checkHistoryStr}`;
        }

        return `
请选择查验对象。**策略**：基于逻辑寻找狼人坑位，或验证关键位置玩家的身份定义。
JSON包含 "thought": "思考过程", "actionTarget": number (目标ID)。
**重要**：在 "speak" 字段中，请用简短的一句话描述你的心理活动（例如："3号发言很划水，我要查查他"），绝不要只输出省略号。
${privateContext}
`.trim();
    }

    private buildWitchPrompt(player: Player, context: SkillContext, godState: any): string {
        const { logs, turnCount } = context;
        let privateContext = "";

        if (player.potions) {
            privateContext += `\n[身份信息] 剩余药水：解药=${player.potions.cure ? '有' : '无'}，毒药=${player.potions.poison ? '有' : '无'}。`;
        }

        const pastWitchLogs = logs.filter(l =>
            l.phase === GamePhase.WITCH_ACTION &&
            l.turn < turnCount &&
            l.isSystem &&
            l.visibleTo?.includes(player.id)
        );

        if (pastWitchLogs.length > 0) {
            const witchHistoryStr = pastWitchLogs.map(l => `[第${l.turn}夜] ${l.content}`).join('\n');
            privateContext += `\n\n### 【关键】过往用药记录\n${witchHistoryStr}`;
        }

        const dyingId = godState?.wolfTarget;

        return `
女巫行动。${dyingId ? `${dyingId}号被杀了` : '今晚无人被狼人袭击'}。请基于收益计算（EV）决定是否使用药水。
状态: 解药=${player.potions?.cure}, 毒药=${player.potions?.poison}。
JSON包含 "thought": "思考过程", "useCure": boolean, "poisonTarget": number | null。
**重要**：在 "speak" 字段中，请用简短的一句话描述你的心理活动（例如："这瓶毒药先留着" 或 "今晚必须救人"），绝不要只输出省略号。
${privateContext}
`.trim();
    }

    private buildHunterPrompt(player: Player, context: SkillContext, instruction?: string): string {
        const { alivePlayers = [] } = context;
        const targetIds = alivePlayers.map(p => p.id);

        return `
${instruction || "你出局了，发动猎人技能带走一人。"}
**策略**：带走场上狼面最大的玩家，为好人追回轮次。可选: [${targetIds.join(', ')}]. 如果不想开枪，请将 JSON 中的 "actionTarget" 设为 null。
记得填写 "thought" 字段。
`.trim();
    }

    private buildVotingPrompt(player: Player, context: SkillContext, validTargets: number[]): string {
        const { phase, turnCount, logs, alivePlayers = [] } = context;
        const { currentTurnText } = this.getCommonContext(context);

        // Wolf Dominance Logic
        const aliveWolves = alivePlayers.filter(p => p.role === Role.WEREWOLF).length;
        const aliveGood = alivePlayers.length - aliveWolves;
        let voteOverride = "";
        if (player.role === Role.WEREWOLF && aliveWolves >= aliveGood) {
            voteOverride = `\n【局势提醒】目前狼人控场（${aliveWolves}狼 vs ${aliveGood}好人）。狼人票数已占优。`;
        }

        return `
# 投票阶段 (Voting Phase)
目前存活：${validTargets.join(', ')}。

### 本轮公聊记录 (Transcript)
${currentTurnText || "(暂无发言)"}

${voteOverride}

# 任务指令 (Task)
请做出投票决定。
你需要：
1. **回顾发言**：谁的发言逻辑有漏洞？谁在跟风？
2. **独立判断**：不要盲目跟随前置位，除非他们的逻辑无懈可击。
3. **输出**：必须输出 JSON: { "thought": "推理过程", "speak": "简短投票理由", "actionTarget": 目标ID }
`.trim();
    }


    private buildDayDiscussionPrompt(player: Player, context: SkillContext, instruction: string | undefined, aliveList: string, currentTurnText: string): string {
        const { phase, players, logs, turnCount, godState, alivePlayers = [] } = context;

        let privateContext = '';

        // --- ROLE SPECIFIC MEMORY ---

        // 1. Wolf
        if (player.role === Role.WEREWOLF) {
            const allWolves = players.filter(p => p.role === Role.WEREWOLF);
            const teammateStatusStr = allWolves
                .filter(p => p.id !== player.id)
                .map(p => `${p.id}号(${p.status === PlayerStatus.ALIVE ? '存活' : '已出局'})`)
                .join('，');
            privateContext += `\n[狼人视野] 你的队友状态：${teammateStatusStr || '无 (你是孤狼)'}。`;

            // Last Night Kill Info
            if (phase === GamePhase.DAY_DISCUSSION || phase === GamePhase.DAY_ANNOUNCE) {
                if (godState?.wolfTarget) {
                    const targetId = godState.wolfTarget;
                    const targetPlayer = players.find(p => p.id === targetId);
                    const isTargetAlive = targetPlayer?.status === PlayerStatus.ALIVE;

                    privateContext += `\n[狼人隐秘视野] 昨晚你们袭击了 ${targetId}号。`;
                    privateContext += isTargetAlive
                        ? `\n结果：平安夜（他没死）。好人不知道刀口是 ${targetId}号。`
                        : `\n结果：他死了。`;
                }
            }

            // Dominance
            const aliveWolves = alivePlayers.filter(p => p.role === Role.WEREWOLF).length;
            const aliveGood = alivePlayers.length - aliveWolves;
            if (aliveWolves >= aliveGood) {
                privateContext += `\n【当前局势提醒】目前存活：狼人${aliveWolves}人，好人${aliveGood}人。\n狼人票数已占优。`;
            }
        }

        // 2. Seer
        if (player.role === Role.SEER) {
            const pastCheckLogs = logs.filter(l =>
                l.phase === GamePhase.SEER_ACTION &&
                l.turn < turnCount &&
                l.isSystem &&
                l.visibleTo?.includes(player.id)
            );
            if (pastCheckLogs.length > 0) {
                const checkHistoryStr = pastCheckLogs.map(l => `[第${l.turn}夜] ${l.content}`).join('\n');
                privateContext += `\n\n### 【关键】过往查验记录\n${checkHistoryStr}`;
            }
        }

        // 3. Witch
        if (player.role === Role.WITCH) {
            if (player.potions) {
                privateContext += `\n[身份信息] 剩余药水：解药=${player.potions.cure ? '有' : '无'}，毒药=${player.potions.poison ? '有' : '无'}。`;
            }
            const pastWitchLogs = logs.filter(l =>
                l.phase === GamePhase.WITCH_ACTION &&
                l.turn < turnCount &&
                l.isSystem &&
                l.visibleTo?.includes(player.id)
            );

            if (pastWitchLogs.length > 0) {
                const witchHistoryStr = pastWitchLogs.map(l => `[第${l.turn}夜] ${l.content}`).join('\n');
                privateContext += `\n\n### 【关键】过往用药记录\n${witchHistoryStr}`;
            }
        }

        // Speaking Order Hint
        let speakingOrderStr = "";
        if (phase === GamePhase.DAY_DISCUSSION) {
            speakingOrderStr = "\n【发言规则】当前为按座位号顺序发言。**本次公聊只有一轮发言，每位玩家在本轮只有一次发言机会**。";
        }

        return `
# 公共视野 (Public Information)
游戏阶段：${PHASE_LABELS[phase]}
${speakingOrderStr}
存活玩家：${aliveList}

### 本轮公聊记录 (Transcript)
${currentTurnText || "(暂无发言)"}

# 你的隐秘视野 (Your Private Secret)
${privateContext}
*注意：以上信息只有你（和你的队友）知道。其他玩家并不知情，不要预设他们知道这些。*

# 思考与行动 (Thinking & Action)
${instruction || "分析场上局势，然后发言。目的是为了让你的阵营获胜。"}
`.trim();

    }

    private getCommonContext(context: SkillContext) {
        const { logs, turnCount, alivePlayers = [] } = context;
        const aliveList = alivePlayers.map(p => `${p.id}号`).join(', ');
        const currentTurnLogs = logs.filter(l => l.turn <= turnCount && (!l.visibleTo || l.visibleTo.includes(1))); // Simplification: system logs usually visible or filtered upstream
        const currentTurnText = context.currentTurnLogs?.map(l => l.isSystem ? `[系统]: ${l.content}` : `[${l.speakerId}号]: ${l.content}`).join('\n') || "";
        return { aliveList, currentTurnText };
    }
}

// Utility to match original logic
function validTargets(players: Player[]) {
    return players.map(p => p.id);
}
