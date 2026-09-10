import React, { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { useAtomValue } from 'jotai';
import { replayPerspectiveAtom, isTheaterModeAtom, playersAtom, isPortraitModeAtom } from '../store';
import { Role, GamePhase } from '../types';

interface LogItemProps {
    log: any;
    viewerId?: number;
    isPortrait?: boolean;
}

const cleanContent = (text: string) => {
    if (!text) return "";
    return text.replace(/[\(（][^\)）]*[\)）]/g, '').trim();
};

const LogItemComponent: React.FC<LogItemProps> = ({ log, viewerId, isPortrait = false }) => {
    const [isThoughtOpen, setIsThoughtOpen] = useState(false);

    const perspective = useAtomValue(replayPerspectiveAtom);
    const isReplay = useAtomValue(isTheaterModeAtom);
    const players = useAtomValue(playersAtom);

    // --- Visibility Check ---
    let isVisible = true;

    if (isReplay) {
        // Replay Mode Filtering
        if (perspective !== 'GOD') {
            // 1. Private Messages
            if (log.visibleTo) {
                if (perspective === 'GOOD') isVisible = false;
                else if (perspective === 'WOLF') {
                    const wolfIds = players.filter(p => p.role === Role.WEREWOLF).map(p => p.id);
                    isVisible = log.visibleTo.some((id: number) => wolfIds.includes(id));
                }
            }

            // 2. System Messages (Phases)
            if (log.isSystem) {
                const p = log.phase;
                if (perspective === 'GOOD') {
                    if (p === GamePhase.WEREWOLF_ACTION ||
                        p === GamePhase.SEER_ACTION ||
                        p === GamePhase.WITCH_ACTION ||
                        p === GamePhase.GUARD_ACTION) {
                        isVisible = false;
                    }
                }
                if (perspective === 'WOLF') {
                    if (p === GamePhase.SEER_ACTION ||
                        p === GamePhase.WITCH_ACTION ||
                        p === GamePhase.GUARD_ACTION) {
                        isVisible = false;
                    }
                }
            }
        }
    } else {
        // Live Mode (including with Human Player)
        const humanPlayer = players.find(p => p.isHuman);

        if (humanPlayer) {
            // 1. Private Messages visibility
            if (log.visibleTo && !log.visibleTo.includes(humanPlayer.id)) {
                isVisible = false;
            }

            // 2. System Messages (Phases) filtering for Human
            if (log.isSystem && isVisible) {
                const p = log.phase;
                if (humanPlayer.role !== Role.WEREWOLF) {
                    if (p === GamePhase.WEREWOLF_ACTION) isVisible = false;
                }
                // Good people (including Seer/Witch) don't see each other's actions
                if (p === GamePhase.SEER_ACTION && humanPlayer.role !== Role.SEER) isVisible = false;
                if (p === GamePhase.WITCH_ACTION && humanPlayer.role !== Role.WITCH) isVisible = false;
                if (p === GamePhase.GUARD_ACTION && humanPlayer.role !== Role.GUARD) isVisible = false;

                // Special case: "xxx 请睁眼" should be visible only to that role
                // But usually we just filter the whole phase's system logs for non-roles.
            }
        } else if (log.visibleTo && viewerId && !log.visibleTo.includes(viewerId)) {
            isVisible = false;
        }
    }

    if (!isVisible) return null;

    const displayContent = cleanContent(log.content);
    const finalContent = displayContent || log.content;

    return (
        <div className={clsx(
            "mb-4",
            log.isSystem ? "text-center my-6" : "text-left",
            log.visibleTo ? "opacity-80 border-l-2 border-purple-500 pl-3" : ""
        )}>
            {log.isSystem ? (
                <div className="inline-block px-4 py-1 rounded-full bg-current/10 text-sm font-bold tracking-wider opacity-80 whitespace-pre-wrap">
                    {finalContent}
                    {log.visibleTo && <span className="text-[10px] ml-2 text-purple-400">(仅部分可见)</span>}
                </div>
            ) : (
                <div className="flex gap-3 group">
                    <div className={clsx(
                        "flex-none rounded-full bg-gray-500 overflow-hidden transform-gpu",
                        isPortrait ? "w-6 h-6" : "w-8 h-8"
                    )}>
                        <img
                            src={`https://picsum.photos/seed/${log.speakerId ? log.speakerId + 100 : 0}/50`}
                            className="w-full h-full object-cover"
                            alt={`Player ${log.speakerId}`}
                        />
                    </div>
                    <div className="flex-1">
                        <div className={clsx(
                            "opacity-50 mb-1 flex items-center gap-2",
                            isPortrait ? "text-[10px]" : "text-xs"
                        )}>
                            <span>{log.speakerName ? log.speakerName : `${log.speakerId}号玩家`}</span>
                            {log.visibleTo && <span className="text-purple-400 text-[10px]">[私聊]</span>}
                        </div>
                        <div className={clsx(
                            "leading-relaxed font-medium whitespace-pre-wrap",
                            isPortrait ? "text-base" : "text-lg md:text-xl"
                        )}>
                            {finalContent}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Optimization: Memoize LogItem to prevent re-rendering of existing logs when new logs are added
export const LogItem = React.memo(LogItemComponent);

export const AutoScrollLog = ({ logs, className, viewerId }: { logs: any[], className?: string, viewerId?: number }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const isPortrait = useAtomValue(isPortraitModeAtom);
    const [hasNewMessages, setHasNewMessages] = useState(false);
    const isAtBottomRef = useRef(true);
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const prevLogsLengthRef = useRef(logs.length);

    // 检查用户是否处于最新消息位置（距底部 70px 内）
    const checkIfAtBottom = () => {
        const container = scrollRef.current;
        if (!container) return true;
        const threshold = 70;
        const isBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
        isAtBottomRef.current = isBottom;
        if (isBottom) {
            setHasNewMessages(false);
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
                hideTimeoutRef.current = null;
            }
        }
        return isBottom;
    };

    const handleScroll = () => {
        checkIfAtBottom();
    };

    const scrollToBottom = (smooth = true) => {
        const container = scrollRef.current;
        if (!container) return;
        setHasNewMessages(false);
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }
        container.scrollTo({
            top: container.scrollHeight,
            behavior: smooth ? 'smooth' : 'auto'
        });
        isAtBottomRef.current = true;
    };

    useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;

        // 仅当增加了新日志时响应
        if (logs.length > prevLogsLengthRef.current) {
            if (isAtBottomRef.current) {
                // 原本就在底部：正常跟随最新消息自动向下滚动
                const lastChild = container.lastElementChild as HTMLElement;
                if (lastChild && lastChild.offsetHeight > 150) {
                    container.scrollTo({ top: lastChild.offsetTop, behavior: 'smooth' });
                } else {
                    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                }
            } else {
                // 用户正在向上翻看历史消息：不打扰用户，浮出底部新消息提示
                setHasNewMessages(true);
                if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
                // 5 秒后自动消失
                hideTimeoutRef.current = setTimeout(() => {
                    setHasNewMessages(false);
                }, 5000);
            }
        }
        prevLogsLengthRef.current = logs.length;
    }, [logs]);

    useEffect(() => {
        return () => {
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        };
    }, []);

    return (
        <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
            <div 
                ref={scrollRef} 
                onScroll={handleScroll}
                className={clsx("flex-1 overflow-y-auto custom-scrollbar scroll-smooth", className)}
            >
                {logs.length === 0 ? (
                    <div className="h-full flex items-center justify-center opacity-50 text-xl">
                        等待记录...
                    </div>
                ) : (
                    logs.map((log) => <LogItem key={log.id} log={log} viewerId={viewerId} isPortrait={isPortrait} />)
                )}
            </div>

            {/* 浮动新消息提醒按钮 */}
            {hasNewMessages && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <button
                        onClick={() => scrollToBottom(true)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-semibold shadow-lg shadow-indigo-500/30 transition-all border border-indigo-400/30 cursor-pointer select-none"
                    >
                        <span>有新发言</span>
                        <svg className="w-3.5 h-3.5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
};