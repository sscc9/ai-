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
    userInputAtom
} from '../atoms';
import { GamePhase, ROLE_INFO, PlayerStatus, PHASE_LABELS, Role, Player, GOD_ROLES, VILLAGER_ROLES } from '../types';
import { AudioService } from '../audio';
import { generateText, parseLLMResponse } from '../services/llm';
import { WerewolfSkill } from '../services/skills/werewolf/WerewolfSkill';

const werewolfSkill = new WerewolfSkill(); // Singleton skill instance

// --- AI Logic Hook (The God Engine) ---
export const useGameEngine = () => {
    const [phase, setPhase] = useAtom(gamePhaseAtom) as any;
    const [players, setPlayers] = useAtom(playersAtom) as any;
    const [logs, setLogs] = useAtom(logsAtom) as any;
    const [isAuto, setIsAuto] = useAtom(isAutoPlayAtom) as any;
    const [isProcessing, setIsProcessing] = useAtom(isProcessingAtom) as any;
    const setSpeaker = useSetAtom(currentSpeakerIdAtom) as any;
    const saveSnapshot = useSetAtom(saveSnapshotAtom) as any;
    const [godState, setGodState] = useAtom(godStateAtom) as any;
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

    const [userInput, setUserInput] = useAtom(userInputAtom) as any;
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
    const getAiVote = useCallback(async (player: Player, validTargets: number[]): Promise<number | null> => {
        try {
            if (player.isHuman) {
                setSpeaker(player.id);
                const result = await waitForHumanInput();
                setSpeaker(null);
                return result?.actionTarget && validTargets.includes(result.actionTarget) ? result.actionTarget : null;
            }

            const currentTurnLogs = logs.filter(l => l.turn <= turnCount && (!l.visibleTo || l.visibleTo.includes(player.id)));
            const currentTurnText = currentTurnLogs.map(l => l.isSystem ? `[系统]: ${l.content}` : `[${l.speakerId}号]: ${l.content}`).join('\n');

            const { llm, provider } = getActorConfig(player.actorId);
            const alivePlayers = players.filter(p => p.status === PlayerStatus.ALIVE);

            // --- SKILL INTEGRATION (VOTING) ---
            const context = {
                phase: GamePhase.VOTING,
                turnCount,
                players,
                logs,
                roleConfigStr: getRoleConfigStr(),
                godState,
                alivePlayers,
                currentTurnLogs
            };

            const messages = await werewolfSkill.generatePrompts(player, context);
            const responseText = await generateText(messages, llm, provider);
            const result = parseLLMResponse(responseText || "{}");

            if (result && result.actionTarget && validTargets.includes(result.actionTarget)) return result.actionTarget;
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
                    currentTurnLogs
                };

                const messages = await werewolfSkill.generatePrompts(player, context, actionInstruction);
                const responseText = await generateText(messages, llm, provider);
                result = parseLLMResponse(responseText || "{}");
            }

            const speech = result?.speak || result?.speech || "...";

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
                        // Delay before wolves
                        await new Promise(r => setTimeout(r, Math.random() * 2000 + 1500));

                        setPhase(GamePhase.WEREWOLF_ACTION);
                        setGodState({ wolfTarget: null, seerCheck: null, witchSave: false, witchPoison: null, guardProtect: null, deathsTonight: [] });
                        saveSnapshot();

                        const wolves = players.filter(p => p.role === Role.WEREWOLF);
                        await addSystemLog("狼人请睁眼。", wolves.map(w => w.id), undefined, GamePhase.WEREWOLF_ACTION);
                    } finally {

                        setIsProcessing(false);
                    }
                    break;

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
                                hunterPrompt = `你被投票出局了。请发表你的【遗言】，并在发言末尾发动技能带走一名玩家。此外，你也可以选择放弃开枪（压枪）。`;
                            } else { // Died at night
                                hunterPrompt = `你出局了，发动猎人技能带走一人。此外，你也可以选择放弃开枪（压枪）。`;
                            }

                            const result = await generateTurn(hunter, hunterPrompt);
                            const shotTargetId = result?.actionTarget && targetIds.includes(result.actionTarget) ? result.actionTarget : null;


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