import { useEffect, useCallback, useRef } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
    isDaytimeAtom,
    saveSnapshotAtom,
    saveGameArchiveAtom,
} from '../store';
import {
    gamePhaseAtom,
    playersAtom,
    logsAtom,
    isAutoPlayAtom,
    currentSpeakerIdAtom,
    isProcessingAtom,
    gameConfigAtom,
    isReplayModeAtom,
    godStateAtom,
    speakingQueueAtom,
    turnCountAtom,
    summariesAtom,
    timelineAtom,
    globalApiConfigAtom,
    actorProfilesAtom,
    llmPresetsAtom,
    ttsPresetsAtom,
    llmProvidersAtom,
    isPlayingAudioAtom,
    isTheaterModeAtom,
    areRolesVisibleAtom
} from '../atoms';
import { GamePhase, ROLE_INFO, PlayerStatus, PHASE_LABELS, Role, Player, GOD_ROLES, VILLAGER_ROLES } from '../types';
import { AudioService } from '../audio';
import { generateText, parseLLMResponse, buildSystemPrompt } from '../services/llm';

// --- AI Logic Hook (The God Engine) ---
export const useGameEngine = () => {
    const [phase, setPhase] = useAtom(gamePhaseAtom);
    const [players, setPlayers] = useAtom(playersAtom);
    const [logs, setLogs] = useAtom(logsAtom);
    const [isAuto, setIsAuto] = useAtom(isAutoPlayAtom);
    const [isProcessing, setIsProcessing] = useAtom(isProcessingAtom);
    const setSpeaker = useSetAtom(currentSpeakerIdAtom);
    const saveSnapshot = useSetAtom(saveSnapshotAtom);
    const [godState, setGodState] = useAtom(godStateAtom);
    const [speakingQueue, setSpeakingQueue] = useAtom(speakingQueueAtom);
    const [turnCount, setTurnCount] = useAtom(turnCountAtom);
    const [summaries, setSummaries] = useAtom(summariesAtom);
    const isReplay = useAtomValue(isReplayModeAtom);
    const config = useAtomValue(gameConfigAtom);

    const saveGameArchive = useSetAtom(saveGameArchiveAtom);
    const setAreRolesVisible = useSetAtom(areRolesVisibleAtom);

    // Audio & Actors
    const [timeline, setTimeline] = useAtom(timelineAtom);
    const globalConfig = useAtomValue(globalApiConfigAtom);
    const actors = useAtomValue(actorProfilesAtom);
    const llmPresets = useAtomValue(llmPresetsAtom);
    const llmProviders = useAtomValue(llmProvidersAtom);
    const ttsPresets = useAtomValue(ttsPresetsAtom);
    const [isPlayingAudio, setIsPlayingAudio] = useAtom(isPlayingAudioAtom);
    const isTheater = useAtomValue(isTheaterModeAtom);
    const isDaytime = useAtomValue(isDaytimeAtom);

    // Monotonic counter to ensure absolute uniqueness for logs within a session
    const logIdCounter = useRef(0);

    // Helper: Resolve Actor Config
    const getActorConfig = useCallback((actorId: string) => {
        const actor = actors.find(a => a.id === actorId) || actors[0];
        const llm = llmPresets.find(p => p.id === actor.llmPresetId) || llmPresets[0];
        const provider = llmProviders.find(p => p.id === llm.providerId) || llmProviders[0];
        const tts = ttsPresets.find(p => p.id === actor.ttsPresetId) || ttsPresets[0];
        return { actor, llm, provider, tts };
    }, [actors, llmPresets, llmProviders, ttsPresets]);

    // --- Win Condition Checker (Slaughter the Side / 屠边) ---
    const checkWinCondition = useCallback((currentPlayers: Player[]): 'GOOD_WIN' | 'WOLF_WIN' | null => {
        const alive = currentPlayers.filter(p => p.status === PlayerStatus.ALIVE);

        const wolvesCount = alive.filter(p => p.role === Role.WEREWOLF).length;
        const villagersCount = alive.filter(p => VILLAGER_ROLES.includes(p.role)).length;
        const godsCount = alive.filter(p => GOD_ROLES.includes(p.role)).length;

        // 1. Good wins if all wolves are dead
        if (wolvesCount === 0) return 'GOOD_WIN';

        // 2. Wolves win if ALL villagers are dead OR ALL gods are dead (Tu Bian)
        if (villagersCount === 0 || godsCount === 0) return 'WOLF_WIN';

        return null;
    }, []);

    // Helper: System Log & TTS
    const addSystemLog = useCallback(async (
        content: string,
        visibleTo?: number[],
        audioOverride?: string,
        phaseOverride?: GamePhase
    ) => {
        // Use a combination of timestamp, monotonic counter, and random string to ensure uniqueness
        // preventing "Duplicate Audio" issues caused by ID collisions in Timeline.
        const uniqueSuffix = `${Date.now()}-${logIdCounter.current++}-${Math.random().toString(36).slice(2)}`;

        const sharedId = `sys-T${turnCount}-${phase}-${uniqueSuffix}`;

        setLogs(prev => [...prev, {
            id: sharedId,
            turn: turnCount,
            phase: phaseOverride !== undefined ? phaseOverride : phase,
            content: content,
            timestamp: Date.now(),
            isSystem: true,
            visibleTo
        }]);

        // Get narrator config
        const { actor, tts } = getActorConfig(globalConfig.narratorActorId);

        // Logic to strip prefixes for audio
        let textForAudio = audioOverride !== undefined ? audioOverride : content;
        // Regex to remove "上帝(私聊):", "上帝:", "旁白:" etc.
        textForAudio = textForAudio.replace(/^(上帝|旁白|系统)(?:[(（].*?[)）])?[:：]\s*/, '');

        if (!textForAudio.trim()) return; // If empty audio text, skip timeline/TTS

        // Add to timeline
        const audioKey = `audio_sys_${sharedId}`;

        // --- 核心修改：针对上帝旁白，不再记录具体的 VoiceID 和 TTS 配置 ---
        // 这样存档文件会更小，且不包含 Narrator 的 API Key。
        // 回放时，TheaterEngine 会看到 type='NARRATOR' 从而直接读取当前的全局设置。

        setTimeline(prev => [...prev, {
            id: sharedId,
            type: 'NARRATOR',
            speakerName: '上帝',
            text: textForAudio,

            // 使用占位符，不记录真实配置
            voiceId: "GLOBAL_NARRATOR",
            ttsProvider: "GLOBAL_NARRATOR",
            ttsModel: "",
            ttsBaseUrl: "",
            ttsApiKey: "",

            audioKey: audioKey,
            timestamp: Date.now()
        }]);

        // Play TTS if live game and enabled
        if (!isReplay && !isTheater && globalConfig.enabled) {
            setIsPlayingAudio(true);
            // 注意：实时播放依然使用获取到的真实 actor 和 tts 对象
            await AudioService.getInstance().playOrGenerate(
                textForAudio,
                actor.voiceId,
                audioKey,
                tts
            );
            setIsPlayingAudio(false);
        }
    }, [phase, turnCount, setLogs, setTimeline, globalConfig, isReplay, isTheater, setIsPlayingAudio, getActorConfig]);

    // --- Summarizer ---
    const summarizeTurn = useCallback(async (targetTurn: number) => {
        try {
            const logsToSummarize = logs.filter(l => l.turn === targetTurn && !l.visibleTo);
            if (logsToSummarize.length < 2) return;
            const logText = logsToSummarize.map(l => `${l.speakerId ? l.speakerId + '号' : '系统'}: ${l.content}`).join('\n');

            const messages = [{ role: 'user', content: `总结以下狼人杀游戏【第 ${targetTurn} 天】的发生的关键事件。\n${logText}` }];

            // Use narrator's LLM for summarizing or a default
            const { llm, provider } = getActorConfig(globalConfig.narratorActorId);
            const summary = await generateText(messages, llm, provider);

            if (summary) setSummaries(prev => [...prev, summary.trim()]);
        } catch (e) { console.error("Summary failed", e); }
    }, [logs, setSummaries, globalConfig, getActorConfig]);

    // --- 辅助：获取板子配置描述 ---
    const getRoleConfigStr = useCallback(() => {
        const count = config.playerCount;
        // 把每一个角色都列出来，不要统计数量
        const roleList = config.roles.map(r => ROLE_INFO[r].label).join('，');
        return `${count}人局：${roleList}。`;
    }, [config]);

    // --- Vote Logic ---
    const getAiVote = useCallback(async (player: Player, validTargets: number[]): Promise<number | null> => {
        try {
            const memoryText = summaries.length > 0 ? `### 往期记忆\n${summaries.join('\n')}` : "";
            const currentTurnLogs = logs.filter(l => l.turn === turnCount && (!l.visibleTo || l.visibleTo.includes(player.id)));
            const currentTurnText = currentTurnLogs.map(l => l.isSystem ? `[系统]: ${l.content}` : `[${l.speakerId}号]: ${l.content}`).join('\n');

            const { llm, provider } = getActorConfig(player.actorId);
            const alivePlayers = players.filter(p => p.status === PlayerStatus.ALIVE);

            // --- WOLF DOMINANCE CHECK (VOTING) ---
            const aliveWolves = alivePlayers.filter(p => p.role === Role.WEREWOLF).length;
            const aliveGood = alivePlayers.length - aliveWolves;
            let voteOverride = "";

            if (player.role === Role.WEREWOLF && aliveWolves >= aliveGood) {
                // Neutral Info Only
                voteOverride = `\n【局势提醒】目前狼人控场（${aliveWolves}狼 vs ${aliveGood}好人）。狼人票数已占优。`;
            }
            // -------------------------------------

            // 修改：传入 roleConfig
            const systemPrompt = buildSystemPrompt(player, alivePlayers, getRoleConfigStr());

            // Improved Voting Prompt
            const userPrompt = `
# 投票阶段
目前存活：${validTargets.join(', ')}。
${memoryText}
### 本轮发言（按时间先后）
${currentTurnText}
${voteOverride}

# 任务指令
请做出投票决定。必须针对当前局势给出你的理由。`;

            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];
            const responseText = await generateText(messages, llm, provider);
            const result = parseLLMResponse(responseText || "{}");

            if (result && result.actionTarget && validTargets.includes(result.actionTarget)) return result.actionTarget;
            return null;
        } catch (e) { return null; }
    }, [logs, turnCount, summaries, players, globalConfig, getActorConfig, getRoleConfigStr]);

    // --- Generate Logic & TTS ---
    const generateTurn = useCallback(async (
        player: Player,
        actionInstruction?: string,
        visibleTo?: number[]
    ): Promise<any> => {
        if (isProcessing || isReplay || isTheater) return null;
        setIsProcessing(true);
        setSpeaker(player.id);

        try {
            const alivePlayers = players.filter(p => p.status === PlayerStatus.ALIVE);
            const aliveList = alivePlayers.map(p => `${p.id}号`).join(', ');
            const memoryText = summaries.length > 0 ? `### 往期记忆\n${summaries.join('\n')}` : "";
            const currentTurnLogs = logs.filter(l => l.turn === turnCount && (!l.visibleTo || l.visibleTo.includes(player.id)));
            // 明确时间顺序
            const currentTurnText = currentTurnLogs.map(l => l.isSystem ? `[系统]: ${l.content}` : `[${l.speakerId}号]: ${l.content}`).join('\n');

            let privateContext = '';

            // --- 狼人增强逻辑 (保持不变，但变量名统一归入 privateContext) ---
            if (player.role === Role.WEREWOLF) {
                const allWolves = players.filter(p => p.role === Role.WEREWOLF);
                const teammateStatusStr = allWolves
                    .filter(p => p.id !== player.id)
                    .map(p => `${p.id}号(${p.status === PlayerStatus.ALIVE ? '存活' : '已出局'})`)
                    .join('，');

                privateContext += `\n[狼人视野] 你的队友状态：${teammateStatusStr || '无 (你是孤狼)'}。`;

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

                if (phase === GamePhase.DAY_DISCUSSION || phase === GamePhase.DAY_ANNOUNCE) {
                    if (godState.wolfTarget) {
                        const targetId = godState.wolfTarget;
                        const targetPlayer = players.find(p => p.id === targetId);
                        const isTargetAlive = targetPlayer?.status === PlayerStatus.ALIVE;

                        privateContext += `\n[狼人隐秘视野] 昨晚你们袭击了 ${targetId}号。`;
                        if (isTargetAlive) {
                            privateContext += `\n结果：平安夜（他没死）。好人不知道刀口是 ${targetId}号。`;
                        } else {
                            privateContext += `\n结果：他死了。`;
                        }
                    }
                }
            }

            // --- 预言家记忆逻辑 (NEW) ---
            if (player.role === Role.SEER) {
                // 获取过往的查验结果 (系统私聊给预言家的)
                // 筛选条件: 
                // 1. phase 是 PROPHET/SEER_ACTION (上帝回复通常在这里)
                // 2. visibleTo 包含自己
                // 3. isSystem = true (上帝说的话)
                // 4. turn < turnCount (以前的夜晚)
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

            // --- 女巫记忆逻辑 (NEW) ---
            if (player.role === Role.WITCH) {
                if (player.potions) {
                    privateContext += `\n[身份信息] 剩余药水：解药=${player.potions.cure ? '有' : '无'}，毒药=${player.potions.poison ? '有' : '无'}。`;
                }

                // 获取过往的操作记录 (上帝私聊的反馈)
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


            // --- WOLF DOMINANCE CHECK ---
            let dominancePrompt = "";

            if (isDaytime && player.role === Role.WEREWOLF) {
                const aliveWolves = alivePlayers.filter(p => p.role === Role.WEREWOLF).length;
                const aliveGood = alivePlayers.length - aliveWolves;

                if (aliveWolves >= aliveGood) {
                    // Neutral Info Only
                    dominancePrompt = `\n【当前局势提醒】\n目前存活：狼人${aliveWolves}人，好人${aliveGood}人。\n狼人票数已占优。`;
                }
            }

            // --- 白天发言顺序提示 ---
            let speakingOrderStr = "";
            if (phase === GamePhase.DAY_DISCUSSION) {
                speakingOrderStr = "\n【发言规则】当前为按座位号顺序发言。**本次公聊只有一轮发言，每位玩家在本轮只有一次发言机会**。";
            }

            const { actor, llm, provider, tts } = getActorConfig(player.actorId);

            // 修改：传入 roleConfig
            const systemPrompt = buildSystemPrompt(player, alivePlayers, getRoleConfigStr());

            const userPrompt = `游戏阶段：${PHASE_LABELS[phase]}\n${memoryText}\n### 本轮发言（按时间先后）\n${currentTurnText}\n${speakingOrderStr}\n\n${actionInstruction || "分析当前局势并行动。目标是为己方阵营获胜。"}${dominancePrompt}`;

            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];
            const responseText = await generateText(messages, llm, provider);

            const result = parseLLMResponse(responseText || "{}");
            const speech = result.speak || result.speech || "...";


            // FIX: Generate Shared ID with stronger UUID and monotonic counter
            const uniqueSuffix = `${Date.now()}-${logIdCounter.current++}-${Math.random().toString(36).slice(2)}`;

            const sharedId = `msg-T${turnCount}-${phase}-${player.id}-${uniqueSuffix}`;

            // Add Log
            setLogs(prev => [...prev, {
                id: sharedId,
                turn: turnCount,
                phase: phase,
                speakerId: player.id,
                content: speech,
                timestamp: Date.now(),
                isSystem: false,
                visibleTo: visibleTo
            }]);

            // Add to Timeline
            const audioKey = `audio_game_${sharedId}`;
            setTimeline(prev => [...prev, {
                id: sharedId, // Matching ID
                type: 'PLAYER',
                speakerName: `${player.id}号`,
                text: speech,
                voiceId: actor.voiceId,
                ttsProvider: tts.provider,
                ttsModel: tts.modelId,
                ttsBaseUrl: tts.baseUrl,
                ttsApiKey: tts.apiKey,
                audioKey: audioKey,
                timestamp: Date.now()
            }]);

            // Play TTS
            setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, isSpeaking: true } : p));
            setIsPlayingAudio(true);

            // TTS Call
            if (globalConfig.enabled) {
                await AudioService.getInstance().playOrGenerate(
                    speech,
                    actor.voiceId,
                    audioKey,
                    tts
                );
            } else {
                // Simulation delay for reading if no audio
                await new Promise(r => setTimeout(r, 1500));
            }

            setIsPlayingAudio(false);
            setPlayers(prev => prev.map(p => ({ ...p, isSpeaking: false })));
            setSpeaker(null);
            saveSnapshot();
            return result;

        } catch (e) {
            console.error("AI Error", e);
            setIsProcessing(false);
            return null;
        } finally {
            setIsProcessing(false);
        }
    }, [logs, phase, isProcessing, isReplay, players, turnCount, summaries, globalConfig, isTheater, setLogs, setTimeline, setPlayers, setSpeaker, saveSnapshot, setIsPlayingAudio, getActorConfig, isDaytime, getRoleConfigStr, godState]);


    // --- The GOD Loop ---
    useEffect(() => {
        if (!isAuto || isProcessing || isReplay || isPlayingAudio || isTheater) return;

        const loopTimeout = setTimeout(async () => {
            const getNextSpeaker = (candidates: Player[]) => {
                // FIX: Add `l.turn === turnCount` to ensure we only look at actions from THIS turn.
                const spokenIds = logs.filter(l => l.phase === phase && !l.isSystem && l.turn === turnCount).map(l => l.speakerId);
                return candidates.find(p => !spokenIds.includes(p.id));
            };

            switch (phase) {
                case GamePhase.NIGHT_START:
                    setIsProcessing(true);
                    try {
                        await addSystemLog("天黑请闭眼。");
                        setPhase(GamePhase.WEREWOLF_ACTION);
                        setGodState({ wolfTarget: null, seerCheck: null, witchSave: false, witchPoison: null, guardProtect: null, deathsTonight: [] });
                        saveSnapshot();
                        // Split logic: Log the next phase start within this block, forcing the phase ID
                        await addSystemLog("狼人请睁眼。", undefined, undefined, GamePhase.WEREWOLF_ACTION);
                    } finally {
                        setIsProcessing(false);
                    }
                    break;

                case GamePhase.WEREWOLF_ACTION: {
                    const wolves = players.filter(p => p.status === PlayerStatus.ALIVE && p.role === Role.WEREWOLF);

                    const wolfNightPrompt = `你是狼人。准确刀中关键神职或做高自己身份。请与队友进行战术沟通（本轮只有一次发言机会）。`;

                    const nextWolf = getNextSpeaker(wolves);

                    if (nextWolf) {
                        const isLastSpeaker = nextWolf.id === wolves[wolves.length - 1].id;

                        if (isLastSpeaker) {
                            // ALLOW SELF KILL: Removed restriction on targets
                            const targets = players.filter(p => p.status === PlayerStatus.ALIVE).map(t => t.id);
                            const finalPrompt = `${wolfNightPrompt}\n**最终决策**：你是最后一个发言的狼人。请给出最终刀人决定。`;

                            const result = await generateTurn(nextWolf, finalPrompt, wolves.map(w => w.id));

                            if (result?.actionTarget) {
                                const targetId = targets.includes(result.actionTarget) ? result.actionTarget : targets[Math.floor(Math.random() * targets.length)];
                                setGodState(prev => ({ ...prev, wolfTarget: targetId }));
                            } else if (targets.length > 0) {
                                // Fallback random
                                const targetId = targets[Math.floor(Math.random() * targets.length)];
                                setGodState(prev => ({ ...prev, wolfTarget: targetId }));
                            }
                        } else {
                            await generateTurn(nextWolf, wolfNightPrompt + "\n目前是讨论阶段，JSON 的 actionTarget 请填 null。", wolves.map(w => w.id));
                        }
                    } else {
                        setIsProcessing(true);
                        try {
                            await addSystemLog("狼人请闭眼。");
                            setPhase(GamePhase.SEER_ACTION);
                            saveSnapshot();
                            await addSystemLog("预言家请睁眼。", undefined, undefined, GamePhase.SEER_ACTION);
                        } finally {
                            setIsProcessing(false);
                        }
                    }
                    break;
                }

                case GamePhase.SEER_ACTION: {
                    const seer = players.find(p => p.role === Role.SEER && p.status === PlayerStatus.ALIVE);
                    // FIX: Check turnCount to allow Seer to act every night, not just the first one.
                    const hasSpoken = logs.some(l => l.phase === phase && l.speakerId === seer?.id && l.turn === turnCount);

                    if (seer && !hasSpoken) {
                        const targetIds = players.filter(p => p.status === PlayerStatus.ALIVE && p.id !== seer.id).map(t => t.id);
                        const seerPrompt = `请选择今晚查验的对象。基于逻辑寻找狼人或验证关键身份。请在 speak 中简述你的心理活动。`;
                        const result = await generateTurn(seer, seerPrompt, [seer.id]);

                        if (result?.actionTarget) {
                            const checkId = targetIds.includes(result.actionTarget) ? result.actionTarget : targetIds[Math.floor(Math.random() * targetIds.length)];
                            const isGood = players.find(p => p.id === checkId)?.role !== Role.WEREWOLF;
                            setIsProcessing(true);
                            try {
                                await addSystemLog(`上帝(私聊): ${checkId}号是 ${isGood ? '好人' : '狼人'}`, [seer.id]);
                                setGodState(prev => ({ ...prev, seerCheck: checkId }));
                            } finally {
                                setIsProcessing(false);
                            }
                        }
                    }

                    setIsProcessing(true);
                    try {
                        await addSystemLog("预言家请闭眼。");
                        setPhase(GamePhase.WITCH_ACTION);
                        saveSnapshot();
                        await addSystemLog("女巫请睁眼。", undefined, undefined, GamePhase.WITCH_ACTION);
                    } finally {
                        setIsProcessing(false);
                    }
                    break;
                }

                case GamePhase.WITCH_ACTION: {
                    const witch = players.find(p => p.role === Role.WITCH && p.status === PlayerStatus.ALIVE);
                    // FIX: Check turnCount to allow Witch to act every night.
                    const hasSpoken = logs.some(l => l.phase === phase && l.speakerId === witch?.id && l.turn === turnCount);

                    if (witch && !hasSpoken) {
                        const dyingId = godState.wolfTarget;
                        const witchPrompt = `女巫行动。当前 ${dyingId}号 被杀。请决定是否使用药水（解药/毒药情况见私聊信息）。请在 speak 中简述你的心理活动。`;

                        const result = await generateTurn(witch, witchPrompt, [witch.id]);

                        if (result) {
                            setIsProcessing(true);
                            try {
                                if (witch.potions?.cure && result.useCure && dyingId) {
                                    setGodState(prev => ({ ...prev, witchSave: true }));
                                    await addSystemLog(`上帝(私聊): 使用解药救了 ${dyingId}号。`, [witch.id]);
                                    setPlayers(prev => prev.map(p => p.id === witch.id ? { ...p, potions: { ...p.potions!, cure: false } } : p));
                                } else if (witch.potions?.poison && result.poisonTarget) {
                                    setGodState(prev => ({ ...prev, witchPoison: result.poisonTarget }));
                                    await addSystemLog(`上帝(私聊): 毒死了 ${result.poisonTarget}号。`, [witch.id]);
                                    setPlayers(prev => prev.map(p => p.id === witch.id ? { ...p, potions: { ...p.potions!, poison: false } } : p));
                                } else {
                                    await addSystemLog(`上帝(私聊): 未使用药水。`, [witch.id]);
                                }
                            } finally {
                                setIsProcessing(false);
                            }
                        }
                    }

                    setIsProcessing(true);
                    try {
                        await addSystemLog("女巫请闭眼。");
                        setPhase(GamePhase.DAY_ANNOUNCE);
                        saveSnapshot();
                    } finally {
                        setIsProcessing(false);
                    }
                    break;
                }

                case GamePhase.DAY_ANNOUNCE: {
                    setIsProcessing(true);
                    try {
                        const deaths: number[] = [];
                        if (godState.wolfTarget && !godState.witchSave) deaths.push(godState.wolfTarget);
                        if (godState.witchPoison) deaths.push(godState.witchPoison);
                        const uniqueDeaths = [...new Set(deaths)];

                        // Update statuses
                        if (uniqueDeaths.length > 0) {
                            const newPlayers = players.map(p => uniqueDeaths.includes(p.id) ? { ...p, status: PlayerStatus.DEAD_NIGHT } : p);
                            setPlayers(newPlayers);
                            await addSystemLog(`天亮了。昨晚 ${uniqueDeaths.join(', ')}号 死亡。`);

                            // Check Win Condition Immediately after deaths
                            const winState = checkWinCondition(newPlayers);
                            if (winState) {
                                const winner = winState === 'GOOD_WIN' ? 'GOOD' : 'WOLF';
                                await addSystemLog(winState === 'GOOD_WIN' ? "游戏结束。好人胜利！" : "游戏结束。狼人胜利！(屠边)");
                                setPhase(GamePhase.GAME_REVIEW);
                                setAreRolesVisible(true); // REVEAL
                                saveGameArchive(winner); // Save Archive
                                return;
                            }
                        } else {
                            await addSystemLog("天亮了。昨晚是平安夜。");
                        }

                        const deadHunter = players.find(p => uniqueDeaths.includes(p.id) && p.role === Role.HUNTER);
                        const hunterPoisoned = deadHunter && deadHunter.id === godState.witchPoison;

                        if (deadHunter && !hunterPoisoned) {
                            await addSystemLog(`猎人 ${deadHunter.id}号 倒牌，发动技能开枪。`);
                            setPhase(GamePhase.HUNTER_ACTION);
                            setSpeakingQueue([deadHunter.id]);
                            saveSnapshot();
                            return;
                        }

                        const alive = players.filter(p => p.status === PlayerStatus.ALIVE && !uniqueDeaths.includes(p.id));
                        const startIdx = Math.floor(Math.random() * alive.length);
                        const queue = [...alive.slice(startIdx), ...alive.slice(0, startIdx)].map(p => p.id);
                        setSpeakingQueue(queue);
                        await addSystemLog(`从 ${alive[startIdx].id}号 开始发言。`);
                        setPhase(GamePhase.DAY_DISCUSSION);
                        saveSnapshot();
                    } finally {
                        setIsProcessing(false);
                    }
                    break;
                }

                case GamePhase.DAY_DISCUSSION: {
                    const [nextId, ...rest] = speakingQueue;
                    if (nextId) {
                        const player = players.find(p => p.id === nextId);
                        if (player && player.status === PlayerStatus.ALIVE) {
                            await generateTurn(player);
                        }
                        setSpeakingQueue(rest);
                    } else {
                        setIsProcessing(true);
                        try {
                            await addSystemLog("发言结束，开始投票...");
                            setPhase(GamePhase.VOTING);
                            saveSnapshot();
                        } finally {
                            setIsProcessing(false);
                        }
                    }
                    break;
                }

                case GamePhase.VOTING: {
                    setIsProcessing(true);
                    try {
                        const alive = players.filter(p => p.status === PlayerStatus.ALIVE);
                        const votes: Record<number, number> = {};

                        // Vote
                        const results = await Promise.all(alive.map(async p => ({ voter: p.id, target: await getAiVote(p, alive.map(a => a.id)) })));

                        // Count votes for logic
                        results.forEach(({ voter, target }) => { if (target) votes[target] = (votes[target] || 0) + 1; });

                        // Format for Display: Group by Target
                        const voteMap: Record<number, number[]> = {};
                        const abstained: number[] = [];

                        results.forEach(({ voter, target }) => {
                            if (target) {
                                if (!voteMap[target]) voteMap[target] = [];
                                voteMap[target].push(voter);
                            } else {
                                abstained.push(voter);
                            }
                        });

                        const detailsLines = Object.entries(voteMap).map(([target, voters]) => {
                            return `${target}号: ${voters.join('、')}`;
                        });
                        if (abstained.length > 0) detailsLines.push(`弃票: ${abstained.join('、')}`);

                        const voteDetails = detailsLines.join('\n');
                        await addSystemLog(`投票结果:\n${voteDetails}`, undefined, "投票统计完毕。");

                        let max = -1, victims: number[] = [];
                        for (const [pid, count] of Object.entries(votes)) {
                            if (count > max) { max = count; victims = [+pid]; }
                            else if (count === max) victims.push(+pid);
                        }
                        const final = victims.length > 0 ? victims[Math.floor(Math.random() * victims.length)] : null;

                        if (final) {
                            await addSystemLog(`${final}号 被投票出局。`);
                            const newPlayers = players.map(p => p.id === final ? { ...p, status: PlayerStatus.DEAD_VOTE } : p);
                            setPlayers(newPlayers);

                            const votedOutPlayer = players.find(p => p.id === final);

                            // Check Win Condition Immediately
                            const winState = checkWinCondition(newPlayers);
                            if (winState) {
                                const winner = winState === 'GOOD_WIN' ? 'GOOD' : 'WOLF';
                                await addSystemLog(winState === 'GOOD_WIN' ? "好人胜利！" : "狼人胜利！(屠边)");
                                setPhase(GamePhase.GAME_REVIEW);
                                setAreRolesVisible(true); // REVEAL
                                saveGameArchive(winner); // Save Archive
                                return;
                            }

                            if (votedOutPlayer && votedOutPlayer.role === Role.HUNTER) {
                                await addSystemLog(`猎人 ${votedOutPlayer.id}号 出局，可以发动技能。`);
                                setPhase(GamePhase.HUNTER_ACTION);
                                setSpeakingQueue([votedOutPlayer.id]);
                                saveSnapshot();
                                return;
                            }

                            await addSystemLog("请发表遗言。");
                            setPhase(GamePhase.LAST_WORDS);
                            setSpeakingQueue([final]);
                        } else {
                            await addSystemLog("平安日，无人出局。");
                            setPhase(GamePhase.LAST_WORDS);
                            setSpeakingQueue([]);
                        }
                        saveSnapshot();
                    } finally {
                        setIsProcessing(false);
                    }
                    break;
                }

                case GamePhase.HUNTER_ACTION: {
                    const [hunterId] = speakingQueue;
                    if (hunterId) {
                        const hunter = players.find(p => p.id === hunterId);
                        const alivePlayers = players.filter(p => p.status === PlayerStatus.ALIVE);
                        const targetIds = alivePlayers.map(p => p.id);

                        if (hunter && targetIds.length > 0) {
                            const wasVotedOut = hunter.status === PlayerStatus.DEAD_VOTE;
                            let hunterPrompt = '';

                            if (wasVotedOut) {
                                hunterPrompt = `你被投票出局了。请发表你的【遗言】，并在发言末尾发动技能带走一名玩家。可选目标: [${targetIds.join(', ')}]. JSON 中必须包含 "actionTarget"`;
                            } else { // Died at night
                                hunterPrompt = `你出局了，发动猎人技能带走一人。**策略**：带走场上狼面最大的玩家，为好人追回轮次。可选: [${targetIds.join(', ')}]. JSON 包含 "actionTarget": number`;
                            }

                            const result = await generateTurn(hunter, hunterPrompt);
                            const shotTargetId = result?.actionTarget && targetIds.includes(result.actionTarget) ? result.actionTarget : targetIds[Math.floor(Math.random() * targetIds.length)];

                            if (shotTargetId) {
                                setIsProcessing(true);
                                try {
                                    await addSystemLog(`猎人开枪，${shotTargetId}号 倒牌。`);
                                    const newPlayers = players.map(p => p.id === shotTargetId ? { ...p, status: PlayerStatus.DEAD_SHOOT } : p);
                                    setPlayers(newPlayers);

                                    const winState = checkWinCondition(newPlayers);
                                    if (winState) {
                                        const winner = winState === 'GOOD_WIN' ? 'GOOD' : 'WOLF';
                                        await addSystemLog(winState === 'GOOD_WIN' ? "好人胜利！" : "狼人胜利！(屠边)");
                                        setPhase(GamePhase.GAME_REVIEW);
                                        setAreRolesVisible(true); // REVEAL
                                        saveGameArchive(winner); // Save Archive
                                        saveSnapshot();
                                        return;
                                    }

                                    if (wasVotedOut) {
                                        await addSystemLog(`猎人遗言并发动技能后，本轮结束。`);
                                        await summarizeTurn(turnCount);
                                        setTurnCount(t => t + 1);
                                        setPhase(GamePhase.NIGHT_START);
                                        await addSystemLog(`--- 第 ${turnCount + 1} 天 ---`);
                                    } else {
                                        await addSystemLog("猎人死亡带走玩家，无遗言。");
                                        const aliveForDiscussion = newPlayers.filter(p => p.status === PlayerStatus.ALIVE);
                                        const startIdx = Math.floor(Math.random() * aliveForDiscussion.length);
                                        const queue = [...aliveForDiscussion.slice(startIdx), ...aliveForDiscussion.slice(0, startIdx)].map(p => p.id);
                                        setSpeakingQueue(queue);
                                        await addSystemLog(`从 ${queue[0]}号 开始发言。`);
                                        setPhase(GamePhase.DAY_DISCUSSION);
                                    }
                                } finally {
                                    setIsProcessing(false);
                                }
                            }
                        }
                    }
                    saveSnapshot();
                    break;
                }

                case GamePhase.LAST_WORDS: {
                    const [sid, ...rest] = speakingQueue;
                    if (sid) {
                        const p = players.find(o => o.id === sid);
                        if (p) await generateTurn(p, "发表遗言。告诉好人你的身份，或者误导他们。");
                        setSpeakingQueue(rest);
                    } else {
                        setIsProcessing(true);
                        try {
                            await summarizeTurn(turnCount);
                            setTurnCount(t => t + 1);
                            setPhase(GamePhase.NIGHT_START);
                            await addSystemLog(`--- 第 ${turnCount + 1} 天 ---`);
                            saveSnapshot();
                        } finally {
                            setIsProcessing(false);
                        }
                    }
                    break;
                }

                case GamePhase.GAME_REVIEW: {
                    // Stop auto loop
                    setIsAuto(false);
                    break;
                }
            }
        }, 1000);

        return () => clearTimeout(loopTimeout);
    }, [isAuto, isProcessing, phase, players, generateTurn, isReplay, logs, turnCount, godState, speakingQueue, isPlayingAudio, isTheater, addSystemLog, summarizeTurn, getAiVote, setPhase, setPlayers, setGodState, setSpeakingQueue, saveSnapshot, setIsProcessing, setIsAuto, checkWinCondition, saveGameArchive, setAreRolesVisible]);

    return { generateTurn };
};