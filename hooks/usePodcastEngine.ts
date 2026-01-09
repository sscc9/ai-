import { useEffect, useCallback, useRef } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
    podcastPhaseAtom,
    podcastConfigAtom,
    podcastLogsAtom,
    isAutoPlayAtom,
    isProcessingAtom,
    actorProfilesAtom,
    llmPresetsAtom,
    llmProvidersAtom,
    ttsPresetsAtom,
    globalApiConfigAtom,
    isPlayingAudioAtom,
    timelineAtom,
    isTheaterModeAtom,
    isReplayModeAtom
} from '../atoms';
import { PodcastPhase, GamePhase } from '../types';
import { AudioService } from '../audio';
import { generateText, parseLLMResponse } from '../services/llm';
import { savePodcastArchiveAtom } from '../store';

export const usePodcastEngine = () => {
    const [phase, setPhase] = useAtom(podcastPhaseAtom);
    const [logs, setLogs] = useAtom(podcastLogsAtom);
    const config = useAtomValue(podcastConfigAtom);
    const isAuto = useAtomValue(isAutoPlayAtom);
    const [isProcessing, setIsProcessing] = useAtom(isProcessingAtom);
    const [isPlayingAudio, setIsPlayingAudio] = useAtom(isPlayingAudioAtom);

    const actors = useAtomValue(actorProfilesAtom);
    const llmPresets = useAtomValue(llmPresetsAtom);
    const llmProviders = useAtomValue(llmProvidersAtom);
    const ttsPresets = useAtomValue(ttsPresetsAtom);
    const globalConfig = useAtomValue(globalApiConfigAtom);
    const [timeline, setTimeline] = useAtom(timelineAtom);
    const saveArchive = useSetAtom(savePodcastArchiveAtom);

    const isTheater = useAtomValue(isTheaterModeAtom);
    const isReplay = useAtomValue(isReplayModeAtom);

    const logIdCounter = useRef(0);

    const getActorConfig = useCallback((actorId: string) => {
        // In Podcast Mode, actorId is mapped to roles (HOST/GUEST)
        // host -> config.hostLlmPreset, etc.
        let llmId = '';
        let ttsId = '';
        let voiceId = '';
        let actName = '';

        if (actorId === 'host') {
            llmId = config.hostLlmPresetId || llmPresets[0]?.id;
            ttsId = config.hostTtsPresetId || ttsPresets[0]?.id;
            voiceId = config.hostVoiceId || 'zh-CN-YunxiNeural';
            actName = config.hostName;
        } else if (actorId === 'guest1') {
            llmId = config.guest1LlmPresetId || llmPresets[0]?.id;
            ttsId = config.guest1TtsPresetId || ttsPresets[0]?.id;
            voiceId = config.guest1VoiceId || 'zh-CN-XiaoxiaoNeural';
            actName = config.guest1Name;
        } else {
            // Fallback for system logic or other IDs
            const actor = actors.find(a => a.id === actorId) || actors[0];
            llmId = actor.llmPresetId;
            ttsId = actor.ttsPresetId;
            voiceId = actor.voiceId;
            actName = actor.name;
        }

        const llm = llmPresets.find(p => p.id === llmId) || llmPresets[0];
        const provider = llmProviders.find(p => p.id === llm.providerId) || llmProviders[0];
        const tts = ttsPresets.find(p => p.id === ttsId) || ttsPresets[0];

        // Mock actor object for compatibility
        const actor = {
            id: actorId,
            name: actName,
            llmPresetId: llmId,
            ttsPresetId: ttsId,
            voiceId: voiceId,
            stylePrompt: ''
        };

        return { actor, llm, provider, tts };
    }, [actors, llmPresets, llmProviders, ttsPresets, config]);

    const addLog = useCallback(async (
        actorId: string,
        content: string,
        customName?: string,
        isSystem: boolean = false
    ) => {
        const { actor, tts } = getActorConfig(actorId);
        const uniqueSuffix = `${Date.now()}-${logIdCounter.current++}`;
        const sharedId = `pod-${phase}-${actorId}-${uniqueSuffix}`;

        setLogs(prev => [...prev, {
            id: sharedId,
            turn: 1,
            phase: GamePhase.DAY_DISCUSSION, // Map to GamePhase for component compatibility
            speakerId: isSystem ? undefined : 0, // Guest mapping might need adjustment
            speakerName: customName, // Store the custom name for display
            content,
            timestamp: Date.now(),
            isSystem
        }]);

        const audioKey = `audio_pod_${sharedId}`;

        setTimeline(prev => [...prev, {
            id: sharedId,
            type: isSystem ? 'NARRATOR' : 'PLAYER',
            speakerName: customName || actor.name,
            text: content,
            voiceId: actor.voiceId,
            ttsProvider: tts.provider,
            ttsModel: tts.modelId,
            ttsBaseUrl: tts.baseUrl,
            ttsApiKey: tts.apiKey,
            audioKey,
            timestamp: Date.now()
        }]);

        if (globalConfig.enabled && !isReplay && !isTheater) {
            setIsPlayingAudio(true);
            try {
                await AudioService.getInstance().playOrGenerate(
                    content,
                    actor.voiceId,
                    audioKey,
                    tts
                );
            } catch (e) {
                console.error("Audio Playback Error:", e);
            } finally {
                setIsPlayingAudio(false);
            }
        } else {
            await new Promise(r => setTimeout(r, 2000));
        }
    }, [phase, getActorConfig, globalConfig.enabled, isReplay, isTheater, setLogs, setTimeline, setIsPlayingAudio]);

    const runTurn = useCallback(async () => {
        if (isProcessing || isPlayingAudio || isReplay || isTheater) return;
        setIsProcessing(true);

        try {
            switch (phase) {
                case PodcastPhase.INTRO: {
                    const hostActorId = 'host';
                    const { llm, provider } = getActorConfig(hostActorId);

                    const systemPrompt = `你正在参与播客节目，你的身份是主持人。
本场职员表：
- 主持人：${config.hostName}
- 嘉宾：${config.guest1Name}

你的系统指令：${config.hostSystemPrompt}

节目主题：“${config.topic}”
节目大纲（请务必严格按照此流程推进）：
${config.outline}

任务：请为这期节目写一段开场白，正式介绍你自己和嘉宾（${config.guest1Name}），并根据大纲引出第一个话题。
要求：热情、专业感强、吸引人。直接输出开场白内容。`;

                    const response = await generateText([{ role: 'system', content: systemPrompt }], llm, provider);
                    await addLog(hostActorId, response, config.hostName);
                    setPhase(PodcastPhase.GUEST_SPEAK);
                    break;
                }

                case PodcastPhase.GUEST_SPEAK: {
                    const actorId = 'guest1';
                    const myName = config.guest1Name;
                    const myPrompt = config.guest1SystemPrompt;
                    const { llm, provider } = getActorConfig(actorId);

                    const history = logs
                        .filter(l => !l.isSystem)
                        .map(l => {
                            const event = timeline.find(t => t.id === l.id);
                            const name = event ? event.speakerName : '未知';
                            return `${name}: ${l.content}`;
                        })
                        .slice(-6)
                        .join('\n');

                    const systemPrompt = `你正在参与关于“${config.topic}”的播客讨论。
你的名字：${myName}
你的身份：嘉宾
主持人：${config.hostName}
你的系统指令：${myPrompt}

请始终保持你的人设，通过自然的对话表达观点。
节目大纲：
${config.outline}
`;
                    const userPrompt = `目前谈话背景（最近几句发言）：
${history}

你是 ${myName}，请接话。
要求：
1. 回应主持人的观点或提问。
2. 说话要有特点，符合你的系统指令。
3. 语气要自然，字数控制在100-200字之间。
直接输出你的发言内容。`;

                    const response = await generateText([
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ], llm, provider);

                    await addLog(actorId, response, myName);

                    // Always return control to host to decide flow, unless safety limit reached
                    const totalTurns = logs.filter(l => !l.isSystem).length;
                    if (totalTurns >= 50) {
                        setPhase(PodcastPhase.OUTRO);
                    } else {
                        setPhase(PodcastPhase.HOST_SPEAK);
                    }
                    break;
                }

                case PodcastPhase.HOST_SPEAK: {
                    const hostActorId = 'host';
                    const { llm, provider } = getActorConfig(hostActorId);

                    const history = logs
                        .filter(l => !l.isSystem)
                        .map(l => {
                            const event = timeline.find(t => t.id === l.id);
                            const name = event ? event.speakerName : '未知';
                            return `${name}: ${l.content}`;
                        })
                        .slice(-10) // Provide more context for flow control
                        .join('\n');

                    const systemPrompt = `你正在参与播客节目，你的身份是主持人（${config.hostName}）。
嘉宾：${config.guest1Name}
你的系统指令：${config.hostSystemPrompt}

节目主题：“${config.topic}”
节目大纲（必须严格执行）：
${config.outline}

【核心控场原则：深度优先，拒绝流水账】
1. **不要急于推进大纲**：每个大纲点至少需要与嘉宾进行 2-3 轮的深入互谈（Unless 嘉宾明确表示无话可说）。
2. **要像好奇宝宝一样追问**：当嘉宾抛出一个观点时，不要直接说“好的，下一个话题”。要针对他的观点进行追问、反驳、举例或要求详述。
    - 例如：“除此之外呢？”“具体是指什么？”“这是否意味着……”
3. **保持对话的自然流动**：不要让对话显得像在完成任务清单。过渡要自然。

【判断逻辑】
- **当前话题刚开始/聊得正嗨** -> 继续追问，挖掘细节，提出有趣的延伸问题。
- **当前话题已聊透（双方都已充分表达观点，且重复）** -> 优雅地做一个小总结，然后自然地引出大纲的下一个环节。
- **大纲所有内容均已聊完** -> 输出 [PODCAST_END] 并结束语。`;

                    const userPrompt = `目前对话历史：
${history}

你是主持人 ${config.hostName}。
请判断当前话题的讨论深度。
- 如果还能聊，请务必追问或发表独特见解（不要急着换话题！）。
- 如果真的聊干了，再推进到下一个大纲点。

直接输出你的发言内容。`;

                    let response = await generateText([
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ], llm, provider);

                    const shouldEnd = response.includes('[PODCAST_END]');
                    response = response.replace('[PODCAST_END]', '').trim(); // Remove tag from display

                    await addLog(hostActorId, response, config.hostName);

                    // Safety limit check
                    const totalTurns = logs.filter(l => !l.isSystem).length;

                    if (shouldEnd || totalTurns >= 50) {
                        setPhase(PodcastPhase.OUTRO);
                    } else {
                        setPhase(PodcastPhase.GUEST_SPEAK);
                    }
                    break;
                }

                case PodcastPhase.OUTRO: {
                    const hostActorId = globalConfig.narratorActorId;
                    const { llm, provider } = getActorConfig(hostActorId);

                    const history = logs
                        .filter(l => !l.isSystem)
                        .map(l => {
                            const event = timeline.find(t => t.id === l.id);
                            const name = event ? event.speakerName : '未知';
                            return `${name}: ${l.content}`;
                        })
                        .slice(-6)
                        .join('\n');

                    const systemPrompt = `你正在参与播客节目，你的身份是主持人（${config.hostName}）。
嘉宾：${config.guest1Name}
你的系统指令：${config.hostSystemPrompt}
主题：“${config.topic}”
                    
刚才的讨论内容：
${history}

请为这期节目写一段结案陈词，总结刚才的精彩讨论，感谢嘉宾（${config.guest1Name}），并向听众告别。
要求：得体、升华主题、富有感染力。直接输出总结内容。`;

                    const response = await generateText([{ role: 'system', content: systemPrompt }], llm, provider);
                    await addLog(hostActorId, response, config.hostName);
                    setPhase(PodcastPhase.FINISHED);
                    break;
                }

                case PodcastPhase.FINISHED:
                    await saveArchive();
                    setPhase(PodcastPhase.CONFIG); // Loop back or stop
                    break;
            }
        } catch (e) {
            console.error("Podcast Engine Error", e);
        } finally {
            setIsProcessing(false);
        }
    }, [phase, isProcessing, isPlayingAudio, isReplay, isTheater, config, globalConfig, logs, timeline, getActorConfig, addLog, setPhase, setIsProcessing, saveArchive]);

    useEffect(() => {
        if (isAuto && !isProcessing && !isPlayingAudio && phase !== PodcastPhase.CONFIG && phase !== PodcastPhase.FINISHED) {
            const timer = setTimeout(runTurn, 1000);
            return () => clearTimeout(timer);
        }
    }, [isAuto, isProcessing, isPlayingAudio, phase, runTurn]);

    return { runTurn };
};
