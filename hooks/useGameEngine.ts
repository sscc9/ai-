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
    timelineAtom,
    globalApiConfigAtom,
    actorProfilesAtom,
    llmPresetsAtom,
    ttsPresetsAtom,
    llmProvidersAtom,
    isPlayingAudioAtom,
    isTheaterModeAtom,
    areRolesVisibleAtom,
    userInputAtom,
    enabledCustomPromptsAtom,
    customRolePromptsAtom
} from '../atoms';
import { GamePhase, ROLE_INFO, PlayerStatus, PHASE_LABELS, Role, Player, GOD_ROLES, VILLAGER_ROLES } from '../types';
import { AudioService } from '../audio';
import { generateText, parseLLMResponse } from '../services/llm';
import { WerewolfSkill } from '../services/skills/werewolf/WerewolfSkill';

const werewolfSkill = new WerewolfSkill(); // Singleton skill instance

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
    const enabledCustomPrompts = useAtomValue(enabledCustomPromptsAtom);
    const customRolePrompts = useAtomValue(customRolePromptsAtom);

    const [userInput, setUserInput] = useAtom(userInputAtom);
    const userInputRef = useRef(userInput);
    useEffect(() => { userInputRef.current = userInput; }, [userInput]);

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
        phaseOverride?: GamePhase,
        deaths?: number[]
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
            visibleTo,
            deaths
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
                tts,
                undefined,
                undefined,
                globalConfig.ttsSpeed || 1.0
            );
            setIsPlayingAudio(false);
        }
    }, [phase, turnCount, setLogs, setTimeline, globalConfig, isReplay, isTheater, setIsPlayingAudio, getActorConfig]);


    // --- 辅助：获取板子配置描述 ---
    const getRoleConfigStr = useCallback(() => {
        const count = config.playerCount;
        // 把每一个角色都列出来，不要统计数量
        const roleList = config.roles.map(r => ROLE_INFO[r].label).join('，');
        return `${count}人局：${roleList}。`;
    }, [config]);

    // --- Human Input Waiter ---
    const waitForHumanInput = useCallback(async () => {
        while (!userInputRef.current) {
            await new Promise(r => setTimeout(r, 500));
        }
        const input = userInputRef.current;
        setUserInput(null);
        return input;
    }, [setUserInput]);

    // --- Vote Logic ---
    const getAiVote = useCallback(async (player: Player, validTargets: number[], votePhase: GamePhase = GamePhase.VOTING): Promise<number | null> => {
        try {
            if (player.isHuman) {
                setSpeaker(player.id);
                const result = await waitForHumanInput();
                setSpeaker(null);
                return result?.actionTarget && validTargets.includes(result.actionTarget) ? result.actionTarget : null;
            }

            const currentTurnLogs = logs.filter(l => l.turn <= turnCount && (!l.visibleTo || l.visibleTo.includes(player.id)));

            const { llm, provider } = getActorConfig(player.actorId);
            const alivePlayers = players.filter(p => p.status === PlayerStatus.ALIVE);

            // --- SKILL INTEGRATION (VOTING/SHERIFF_VOTE) ---
            const context = {
                phase: votePhase,
                turnCount,
                players,
                logs,
                roleConfigStr: getRoleConfigStr(),
                godState,
                alivePlayers,
                currentTurnLogs,
                enabledCustomPrompts,
                customRolePrompts
            };

            let messages = await werewolfSkill.generatePrompts(player, context);
            let responseText = await generateText(messages, llm, provider);
            let result = parseLLMResponse(responseText || "{}");

            // Parse error feedback retry
            const isInvalid = !result || result.actionTarget === undefined;
            if (isInvalid && responseText && !responseText.includes("Error:")) {
                console.warn(`JSON parsing failed or actionTarget missing for Player ${player.id} vote, retrying with feedback...`);
                const retryMessages = [
                    ...messages,
                    { role: 'model', content: responseText },
                    { role: 'user', content: "解析错误：您的输出未能被正确解析为包含 'actionTarget' 的 JSON。请确保您的回复中【仅包含】纯 JSON 对象，确保包含 'actionTarget' 字段（你要投给哪个玩家的座号数字，例如：3；若选择弃票则为 null），不要用 markdown 代码块标记包裹。请重新输出您的 JSON 对象。" }
                ];
                responseText = await generateText(retryMessages, llm, provider);
                result = parseLLMResponse(responseText || "{}");
            }

            if (result && result.actionTarget !== undefined && (result.actionTarget === null || validTargets.includes(result.actionTarget))) return result.actionTarget;
            return null;
        } catch (e) { return null; }
    }, [logs, turnCount, players, globalConfig, getActorConfig, getRoleConfigStr, waitForHumanInput]);

    const generateTurn = useCallback(async (
        player: Player,
        actionInstruction?: string,
        visibleTo?: number[],
        skipIsProcessingFlag: boolean = false
    ): Promise<any> => {
        if (!skipIsProcessingFlag && (isProcessing || isReplay || isTheater)) return null;
        if (!skipIsProcessingFlag) setIsProcessing(true);
        setSpeaker(player.id);

        try {
            const { actor, tts, llm, provider } = getActorConfig(player.actorId);
            let result: any = null;
            let rawSpeechFallback = '';

            if (player.isHuman) {
                // Wait for human
                result = await waitForHumanInput();
            } else {
                const alivePlayers = players.filter(p => p.status === PlayerStatus.ALIVE);
                const currentTurnLogs = logs.filter(l => l.turn <= turnCount && (!l.visibleTo || l.visibleTo.includes(player.id)));

                // --- SKILL INTEGRATION (GENERAL) ---
                const context = {
                    phase,
                    turnCount,
                    players,
                    logs,
                    roleConfigStr: getRoleConfigStr(),
                    godState,
                    alivePlayers,
                    currentTurnLogs,
                    enabledCustomPrompts,
                    customRolePrompts
                };

                let messages = await werewolfSkill.generatePrompts(player, context, actionInstruction);
                let responseText = await generateText(messages, llm, provider);
                rawSpeechFallback = responseText;
                result = parseLLMResponse(responseText || "{}");

                // Parse error feedback retry
                const isInvalid = !result || !result.thought || (!result.speak && !result.speech);
                if (isInvalid && responseText && !responseText.includes("Error:")) {
                    console.warn(`JSON parsing failed/incomplete for Player ${player.id}, retrying with feedback...`);
                    messages = [
                        ...messages,
                        { role: 'model', content: responseText },
                        { role: 'user', content: "解析错误：您的输出未能被正确解析为 JSON。请确保您的回复中【仅包含】纯 JSON 对象（不要用 ```json 标记包裹，不要有任何前导或尾随文字，确保没有格式错误，且必须首个输出 thought 字段以进行策略推理）。请重新输出您的 JSON 对象。" }
                    ];
                    responseText = await generateText(messages, llm, provider);
                    const retryResult = parseLLMResponse(responseText || "{}");
                    if (retryResult && retryResult.thought) {
                        result = retryResult;
                    }
                }
            }

            const speech = result?.speak || result?.speech || (rawSpeechFallback && !rawSpeechFallback.includes("Error:") ? rawSpeechFallback : "...");

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
                thought: result?.thought, // Capture thought
                summary: result?.summary, // Capture summary for memory compression
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

            // TTS Call (Only for AI, human already typed/spoke it)
            if (globalConfig.enabled && !player.isHuman) {
                await AudioService.getInstance().playOrGenerate(
                    speech,
                    actor.voiceId,
                    audioKey,
                    tts,
                    undefined,
                    undefined,
                    globalConfig.ttsSpeed || 1.0
                );
            } else {
                // Simulation delay for reading if no audio or human
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
            if (!skipIsProcessingFlag) setIsProcessing(false);
        }
    }, [logs, phase, isProcessing, isReplay, players, turnCount, globalConfig, isTheater, setLogs, setTimeline, setPlayers, setSpeaker, saveSnapshot, setIsPlayingAudio, getActorConfig, isDaytime, getRoleConfigStr, godState]);


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
                        // Delay before wake up
                        await new Promise(r => setTimeout(r, Math.random() * 2000 + 1500));

                        const prevGuardProtect = godState.guardProtect;
                        setGodState({ 
                            wolfTarget: null, 
                            seerCheck: null, 
                            witchSave: false, 
                            witchPoison: null, 
                            guardProtect: null, 
                            lastGuardProtect: prevGuardProtect,
                            deathsTonight: [],
                            pkPlayers: godState.pkPlayers || [],
                            isPkRound: godState.isPkRound || false,
                            sheriffId: godState.sheriffId
                        });
                        saveSnapshot();

                        const hasGuard = players.some(p => p.role === Role.GUARD && p.status === PlayerStatus.ALIVE);
                        if (hasGuard) {
                            setPhase(GamePhase.GUARD_ACTION);
                            saveSnapshot();
                            const guard = players.find(p => p.role === Role.GUARD);
                            await addSystemLog("守卫请睁眼。", guard ? [guard.id] : [], undefined, GamePhase.GUARD_ACTION);
                        } else {
                            setPhase(GamePhase.WEREWOLF_ACTION);
                            saveSnapshot();
                            const wolves = players.filter(p => p.role === Role.WEREWOLF);
                            await addSystemLog("狼人请睁眼。", wolves.map(w => w.id), undefined, GamePhase.WEREWOLF_ACTION);
                        }
                    } finally {
                        setIsProcessing(false);
                    }
                    break;

                case GamePhase.GUARD_ACTION: {
                    setIsProcessing(true);
                    try {
                        const guard = players.find(p => p.role === Role.GUARD && p.status === PlayerStatus.ALIVE);
                        const hasSpoken = logs.some(l => l.phase === phase && l.speakerId === guard?.id && l.turn === turnCount);

                        if (guard && !hasSpoken) {
                            const lastProtected = godState.lastGuardProtect;
                            const result = await generateTurn(guard, undefined, [guard.id], true);
                            
                            if (result?.actionTarget) {
                                // Validate constraint: cannot protect consecutively
                                if (result.actionTarget !== lastProtected) {
                                    setGodState(prev => ({ ...prev, guardProtect: result.actionTarget }));
                                    await addSystemLog(`上帝(私聊): 守护了 ${result.actionTarget}号。`, [guard.id]);
                                } else {
                                    // Fallback: choose a random alive target that is NOT lastProtected
                                    const validTargets = players.filter(p => p.status === PlayerStatus.ALIVE && p.id !== lastProtected).map(p => p.id);
                                    if (validTargets.length > 0) {
                                        const randomTarget = validTargets[Math.floor(Math.random() * validTargets.length)];
                                        setGodState(prev => ({ ...prev, guardProtect: randomTarget }));
                                        await addSystemLog(`上帝(私聊): 守护了 ${randomTarget}号。`, [guard.id]);
                                    }
                                }
                            } else {
                                await addSystemLog(`上帝(私聊): 未守护任何人。`, [guard.id]);
                            }
                        }

                        // Delay before closing eyes
                        await new Promise(r => setTimeout(r, Math.random() * 1500 + 1000));
                        const guardId = guard?.id;
                        await addSystemLog("守卫请闭眼。", guardId ? [guardId] : []);
                        
                        // Delay before wolves
                        await new Promise(r => setTimeout(r, Math.random() * 2000 + 1500));

                        setPhase(GamePhase.WEREWOLF_ACTION);
                        saveSnapshot();

                        const wolves = players.filter(p => p.role === Role.WEREWOLF);
                        await addSystemLog("狼人请睁眼。", wolves.map(w => w.id), undefined, GamePhase.WEREWOLF_ACTION);
                    } finally {
                        setIsProcessing(false);
                    }
                    break;
                }

                case GamePhase.WEREWOLF_ACTION: {
                    setIsProcessing(true);
                    try {
                        const wolves = players.filter(p => p.status === PlayerStatus.ALIVE && p.role === Role.WEREWOLF);
                        const wolfNightPrompt = `目前是讨论阶段，JSON 的 actionTarget 请填 null。`;
                        const nextWolf = getNextSpeaker(wolves);

                        if (nextWolf) {
                            const isLastSpeaker = nextWolf.id === wolves[wolves.length - 1].id;

                            if (isLastSpeaker) {
                                // ALLOW SELF KILL: Removed restriction on targets
                                const targets = players.filter(p => p.status === PlayerStatus.ALIVE).map(t => t.id);
                                const finalPrompt = `**最终决策**：你是最后一个发言的狼人。请在 speak 中总结并给出最终决定，且必须在 **actionTarget** 中填入今晚要杀的玩家ID (数字)。`;

                                const result = await generateTurn(nextWolf, finalPrompt, wolves.map(w => w.id), true);

                                if (result?.actionTarget) {
                                    const targetId = targets.includes(result.actionTarget) ? result.actionTarget : targets[Math.floor(Math.random() * targets.length)];
                                    setGodState(prev => ({ ...prev, wolfTarget: targetId }));
                                } else if (targets.length > 0) {
                                    // Fallback random
                                    const targetId = targets[Math.floor(Math.random() * targets.length)];
                                    setGodState(prev => ({ ...prev, wolfTarget: targetId }));
                                }
                            } else {
                                await generateTurn(nextWolf, wolfNightPrompt, wolves.map(w => w.id), true);
                            }
                        } else {
                            // Delay before closing eyes
                            await new Promise(r => setTimeout(r, Math.random() * 1500 + 1000));

                            const wolves = players.filter(p => p.role === Role.WEREWOLF);
                            await addSystemLog("狼人请闭眼。", wolves.map(w => w.id));

                            // Delay before Seer
                            await new Promise(r => setTimeout(r, Math.random() * 2000 + 1500));

                            setPhase(GamePhase.SEER_ACTION);
                            saveSnapshot();

                            const seer = players.find(p => p.role === Role.SEER);
                            await addSystemLog("预言家请睁眼。", seer ? [seer.id] : [], undefined, GamePhase.SEER_ACTION);
                        }
                    } finally {
                        setIsProcessing(false);
                    }
                    break;
                }

                case GamePhase.SEER_ACTION: {
                    setIsProcessing(true);
                    try {
                        const seer = players.find(p => p.role === Role.SEER && p.status === PlayerStatus.ALIVE);
                        // FIX: Check turnCount to allow Seer to act every night, not just the first one.
                        const hasSpoken = logs.some(l => l.phase === phase && l.speakerId === seer?.id && l.turn === turnCount);

                        if (seer && !hasSpoken) {
                            const targetIds = players.filter(p => p.status === PlayerStatus.ALIVE && p.id !== seer.id).map(t => t.id);
                            const seerPrompt = `请选择查验对象。`;
                            const result = await generateTurn(seer, seerPrompt, [seer.id], true);

                            if (result?.actionTarget) {
                                const checkId = targetIds.includes(result.actionTarget) ? result.actionTarget : targetIds[Math.floor(Math.random() * targetIds.length)];
                                const isGood = players.find(p => p.id === checkId)?.role !== Role.WEREWOLF;
                                await addSystemLog(`上帝(私聊): ${checkId}号是 ${isGood ? '好人' : '狼人'}`, [seer.id]);
                                setGodState(prev => ({ ...prev, seerCheck: checkId }));
                            }
                        }

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
                    setIsProcessing(true);
                    try {
                        const witch = players.find(p => p.role === Role.WITCH && p.status === PlayerStatus.ALIVE);
                        // FIX: Check turnCount to allow Witch to act every night.
                        const hasSpoken = logs.some(l => l.phase === phase && l.speakerId === witch?.id && l.turn === turnCount);

                        if (witch && !hasSpoken) {
                            const dyingId = godState.wolfTarget;
                            const witchPrompt = `女巫行动。`;

                            const result = await generateTurn(witch, witchPrompt, [witch.id], true);

                            if (result) {
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
                            }
                        }

                        // Delay before closing eyes
                        await new Promise(r => setTimeout(r, Math.random() * 1500 + 1000));

                        const targetWitch = players.find(p => p.role === Role.WITCH);
                        await addSystemLog("女巫请闭眼。", targetWitch ? [targetWitch.id] : []);

                        // Small delay before sunrise
                        await new Promise(r => setTimeout(r, 2000));

                        if (turnCount === 1) {
                            setPhase(GamePhase.SHERIFF_ELECT);
                        } else {
                            setPhase(GamePhase.DAY_ANNOUNCE);
                        }
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
                        const wolfTarget = godState.wolfTarget;
                        const guardProtect = godState.guardProtect;
                        const witchSave = godState.witchSave;

                        if (wolfTarget) {
                            if (wolfTarget === guardProtect) {
                                if (witchSave) {
                                    // 同救同死 (Double save kills target)
                                    deaths.push(wolfTarget);
                                }
                            } else {
                                if (!witchSave) {
                                    // 无任何守护，死亡 (Killed by Wolves)
                                    deaths.push(wolfTarget);
                                }
                            }
                        }

                        if (godState.witchPoison) {
                            deaths.push(godState.witchPoison);
                        }

                        const uniqueDeaths = [...new Set(deaths)];
                        
                        // Save deaths list in godState
                        setGodState(prev => ({ ...prev, deathsTonight: uniqueDeaths }));

                        // Update statuses
                        if (uniqueDeaths.length > 0) {
                            const newPlayers = players.map(p => uniqueDeaths.includes(p.id) ? { ...p, status: PlayerStatus.DEAD_NIGHT } : p);
                            setPlayers(newPlayers);
                            await addSystemLog(`天亮了。昨晚 ${uniqueDeaths.join(', ')}号 死亡。`, undefined, undefined, undefined, uniqueDeaths);

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

                            // If Sheriff is dead, trigger badge transfer
                            if (godState.sheriffId && uniqueDeaths.includes(godState.sheriffId)) {
                                setGodState(prev => ({ ...prev, pendingDeathId: godState.sheriffId }));
                                setPhase(GamePhase.SHERIFF_TRANS);
                                saveSnapshot();
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
                        const sheriff = alive.find(p => p.id === godState.sheriffId);

                        if (sheriff) {
                            await addSystemLog(`请警长 ${sheriff.id}号 决定从死者左手边或右手边开始发言。`);
                            let direction: "LEFT" | "RIGHT" = "LEFT";
                            if (sheriff.isHuman) {
                                setSpeaker(sheriff.id);
                                const result = await waitForHumanInput();
                                setSpeaker(null);
                                direction = result?.direction === "RIGHT" ? "RIGHT" : "LEFT";
                            } else {
                                const promptContext = {
                                    phase: GamePhase.DAY_DISCUSSION,
                                    turnCount,
                                    players,
                                    logs,
                                    roleConfigStr: getRoleConfigStr(),
                                    godState,
                                    alivePlayers: alive,
                                    enabledCustomPrompts,
                                    customRolePrompts
                                };
                                const messages = await werewolfSkill.generatePrompts(sheriff, promptContext, "请选择白天的发言方向（顺时针/逆时针）");
                                const { llm, provider } = getActorConfig(sheriff.actorId);
                                const responseText = await generateText(messages, llm, provider);
                                const result = parseLLMResponse(responseText || "{}");
                                direction = result?.direction === "RIGHT" ? "RIGHT" : "LEFT";
                            }

                            await addSystemLog(`警长决定从 ${direction === "LEFT" ? "左手边（顺时针）" : "右手边（逆时针）"} 开始发言。`);

                            const deadId = uniqueDeaths[0];
                            const startRefId = deadId || sheriff.id;

                            // Sort alive players based on startRefId
                            let startIdx = alive.findIndex(p => p.id === startRefId);
                            if (startIdx === -1) startIdx = 0;

                            let sortedQueue: number[] = [];
                            if (direction === "LEFT") {
                                sortedQueue = [
                                    ...alive.slice(startIdx + 1),
                                    ...alive.slice(0, startIdx + 1)
                                ].map(p => p.id);
                            } else {
                                const reversed = [...alive].reverse();
                                let revStartIdx = reversed.findIndex(p => p.id === startRefId);
                                sortedQueue = [
                                    ...reversed.slice(revStartIdx + 1),
                                    ...reversed.slice(0, revStartIdx + 1)
                                ].map(p => p.id);
                            }

                            // Sheriff speaks last (归票)
                            sortedQueue = sortedQueue.filter(id => id !== sheriff.id);
                            sortedQueue.push(sheriff.id);

                            setSpeakingQueue(sortedQueue);
                        } else {
                            // No Sheriff: random order
                            const startIdx = Math.floor(Math.random() * alive.length);
                            const queue = [...alive.slice(startIdx), ...alive.slice(0, startIdx)].map(p => p.id);
                            setSpeakingQueue(queue);
                            await addSystemLog(`从 ${alive[startIdx].id}号 开始发言。`);
                        }

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
                            let customInstruction = undefined;
                            if (godState.isPkRound && godState.pkPlayers?.includes(nextId)) {
                                customInstruction = "目前是投票平票后的 PK 发言环节。请发表你的【PK辩白发言】，说服其他玩家不要投你，并指出你认为谁是狼人。";
                            }
                            await generateTurn(player, customInstruction);
                        }
                        setSpeakingQueue(rest);
                    } else {
                        setIsProcessing(true);
                        try {
                            if (godState.isPkRound) {
                                await addSystemLog("PK发言结束，开始进行PK投票...");
                            } else {
                                await addSystemLog("发言结束，开始投票...");
                            }
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

                        // Determine voters and target candidates for PK logic
                        const isPkRound = !!(godState.isPkRound && godState.pkPlayers && godState.pkPlayers.length > 0);
                        const voters = isPkRound
                            ? alive.filter(p => !godState.pkPlayers!.includes(p.id))
                            : alive;
                        const validTargets = isPkRound
                            ? godState.pkPlayers!
                            : alive.map(p => p.id);

                        // Vote
                        await addSystemLog(isPkRound ? "正在收集所有玩家的 PK 投票，请稍候..." : "正在收集所有玩家的放逐投票，请解下/在警上的玩家做出决定...");
                        saveSnapshot();
                        await new Promise(r => setTimeout(r, 100)); // Yield thread to render logs

                        const results = await Promise.all(voters.map(async p => ({
                            voter: p.id,
                            target: await getAiVote(p, validTargets, GamePhase.VOTING)
                        })));

                        // Count votes for logic, Sheriff vote counts as 1.5
                        results.forEach(({ voter, target }) => {
                            if (target) {
                                const weight = voter === godState.sheriffId ? 1.5 : 1.0;
                                votes[target] = (votes[target] || 0) + weight;
                            }
                        });

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

                        const detailsLines = Object.entries(voteMap).map(([target, votersList]) => {
                            const count = votersList.reduce((acc, v) => acc + (v === godState.sheriffId ? 1.5 : 1.0), 0);
                            return `${target}号: ${votersList.join('、')} (共 ${count} 票)`;
                        });
                        if (abstained.length > 0) detailsLines.push(`弃票: ${abstained.join('、')}`);

                        const voteDetails = detailsLines.join('\n');
                        await addSystemLog(
                            isPkRound ? `PK投票结果:\n${voteDetails}` : `投票结果:\n${voteDetails}`, 
                            undefined, 
                            "投票统计完毕。"
                        );

                        let max = -1, victims: number[] = [];
                        for (const [pid, count] of Object.entries(votes)) {
                            if (count > max) { max = count; victims = [+pid]; }
                            else if (count === max) victims.push(+pid);
                        }

                        if (victims.length > 1) {
                            // Tie!
                            if (!isPkRound) {
                                // First tie: Enter PK round
                                await addSystemLog(`投票出现平票，${victims.join('号、')}号 票数相同。进入PK发言阶段。`);
                                setGodState(prev => ({
                                    ...prev,
                                    pkPlayers: victims,
                                    isPkRound: true
                                }));
                                setSpeakingQueue(victims);
                                setPhase(GamePhase.DAY_DISCUSSION);
                                saveSnapshot();
                                return;
                            } else {
                                // Second tie: Peace day
                                await addSystemLog(`PK投票再次平票，今天为平安日，无人出局。`);
                                setGodState(prev => ({
                                    ...prev,
                                    pkPlayers: [],
                                    isPkRound: false
                                }));
                                setPhase(GamePhase.LAST_WORDS);
                                setSpeakingQueue([]);
                                saveSnapshot();
                                return;
                            }
                        }

                        const final = victims.length === 1 ? victims[0] : null;

                        // Reset PK flags upon successful exile or peace day
                        setGodState(prev => ({
                            ...prev,
                            pkPlayers: [],
                            isPkRound: false
                        }));

                        if (final) {
                            await addSystemLog(`${final}号 被投票出局。`, undefined, undefined, undefined, [final]);
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

                            // If Sheriff is exiled, trigger badge transfer
                            if (godState.sheriffId === final) {
                                setPhase(GamePhase.SHERIFF_TRANS);
                                saveSnapshot();
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

                case GamePhase.SHERIFF_ELECT: {
                    setIsProcessing(true);
                    try {
                        const alive = players.filter(p => p.status === PlayerStatus.ALIVE);
                        const human = alive.find(p => p.isHuman);

                        if (godState.sheriffCandidates === undefined) {
                            // Instant heuristic for AI upper-campaign decisions to ensure zero latency and realism
                            const aiPlayers = alive.filter(p => !p.isHuman);
                            const aiDecisions = aiPlayers.map(p => {
                                let runProbability = 0.3; // Default Villager
                                if (p.role === Role.WEREWOLF) runProbability = 0.8;
                                else if (p.role === Role.SEER) runProbability = 1.0;
                                else if (p.role === Role.WITCH) runProbability = 0.4;
                                else if (p.role === Role.HUNTER) runProbability = 0.4;
                                else if (p.role === Role.GUARD) runProbability = 0.2;

                                const run = Math.random() < runProbability;
                                return { id: p.id, run };
                            });

                            let candidates: number[] = [];
                            aiDecisions.forEach(d => { if (d.run) candidates.push(d.id); });

                            // Check human decision
                            let humanDecided = false;
                            let humanRun = false;
                            if (human) {
                                if (userInputRef.current) {
                                    humanDecided = true;
                                    humanRun = !!userInputRef.current.runForSheriff;
                                    setUserInput(null);
                                } else {
                                    await addSystemLog("天亮了。第一天上午，开始竞选警长！请选择是否上警参选...");
                                    setSpeaker(human.id);
                                    saveSnapshot();
                                    return; // Pause and wait for human input
                                }
                            }

                            if (human && humanDecided && humanRun) {
                                candidates.push(human.id);
                            }

                            await addSystemLog("--- 警长竞选开始 ---");
                            for (const p of alive) {
                                const isRun = p.isHuman ? humanRun : aiDecisions.find(d => d.id === p.id)?.run;
                                if (isRun) {
                                    await addSystemLog(`${p.id}号 玩家选择参与警长竞选（上警）。`);
                                } else {
                                    await addSystemLog(`${p.id}号 玩家留在警下。`);
                                }
                            }

                            if (candidates.length === 0) {
                                await addSystemLog("无人参与竞选，本局警徽流失。");
                                setGodState(prev => ({ ...prev, sheriffId: null, sheriffCandidates: [], sheriffQuitters: [] }));
                                setPhase(GamePhase.DAY_ANNOUNCE);
                                saveSnapshot();
                                return;
                            } else if (candidates.length === 1) {
                                const winner = candidates[0];
                                await addSystemLog(`仅有 ${winner}号 玩家参选，自动当选为警长！`);
                                setGodState(prev => ({ ...prev, sheriffId: winner, sheriffCandidates: candidates, sheriffQuitters: [] }));
                                setPhase(GamePhase.DAY_ANNOUNCE);
                                saveSnapshot();
                                return;
                            } else if (candidates.length === alive.length) {
                                await addSystemLog("所有玩家均参与竞选（全员上警），警徽流失。");
                                setGodState(prev => ({ ...prev, sheriffId: null, sheriffCandidates: candidates, sheriffQuitters: [] }));
                                setPhase(GamePhase.DAY_ANNOUNCE);
                                saveSnapshot();
                                return;
                            }

                            setGodState(prev => ({
                                ...prev,
                                sheriffCandidates: candidates,
                                sheriffQuitters: []
                            }));

                            setSpeakingQueue(candidates);
                            saveSnapshot();
                        } else {
                            // Speeches round
                            const [nextId, ...rest] = speakingQueue;
                            if (nextId) {
                                const player = players.find(p => p.id === nextId);
                                if (player && player.status === PlayerStatus.ALIVE) {
                                    const result = await generateTurn(player);
                                    if (result?.quitCampaign) {
                                        setGodState(prev => ({
                                            ...prev,
                                            sheriffQuitters: [...(prev.sheriffQuitters || []), nextId]
                                        }));
                                        await addSystemLog(`${nextId}号 玩家选择退水（退出竞选）。`);
                                    }
                                }
                                setSpeakingQueue(rest);
                            } else {
                                setPhase(GamePhase.SHERIFF_VOTE);
                                saveSnapshot();
                            }
                        }
                    } finally {
                        setIsProcessing(false);
                    }
                    break;
                }

                case GamePhase.SHERIFF_VOTE: {
                    setIsProcessing(true);
                    try {
                        const alive = players.filter(p => p.status === PlayerStatus.ALIVE);
                        const candidates = godState.sheriffCandidates?.filter(c => !godState.sheriffQuitters?.includes(c)) || [];
                        const voters = alive.filter(p => !godState.sheriffCandidates?.includes(p.id));

                        if (candidates.length === 0) {
                            await addSystemLog("所有候选人均已退水，警徽流失。");
                            setGodState(prev => ({ ...prev, sheriffId: null }));
                            setPhase(GamePhase.DAY_ANNOUNCE);
                            saveSnapshot();
                            return;
                        } else if (candidates.length === 1) {
                            const winner = candidates[0];
                            await addSystemLog(`仅剩 ${winner}号 候选人，自动当选为警长！`);
                            setGodState(prev => ({ ...prev, sheriffId: winner }));
                            setPhase(GamePhase.DAY_ANNOUNCE);
                            saveSnapshot();
                            return;
                        }

                        if (voters.length === 0) {
                            await addSystemLog("警下无投票玩家（全员参选或退水），警徽流失。");
                            setGodState(prev => ({ ...prev, sheriffId: null }));
                            setPhase(GamePhase.DAY_ANNOUNCE);
                            saveSnapshot();
                            return;
                        }

                        await addSystemLog("开始进行警长选举投票，请警下玩家做出决定...");
                        saveSnapshot();
                        await new Promise(r => setTimeout(r, 100)); // Yield thread to render logs

                        const results = await Promise.all(voters.map(async p => ({
                            voter: p.id,
                            target: await getAiVote(p, candidates, GamePhase.SHERIFF_VOTE)
                        })));

                        const votes: Record<number, number> = {};
                        results.forEach(({ voter, target }) => { if (target) votes[target] = (votes[target] || 0) + 1; });

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

                        const detailsLines = Object.entries(voteMap).map(([target, votersList]) => {
                            return `${target}号: ${votersList.join('、')} (共 ${votersList.length} 票)`;
                        });
                        if (abstained.length > 0) detailsLines.push(`弃票: ${abstained.join('、')}`);

                        await addSystemLog(`警长选举投票结果:\n${detailsLines.join('\n')}`, undefined, "警长投票统计完毕。");

                        let max = -1, winners: number[] = [];
                        for (const [pid, count] of Object.entries(votes)) {
                            if (count > max) { max = count; winners = [+pid]; }
                            else if (count === max) winners.push(+pid);
                        }

                        if (winners.length > 1) {
                            await addSystemLog(`投票出现平票（${winners.join('号、')}号），警徽流失，本局无警长。`);
                            setGodState(prev => ({ ...prev, sheriffId: null }));
                        } else if (winners.length === 1) {
                            const winner = winners[0];
                            await addSystemLog(`恭喜 ${winner}号 玩家当选为本局警长！`);
                            setGodState(prev => ({ ...prev, sheriffId: winner }));
                        } else {
                            await addSystemLog("全员弃票，本局无警长。");
                            setGodState(prev => ({ ...prev, sheriffId: null }));
                        }

                        setPhase(GamePhase.DAY_ANNOUNCE);
                        saveSnapshot();
                    } finally {
                        setIsProcessing(false);
                    }
                    break;
                }

                case GamePhase.SHERIFF_TRANS: {
                    setIsProcessing(true);
                    try {
                        const deadSheriffId = godState.sheriffId;
                        if (deadSheriffId) {
                            const sheriff = players.find(p => p.id === deadSheriffId);
                            if (sheriff) {
                                setSpeaker(deadSheriffId);
                                let result: any = null;
                                if (sheriff.isHuman) {
                                    result = await waitForHumanInput();
                                } else {
                                    const promptContext = {
                                        phase: GamePhase.SHERIFF_TRANS,
                                        turnCount,
                                        players,
                                        logs,
                                        roleConfigStr: getRoleConfigStr(),
                                        godState,
                                        alivePlayers: players.filter(p => p.status === PlayerStatus.ALIVE),
                                        enabledCustomPrompts,
                                        customRolePrompts
                                    };
                                    const messages = await werewolfSkill.generatePrompts(sheriff, promptContext);
                                    const { llm, provider } = getActorConfig(sheriff.actorId);
                                    const responseText = await generateText(messages, llm, provider);
                                    result = parseLLMResponse(responseText || "{}");
                                }
                                setSpeaker(null);

                                const target = result?.actionTarget;
                                const alive = players.filter(p => p.status === PlayerStatus.ALIVE);
                                const isValidTarget = target && alive.some(p => p.id === target);

                                if (isValidTarget) {
                                    await addSystemLog(`前警长 ${deadSheriffId}号 将警徽移交给 ${target}号，${target}号 成为新警长。`);
                                    setGodState(prev => ({ ...prev, sheriffId: target }));
                                } else {
                                    await addSystemLog(`前警长 ${deadSheriffId}号 选择撕毁警徽，本局不再有警长。`);
                                    setGodState(prev => ({ ...prev, sheriffId: null }));
                                }
                            }
                        }

                        if (godState.pendingDeathId) {
                            setGodState(prev => ({ ...prev, pendingDeathId: null }));
                            
                            // Check Hunter
                            const deadHunter = players.find(p => godState.deathsTonight?.includes(p.id) && p.role === Role.HUNTER);
                            const hunterPoisoned = deadHunter && deadHunter.id === godState.witchPoison;

                            if (deadHunter && !hunterPoisoned) {
                                await addSystemLog(`猎人 ${deadHunter.id}号 倒牌，发动技能开枪。`);
                                setPhase(GamePhase.HUNTER_ACTION);
                                setSpeakingQueue([deadHunter.id]);
                                saveSnapshot();
                                return;
                            }

                            // Sunrise speech ordering
                            const alive = players.filter(p => p.status === PlayerStatus.ALIVE);
                            const sheriff = alive.find(p => p.id === godState.sheriffId);

                            if (sheriff) {
                                await addSystemLog(`请新警长 ${sheriff.id}号 决定从死者左手边或右手边开始发言。`);
                                let direction: "LEFT" | "RIGHT" = "LEFT";
                                if (sheriff.isHuman) {
                                    setSpeaker(sheriff.id);
                                    const result = await waitForHumanInput();
                                    setSpeaker(null);
                                    direction = result?.direction === "RIGHT" ? "RIGHT" : "LEFT";
                                } else {
                                    const promptContext = {
                                        phase: GamePhase.DAY_DISCUSSION,
                                        turnCount,
                                        players,
                                        logs,
                                        roleConfigStr: getRoleConfigStr(),
                                        godState,
                                        alivePlayers: alive,
                                        enabledCustomPrompts,
                                        customRolePrompts
                                    };
                                    const messages = await werewolfSkill.generatePrompts(sheriff, promptContext, "请选择白天的发言方向（顺时针/逆时针）");
                                    const { llm, provider } = getActorConfig(sheriff.actorId);
                                    const responseText = await generateText(messages, llm, provider);
                                    const result = parseLLMResponse(responseText || "{}");
                                    direction = result?.direction === "RIGHT" ? "RIGHT" : "LEFT";
                                }

                                await addSystemLog(`警长决定从 ${direction === "LEFT" ? "左手边（顺时针）" : "右手边（逆时针）"} 开始发言。`);

                                const deadId = godState.deathsTonight?.[0];
                                const startRefId = deadId || sheriff.id;

                                let startIdx = alive.findIndex(p => p.id === startRefId);
                                if (startIdx === -1) startIdx = 0;

                                let sortedQueue: number[] = [];
                                if (direction === "LEFT") {
                                    sortedQueue = [
                                        ...alive.slice(startIdx + 1),
                                        ...alive.slice(0, startIdx + 1)
                                    ].map(p => p.id);
                                } else {
                                    const reversed = [...alive].reverse();
                                    let revStartIdx = reversed.findIndex(p => p.id === startRefId);
                                    sortedQueue = [
                                        ...reversed.slice(revStartIdx + 1),
                                        ...reversed.slice(0, revStartIdx + 1)
                                    ].map(p => p.id);
                                }

                                sortedQueue = sortedQueue.filter(id => id !== sheriff.id);
                                sortedQueue.push(sheriff.id);

                                setSpeakingQueue(sortedQueue);
                            } else {
                                const startIdx = Math.floor(Math.random() * alive.length);
                                const queue = [...alive.slice(startIdx), ...alive.slice(0, startIdx)].map(p => p.id);
                                setSpeakingQueue(queue);
                                await addSystemLog(`从 ${alive[startIdx].id}号 开始发言。`);
                            }

                            setPhase(GamePhase.DAY_DISCUSSION);
                            saveSnapshot();
                        } else {
                            const exiledId = deadSheriffId;
                            if (exiledId) {
                                const votedOutPlayer = players.find(p => p.id === exiledId);
                                if (votedOutPlayer && votedOutPlayer.role === Role.HUNTER) {
                                    await addSystemLog(`猎人 ${votedOutPlayer.id}号 出局，可以发动技能。`);
                                    setPhase(GamePhase.HUNTER_ACTION);
                                    setSpeakingQueue([votedOutPlayer.id]);
                                    saveSnapshot();
                                    return;
                                }

                                await addSystemLog("请发表遗言。");
                                setPhase(GamePhase.LAST_WORDS);
                                setSpeakingQueue([exiledId]);
                                saveSnapshot();
                            }
                        }
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
                                hunterPrompt = `你被投票出局了。请发表你的【遗言】，并在发言末尾发动技能带走一名玩家。此外，你也可以选择放弃开枪（压枪）。`;
                            } else { // Died at night
                                hunterPrompt = `你出局了，发动猎人技能带走一人。此外，你也可以选择放弃开枪（压枪）。`;
                            }

                            const result = await generateTurn(hunter, hunterPrompt);
                            const shotTargetId = result?.actionTarget && targetIds.includes(result.actionTarget) ? result.actionTarget : null;


                            if (shotTargetId) {
                                setIsProcessing(true);
                                try {
                                    await addSystemLog(`猎人开枪，${shotTargetId}号 倒牌。`, undefined, undefined, undefined, [shotTargetId]);
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
                            } else {
                                // SKIP SHOOTING
                                setIsProcessing(true);
                                try {
                                    await addSystemLog("猎人选择不开枪。");
                                    if (wasVotedOut) {
                                        setTurnCount(t => t + 1);
                                        setPhase(GamePhase.NIGHT_START);
                                        await addSystemLog(`--- 第 ${turnCount + 1} 天 ---`);
                                    } else {
                                        const aliveForDiscussion = players.filter(p => p.status === PlayerStatus.ALIVE);
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
    }, [isAuto, isProcessing, phase, players, generateTurn, isReplay, logs, turnCount, godState, speakingQueue, isPlayingAudio, isTheater, addSystemLog, getAiVote, setPhase, setPlayers, setGodState, setSpeakingQueue, saveSnapshot, setIsProcessing, setIsAuto, checkWinCondition, saveGameArchive, setAreRolesVisible]);

    return { generateTurn };
};