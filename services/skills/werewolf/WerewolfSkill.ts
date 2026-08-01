import { Skill, SkillContext } from '../types';
import { Player, Role, GamePhase, ROLE_INFO, PlayerStatus, PHASE_LABELS, DEFAULT_ROLE_PROMPTS } from '../../../types';

const SYSTEM_PROMPT = `你是一位顶尖的线上狼人杀竞技选手，拥有数千局实战经验。你的唯一目标是带领你的阵营（团队）获得胜利，个人生存是次要的。

## 核心思维原则

**信息差意识**：时刻清楚——你知道什么、别人知道什么、你能利用什么信息差。狼人杀的本质就是信息不对称博弈。

**说服意识**：其他玩家看不到你看到的信息，所以**你说什么别人都不会自动相信**。无论你声称自己是什么身份、怀疑谁是狼人、还是为谁担保，都需要用逻辑和证据去主动说服别人接受你的说法。不要默认"我说了别人就该信"——你的目标是把别人从"不知道/不确定"变成"被你说服"。

**证据链推理**：你的一切怀疑和信任必须基于具体的行为证据，绝不凭空臆测：
- 发言内容是否前后矛盾
- 投票行为是否异常（跟票/反水/关键弃票）
- 站队关系是否反常（好人为什么保狼？狼人为什么踩队友？）
- 身份声明是否有冲突（两人跳同一身份）

**博弈思维**：每次发言前考虑——"如果我这么说，各个阵营会怎么反应？这对我的阵营有利还是有害？"

**节奏感**：知道什么时候该强势输出占据话语权，什么时候该低调苟住不暴露身份。局势好时扩大优势，局势差时止损求稳。

**对手建模**：根据每个人的发言风格、投票模式和站队倾向，持续更新你对每个玩家身份的判断。

## 线上游戏特别提醒
这是一局**线上文字狼人杀**，没有表情、语气、肢体语言可以参考。你的所有判断只能基于：发言文字内容、投票行为、站队关系。严禁编造"语气紧张""表情可疑"等线下信息。`.trim();

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

        let systemPromptContent = SYSTEM_PROMPT;
        const { enabledCustomPrompts, customRolePrompts } = context;
        if (enabledCustomPrompts) {
            const customVal = customRolePrompts?.[player.role];
            if (customVal && customVal.trim()) {
                systemPromptContent += `\n\n### 你的特殊角色策略与行事准则（核心底牌设定）\n${customVal}`;
            } else {
                systemPromptContent += `\n\n### 你的特殊角色策略与行事准则（核心底牌设定）\n${DEFAULT_ROLE_PROMPTS[player.role] || ''}`;
            }
        }

        return [
            { role: 'system', content: systemPromptContent },
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
                    let summary = l.summary;
                    if (!summary) {
                        if (l.content.length <= 40) {
                            summary = l.content;
                        } else {
                            const keyPattern = /(预言家|女巫|猎人|守卫|狼人|查杀|金水|银水|跳神|跳女巫|跳预言家|跳猎人|跳守卫|警长|警徽)/;
                            if (keyPattern.test(l.content)) {
                                summary = l.content.length > 100 ? l.content.slice(0, 100) + '...' : l.content;
                            } else {
                                summary = l.content.slice(0, 30) + '...';
                            }
                        }
                    }
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
            const { godState } = context;
            const wolfSummaries = godState?.wolfNightSummaries || {};
            const history = logs.filter(l => l.phase === GamePhase.WEREWOLF_ACTION && l.turn <= turnCount && !l.isSystem && l.visibleTo?.includes(player.id));
            if (history.length) {
                // Group by night (turn)
                const nightMap = new Map<number, typeof history>();
                history.forEach(l => {
                    if (!nightMap.has(l.turn)) nightMap.set(l.turn, []);
                    nightMap.get(l.turn)!.push(l);
                });
                const nightLines = Array.from(nightMap.entries())
                    .sort(([a], [b]) => a - b)
                    .map(([turn, nightLogs]) => {
                        // Use LLM summary if available (generated in background)
                        if (wolfSummaries[turn]) {
                            return `第${turn}晚: ${wolfSummaries[turn]}`;
                        }
                        // Current night or summary not ready yet: show full text
                        return `第${turn}晚: ${nightLogs.map(l => `${l.speakerId}号:${l.content}`).join('；')}`;
                    });
                privateMemory += "\n[狼人夜间讨论记忆]:\n" + nightLines.join('\n');
            }
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
                constraints: `- 输出 JSON 格式。
- 格式: { "speak": "对队友说的话（私聊内容）" }
- 示例 (普通讨论): { "speak": "3号听起来挺像神的，你们怎么看？" }
- 示例 (若收到最终决策指令): { "speak": "听我的，今晚刀3号。", "actionTarget": 3 }`
            };
        }

        // --- 2. Seer ---
        if (phase === GamePhase.SEER_ACTION && player.role === Role.SEER) {
            return {
                task: "选择一名你今晚想要查验身份的玩家号码。",
                constraints: `- 输出 JSON 格式。
- 格式: { "actionTarget": 查验的玩家号码(数字), "speak": "内心独白（简短）" }
- 示例: { "actionTarget": 2, "speak": "验2号看底牌。" }`
            };
        }

        // --- 3. Witch ---
        if (phase === GamePhase.WITCH_ACTION && player.role === Role.WITCH) {
            const dyingId = godState?.wolfTarget;
            const info = dyingId ? `${dyingId}号 玩家被袭击` : "无人被袭击";
            const potions = `解药: ${player.potions?.cure ? '有' : '无'}, 毒药: ${player.potions?.poison ? '有' : '无'}`;

            return {
                task: `决定今晚是否使用解药或毒药。昨晚：${info}。你当前的药水情况：${potions}。`,
                constraints: `- 输出 JSON 格式。
- 格式: { "useCure": 是否使用解药救被袭击的人(布尔值，true或false), "poisonTarget": 使用毒药的目标玩家号码(数字，不用毒药填null), "speak": "内心独白（简短）" }
- 示例 (使用解药): { "useCure": true, "poisonTarget": null, "speak": "开药救4号。" }`
            };
        }

        // --- 4. Hunter ---
        if (phase === GamePhase.HUNTER_ACTION && player.role === Role.HUNTER) {
            return {
                task: "你已经出局。选择一名存活玩家开枪带走，或者选择放弃开枪（压枪）。",
                constraints: `- 输出 JSON 格式。
- 格式: { "speak": "你的最后遗言", "actionTarget": 射击的目标玩家号码(数字，放弃开枪填null) }
- 示例: { "speak": "我是猎人，8号你个狼人给我下去吧！", "actionTarget": 8 }`
            };
        }

        // --- 5. Guard ---
        if (phase === GamePhase.GUARD_ACTION && player.role === Role.GUARD) {
            const lastProtected = godState?.lastGuardProtect;
            const lastInfo = lastProtected ? `昨晚你守护了 ${lastProtected}号 玩家。今晚你绝对不能重复守护他。` : "昨晚你没有守护任何人。";
            const targets = alivePlayers.filter(p => p.id !== lastProtected).map(p => p.id).join('、');

            return {
                task: `选择今晚你要守护免受狼人袭击的玩家。${lastInfo} 可选目标：[${targets}]。`,
                constraints: `- 输出 JSON 格式。
- 格式: { "actionTarget": 守护的玩家号码(数字), "speak": "内心独白（简短）" }
- 示例: { "actionTarget": 6, "speak": "尽力保住预言家。" }`
            };
        }

        // --- 6. Voting ---
        if (phase === GamePhase.VOTING) {
            const targets = alivePlayers.map(p => p.id).join('、');
            return {
                task: `投票放逐一名玩家。可选目标：[${targets}]。`,
                constraints: `- 输出 JSON 格式。
- 格式: { "speak": "投票理由（白天公开宣布）", "actionTarget": 投票目标玩家号码(数字) }
- 示例: { "speak": "我这一票投给4号，认为他发言不好。", "actionTarget": 4 }`
            };
        }

        // --- 7. Sheriff Election (Run / Speak) ---
        if (phase === GamePhase.SHERIFF_ELECT) {
            const isCandidate = godState?.sheriffCandidates?.includes(player.id);
            if (isCandidate) {
                return {
                    task: "你目前正在竞选警长。你的核心目标是**让其他玩家相信你、信任你**，从而把警长票投给你。注意：别人不会因为你说了什么身份就自动相信你，你需要用逻辑和证据主动说服他们。你也可以选择“退水”退出竞选。",
                    constraints: `- 输出 JSON 格式。
- 格式: { "speak": "竞选演讲内容", "quitCampaign": 是否退水(退出竞选)(布尔值，true或false), "summary": "15字以内的发言核心要诀" }
- 示例: { "speak": "我是预言家，警徽交给我带领发言。", "quitCampaign": false, "summary": "预言家起跳拿警徽" }`
                };
            } else {
                return {
                    task: "警长竞选阶段：决定你是否要竞选警长（上警）。上警可以获得发言权和争夺警长（警徽的1.5票权）；留在警下可以拥有投票选举警长的权力。",
                    constraints: `- 输出 JSON 格式。
- 格式: { "runForSheriff": 是否参加竞选(布尔值，true或false) }
- 示例: { "runForSheriff": false }`
                };
            }
        }

        // --- 8. Sheriff Voting ---
        if (phase === GamePhase.SHERIFF_VOTE) {
            const candidates = godState?.sheriffCandidates?.filter(c => !godState?.sheriffQuitters?.includes(c)) || [];
            const candidatesStr = candidates.join('、');
            return {
                task: `警长投票环节：请从以下候选人中投票选出你认为最合适的警长。候选人：[${candidatesStr}]。`,
                constraints: `- 输出 JSON 格式。
- 格式: { "speak": "内心独白（简短）", "actionTarget": 投票目标玩家号码(数字，弃票填null) }
- 示例: { "speak": "投5号。", "actionTarget": 5 }`
            };
        }

        // --- 9. Sheriff Badge Transfer ---
        if (phase === GamePhase.SHERIFF_TRANS) {
            const targets = alivePlayers.filter(p => p.id !== player.id).map(p => p.id).join('、');
            return {
                task: `你出局了。作为警长，你必须移交你的警徽给一位存活的好人玩家，或者选择撕毁警徽（本局不再有警长）。可选交割目标：[${targets}]。`,
                constraints: `- 输出 JSON 格式。
- 格式: { "speak": "交代警徽交割或撕毁的遗言", "actionTarget": 交割目标玩家号码(数字，撕毁警徽填null) }
- 示例: { "speak": "警徽移交给9号，大家跟着他走。", "actionTarget": 9 }`
            };
        }

        // --- 10. Day Discussion ---
        if (phase === GamePhase.DAY_DISCUSSION || phase === GamePhase.LAST_WORDS || phase === GamePhase.DAY_ANNOUNCE) {
            // Check if this is the Sheriff choosing direction
            if (instruction && instruction.includes("发言方向")) {
                return {
                    task: instruction,
                    constraints: `- 输出 JSON 格式: { "direction": "选择方向：填'LEFT'(顺时针)或'RIGHT'(逆时针)" }`
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
- **逻辑约束**：怀疑某人时必须给出至少一个具体证据（发言矛盾/投票异常/站队反常），不允许凭空指控。
- **关注重点**：谁在踩谁、谁在保谁（站队关系）；有没有人跳了相同身份（身份冲突）；投票记录是否和发言立场一致。
- 发言要口语化，像真人在玩狼人杀，可以使用专业黑话（金水、查杀、脱衣服、聊爆等）。
- 如果没有新线索，发言务必言简意赅（如"同意前人发言，过"或"村民过"），避免冗长废话。
- 输出 JSON 格式。
- 格式: { "speak": "你的公开演讲/发言内容", "summary": "15字以内的发言要点总结，例如：起跳预言家验3号好人" }
- 示例: { "speak": "2号无缘无故踩我，逻辑很不正常，我是一个铁平民。", "summary": "为自己辩解并怀疑2号" }`
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
