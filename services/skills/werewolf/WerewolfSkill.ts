import { Skill, SkillContext } from '../types';
import { Player, Role, GamePhase, ROLE_INFO, PlayerStatus, PHASE_LABELS, DEFAULT_ROLE_PROMPTS } from '../../../types';

const SYSTEM_PROMPT = `你是一位顶尖的线上狼人杀竞技选手。

## 唯一核心目标
- **好人阵营**：唯一目标是【探求事实真相，排查并放逐所有狼人】。
- **狼人阵营**：唯一胜利条件是【消灭所有村民 或 消灭所有神职】。为了最终胜利，队友在必要时完全可以牺牲。个人与队友的存亡都是次要的，屠边胜利是唯一的终点。

## 高阶竞技思维（真相推演体系）
1. **假设推演与阵营收益分析（Payoff & Motive）**：
   面对预言家对跳或核心分歧时，用假设法对比验证，并推敲**行为是否符合该阵营的最大收益**：
   - 假设A（若X为真）：其查验与全场刀口是否符合好人/狼人的利益动机？有没有违背常理收益的死穴？
   - 假设B（若Y为真）：谁在冲锋谁在掩护？全场行为是否符合狼人团队的收益最大化？
   - 对比哪个假设更符合逻辑与博弈收益，坚决站边更自洽的世界。
2. **置信度分层与狼坑闭环**：
   将全场动态划分为【高置信好人（铁金水/银水/自证神）】、【摇摆容错位】与【核心狼坑】。好人必须根据场上总狼数（如9人局3狼/12人局4狼）排出完整狼坑组合，绝不孤立单踩一人。
3. **事实高于一切，严禁形式主义**：
   任何发言价值100%取决于客观事实（死伤、刀口、查验、票型因果）。**绝对禁止**仅凭“发言长短、语气平淡、看似敷衍”给好人扣狼标。
4. **自然说话，严禁报菜名**：
   **严禁在公开发言中说出“双世界推演”、“置信度”等概念术语**！这些是你的内在思考逻辑，发言时要像真人高玩一样自然论证（直接说：“如果X是真的，这完全不符合狼人刀人收益；反之他是狼，一切就顺理成章了”）。
5. **铁证面前凝聚共识**：
   当有人摆出客观铁证（如刀口矛盾、报验冲突）拆穿假预言家时，好人阵营必须正面认同该事实并跟进共识，合力指认狼人。`.trim();


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
- 必须严格输出纯 JSON 格式，不要包含任何 markdown 块标记或多余文字。
- **字数限制**：\`speak\` 字段必须控制在 300 字以内，言之有物，简明扼要。
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
        const customVal = enabledCustomPrompts ? customRolePrompts?.[player.role] : null;
        const rolePrompt = (customVal && customVal.trim()) ? customVal : (DEFAULT_ROLE_PROMPTS[player.role] || '');
        if (rolePrompt) {
            systemPromptContent += `\n\n### 你的特殊角色策略与行事准则（核心底牌设定）\n${rolePrompt}`;
        }

        return [
            { role: 'system', content: systemPromptContent },
            { role: 'user', content: userPrompt }
        ];
    }

    // --- Core Builders ---

    private buildGameState(context: SkillContext, alivePlayers: Player[], roleConfigStr: string): string {
        const { phase, turnCount } = context;
        const aliveList = alivePlayers.map(p => `${p.id}号`).join('、');

        const isNight = [
            GamePhase.NIGHT_START,
            GamePhase.WEREWOLF_ACTION,
            GamePhase.SEER_ACTION,
            GamePhase.WITCH_ACTION,
            GamePhase.GUARD_ACTION
        ].includes(phase);

        // Build timeline: 第1晚 → 第1天 → 第2晚 → 第2天(当前)
        const timelineParts: string[] = [];
        for (let t = 1; t <= turnCount; t++) {
            const nightLabel = `第${t}晚`;
            const dayLabel = `第${t}天`;
            if (t < turnCount) {
                // Past turns: both night and day already happened
                timelineParts.push(nightLabel, dayLabel);
            } else {
                // Current turn
                if (isNight) {
                    timelineParts.push(`${nightLabel}(当前)`);
                } else {
                    timelineParts.push(nightLabel, `${dayLabel}(当前)`);
                }
            }
        }
        const timeline = timelineParts.join(' → ');

        return `
- 时间线: ${timeline}
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
            // Include seer's own night monologue for continuous memory
            const seerNightLogs = logs.filter(l => l.phase === GamePhase.SEER_ACTION && l.turn <= turnCount && !l.isSystem && l.speakerId === player.id);
            if (seerNightLogs.length) privateMemory += "\n[你查验时的思考记录]:\n" + seerNightLogs.map(l => `第${l.turn}晚: ${l.content}`).join('\n');
        }

        if (player.role === Role.WITCH) {
            const history = logs.filter(l => l.phase === GamePhase.WITCH_ACTION && l.turn < turnCount && l.isSystem && l.visibleTo?.includes(player.id));
            if (history.length) privateMemory += "\n[你过去的使用药水记录]:\n" + history.map(l => l.content).join('\n');
            // Include witch's own night monologue for continuous memory
            const witchNightLogs = logs.filter(l => l.phase === GamePhase.WITCH_ACTION && l.turn <= turnCount && !l.isSystem && l.speakerId === player.id);
            if (witchNightLogs.length) privateMemory += "\n[你用药时的思考记录]:\n" + witchNightLogs.map(l => `第${l.turn}晚: ${l.content}`).join('\n');
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
                task: `与你的狼人队友沟通，选择今晚要袭击的玩家目标，并讨论明天白天的战术。**战术提示**：团队胜利是唯一目标。如果有助于胜利，你可以在白天的发言中踩队友或与队友拉开距离。你的队友是：${teammateStr}。${instruction || "表达你的意图。"}`,
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
- 示例: { "speak": "我这一票投给5号，他的查验和夜间死伤事实严重冲突，标狼出局。", "actionTarget": 5 }`
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
- 示例: { "speak": "我起跳为好人争夺警徽并提供逻辑视角，大家跟着事实走。", "quitCampaign": false, "summary": "起跳竞选警长" }`
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
                task: `进行白天发言。${wolfInfo} ${instruction || "请开始你的发言。"}`,
                constraints: `- **核心任务**：
  1. **博弈收益与站边推演**：从阵营收益与行为动机出发说明你站边的逻辑（谁的做法符合好人/狼人利益），并正面回应前人的事实证据。
  2. **明确狼坑闭环**：向全场清晰交代你认定的完整狼坑名单（如9人局排出3狼组合）。
- **自然说话**：必须像真人玩家一样交流，**严禁在发言中出现“双世界推演”、“置信度”等术语字样**。
- 格式: { "speak": "你的公开演讲/发言内容（控制在300字以内）", "summary": "15字以内的发言核心要点" }
- 示例: { "speak": "从收益上看，昨晚狼人根本没有动机去刀一个无信息的4号，除非4号是被真预言家验出的金水。5号声称4号是查杀完全违背夜间刀口收益，显然5号是悍跳狼。我目前的狼坑锁定在5号、以及为他冲锋的8号和9号。", "summary": "从收益矛盾揭露5号并排狼坑" }`
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
