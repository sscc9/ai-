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
                    const hostActorId = globalConfig.narratorActorId;
                    const { llm, provider } = getActorConfig(hostActorId);

                    const systemPrompt = `你正在参与播客节目，你的身份是主持人。
本场职员表：
- 主持人：${config.hostName}
- 嘉宾：${config.guest1Name}

你的系统指令：${config.hostSystemPrompt}

今天的播客主题是：“${config.topic}”。
请为这期节目写一段开场白，正式介绍你自己和嘉宾（${config.guest1Name}），并引出主题。
要求：热情、专业感强、吸引人。直接输出开场白内容。`;

                    const response = await generateText([{ role: 'system', content: systemPrompt }], llm, provider);
                    await addLog(hostActorId, response, config.hostName);
                    setPhase(PodcastPhase.GUEST_SPEAK);
                    break;
                }

                case PodcastPhase.GUEST_SPEAK: {
                    const actorId = config.guest1ActorId;
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

                    const totalTurns = logs.filter(l => !l.isSystem).length;
                    if (totalTurns >= 8) { // End after ~8 total turns
                        setPhase(PodcastPhase.OUTRO);
                    } else {
                        setPhase(PodcastPhase.HOST_SPEAK);
                    }
                    break;
                }

                case PodcastPhase.HOST_SPEAK: {
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
主题：“${config.topic}”`;

                    const userPrompt = `目前谈话背景：
${history}

你是主持人 ${config.hostName}，请接话。
要求：
1. 承接嘉宾的观点，进行追问、总结或转换角度。
2. 保持主持人控场的感觉，引导话题深入。
3. 幽默风趣。
直接输出你的发言内容。`;

                    const response = await generateText([
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ], llm, provider);

                    await addLog(hostActorId, response, config.hostName);

                    const totalTurns = logs.filter(l => !l.isSystem).length;
                    if (totalTurns >= 8) {
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
