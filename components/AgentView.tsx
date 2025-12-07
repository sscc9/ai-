
import React, { useState, useEffect, useRef } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import { clsx } from 'clsx';
import { agentMessagesAtom, appScreenAtom, globalApiConfigAtom, actorProfilesAtom, llmPresetsAtom } from '../store';
import { AgentMessage } from '../types';
import { generateText } from '../services/llm';

const AgentView = () => {
    const setScreen = useSetAtom(appScreenAtom);
    const [messages, setMessages] = useAtom(agentMessagesAtom);
    const [input, setInput] = useState("");
    const [isThinking, setIsThinking] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const config = useAtomValue(globalApiConfigAtom);
    const actors = useAtomValue(actorProfilesAtom);
    const llmPresets = useAtomValue(llmPresetsAtom);

    // Auto scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isThinking]);

    const handleSend = async () => {
        if (!input.trim()) return;
        const userMsg: AgentMessage = { id: Date.now().toString(), role: 'user', content: input, timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setIsThinking(true);

        try {
            const narrator = actors.find(a => a.id === config.narratorActorId) || actors[0];
            const llm = llmPresets.find(l => l.id === narrator.llmPresetId) || llmPresets[0];
            const apiMsgs = [...messages.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: input }];
            const text = await generateText(apiMsgs, llm);

            if (text) setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', content: text, timestamp: Date.now() }]);
        } catch (e) {
            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', content: "连接 AI 失败。", timestamp: Date.now() }]);
        } finally {
            setIsThinking(false);
        }
    };

    const isSendingDisabled = !input.trim() || isThinking;

    return (
        <div
            className="absolute inset-0 h-full w-full bg-slate-50 flex flex-col relative overflow-hidden font-sans z-50"
            style={{ backgroundColor: '#f8fafc' }}
        >
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-20%] right-[-20%] w-[800px] h-[800px] bg-emerald-100/40 rounded-full blur-[120px] mix-blend-multiply"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-blue-100/40 rounded-full blur-[120px] mix-blend-multiply"></div>
            </div>

            <div className="flex items-center h-16 bg-white/70 backdrop-blur-md border-b border-slate-200 px-6 sticky top-0 z-20 shadow-sm justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">✨</span>
                    <h2 className="text-lg font-black text-slate-800 tracking-tight">上帝助手</h2>
                </div>
                <button onClick={() => setScreen('HOME')} className="text-slate-500 font-bold hover:text-slate-800 transition-colors">关闭</button>
            </div>

            <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-6 relative z-10 custom-scrollbar">
                {messages.map(m => (
                    <div key={m.id} className={clsx("flex flex-col max-w-[85%]", m.role === 'user' ? "ml-auto items-end" : "mr-auto items-start")}>
                        <div className={clsx(
                            "p-4 rounded-2xl text-sm leading-relaxed shadow-sm border",
                            m.role === 'user'
                                ? "bg-indigo-600 text-white rounded-tr-none border-indigo-600"
                                : "bg-white text-slate-700 rounded-tl-none border-slate-100"
                        )}>
                            {m.content}
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 px-1">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                ))}
                {isThinking && (
                    <div className="flex flex-col max-w-[85%] mr-auto items-start animate-pulse">
                        <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm flex gap-1">
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-100"></div>
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-200"></div>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-4 bg-white/80 backdrop-blur-md border-t border-slate-200 relative z-20 pb-safe">
                <div className="flex gap-3 max-w-4xl mx-auto">
                    <input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 shadow-inner"
                        placeholder="询问规则或寻求建议..."
                        style={{ backgroundColor: '#f8fafc' }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={isSendingDisabled}
                        className={clsx(
                            "text-white px-6 rounded-xl font-bold transition-all active:scale-95 flex items-center",
                            isSendingDisabled
                                ? "bg-slate-300 cursor-not-allowed"
                                : "bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200"
                        )}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AgentView;
