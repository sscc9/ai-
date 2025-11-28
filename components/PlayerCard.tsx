
import React, { useState, useEffect, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { clsx } from 'clsx';
import { playersAtom, currentSpeakerIdAtom, gamePhaseAtom, actorProfilesAtom, areRolesVisibleAtom, replayPerspectiveAtom, isReplayModeAtom } from '../store';
import { ROLE_INFO, Role, GamePhase, PlayerStatus } from '../types';

interface PlayerCardProps { seat: number; isTop: boolean; }

const PlayerCard: React.FC<PlayerCardProps> = ({ seat, isTop }) => {
    const players = useAtomValue(playersAtom);
    const currentSpeakerId = useAtomValue(currentSpeakerIdAtom);
    const phase = useAtomValue(gamePhaseAtom);
    const actors = useAtomValue(actorProfilesAtom);
    const showRolesGlobal = useAtomValue(areRolesVisibleAtom);
    const perspective = useAtomValue(replayPerspectiveAtom);
    // FIX: Use isReplayModeAtom (static state) instead of isTheaterModeAtom (engine state) to prevent UI jumps
    const isReplayMode = useAtomValue(isReplayModeAtom);
    
    const [imgLoaded, setImgLoaded] = useState(false);

    // Animation Delay Logic
    const delay = useMemo(() => Math.random() * 800, []);
    const animationClass = isTop ? 'animate-fly-in-top' : 'animate-fly-in-bottom';

    const player = players.find(p => p.seatNumber === seat);

    useEffect(() => {
        setImgLoaded(false);
    }, [player?.avatarSeed]);
    
    if (!player) return <div className="w-12 h-12 sm:w-16 sm:h-16 mx-0.5 opacity-0"></div>;

    const actor = actors.find(p => p.id === player.actorId);

    const isDead = player.status !== PlayerStatus.ALIVE;
    const isSpeaking = currentSpeakerId === player.id;
    
    // --- Visibility Logic ---
    let shouldShowRole = false;

    // Check if game is over (Review Mode) - Always reveal
    const isGameOver = phase === GamePhase.GAME_REVIEW || phase === GamePhase.GAME_OVER;

    if (isGameOver) {
        shouldShowRole = true;
    } else if (isReplayMode) {
        // Replay Mode: Stricter rules. 
        // Dead players do NOT automatically reveal unless it's Game Over.
        if (perspective === 'GOD') {
            shouldShowRole = true;
        } else if (perspective === 'WOLF') {
            shouldShowRole = player.role === Role.WEREWOLF;
        } else {
            // GOOD perspective: Only see known info (usually nothing specific in replay unless self, skipping for simplicity)
            shouldShowRole = false;
        }
    } else {
        // Live Game
        shouldShowRole = showRolesGlobal;
    }

    // Display Logic
    const displayLabel = shouldShowRole ? ROLE_INFO[player.role].label : null;
    const displayColor = shouldShowRole ? ROLE_INFO[player.role].color : "";
    
    // Highlight wolves during action ONLY if visible
    const isWolfAction = player.role === Role.WEREWOLF && phase === GamePhase.WEREWOLF_ACTION;
    const showWolfBorder = shouldShowRole && isWolfAction;
    
    const avatarUrl = `https://picsum.photos/seed/${player.avatarSeed}/200`;

    return (
        <div 
            className={clsx(
                "flex flex-col items-center justify-start mx-0.5 md:mx-1.5 lg:mx-3 transition-all duration-500 relative group", 
                animationClass,
                isDead ? "grayscale opacity-60" : "cursor-pointer", 
                isSpeaking ? "z-30 scale-105 sm:scale-110" : "hover:scale-105 z-10",
                isTop ? "origin-top" : "origin-bottom"
            )}
            style={{ 
                animationDelay: `${delay}ms`,
                animationFillMode: 'backwards' 
            }}
        >
            {/* Avatar Circle */}
            <div className={clsx(
                "relative rounded-full shadow-lg overflow-visible transition-all duration-300 bg-slate-200",
                "w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24", // Adjusted sizes for mobile fit
                // Replace thick border with ring/shadow
                isSpeaking ? "ring-2 ring-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.6)]" : 
                showWolfBorder ? "ring-2 ring-red-500 shadow-[0_0_20px_rgba(239,68,68,0.6)]" : 
                "ring-2 ring-slate-100/50 shadow-md"
            )}>
                {/* Image Container (Inner clip) */}
                <div className="w-full h-full rounded-full overflow-hidden relative bg-slate-300 isolate">
                    {!imgLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center animate-pulse">
                            <span className="text-slate-500 text-xs font-bold">...</span>
                        </div>
                    )}
                    <img 
                        src={avatarUrl} 
                        alt={`${player.id}号`} 
                        className={clsx("w-full h-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
                        onLoad={() => setImgLoaded(true)}
                        loading="eager" 
                    />
                    
                    {/* Gradient Overlay for contrast - Made slightly lighter since number is now centered */}
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent pointer-events-none z-0"></div>

                    {/* Dead Overlay */}
                    {isDead && (
                        <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center z-10 backdrop-blur-[1px]">
                            <span className="text-xl sm:text-3xl filter drop-shadow-md">💀</span>
                        </div>
                    )}
                    
                    {/* Speaking Overlay (Inner Glow) */}
                    {isSpeaking && <div className="absolute inset-0 bg-amber-400/10 z-20 mix-blend-overlay"></div>}

                    {/* Seat Number - Frosted Glass / Crystal Effect */}
                    <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                        
                        {/* Layer 1: Deep Soft Shadow for lift (Volume) */}
                        <span className={clsx(
                            "absolute font-black tracking-tighter select-none leading-none",
                            "text-5xl sm:text-6xl md:text-7xl lg:text-8xl", 
                            "text-black/30 blur-[2px] transform translate-y-[1px]"
                        )}>
                            {seat}
                        </span>

                        {/* Layer 2: Caustic Light / Background Interaction (Overlay) 
                            This simulates light passing through the glass and hitting the image behind it. */}
                        <span className={clsx(
                            "absolute font-black tracking-tighter select-none leading-none mix-blend-overlay",
                            "text-5xl sm:text-6xl md:text-7xl lg:text-8xl",
                            isSpeaking ? "text-amber-200" : "text-white opacity-60"
                        )}>
                            {seat}
                        </span>

                        {/* Layer 3: The Crystal Body (Main Gradient) 
                            High contrast gradient: Opaque top (sky reflection), Transparent middle (clear glass), 
                            Semi-opaque bottom (ground reflection/refraction). */}
                        <span className={clsx(
                            "relative font-black tracking-tighter select-none leading-none",
                            "text-5xl sm:text-6xl md:text-7xl lg:text-8xl",
                            "text-transparent bg-clip-text",
                            isSpeaking 
                                ? "bg-gradient-to-b from-amber-100/90 via-amber-200/20 to-amber-500/10"
                                : "bg-gradient-to-b from-white/95 via-white/10 to-white/20"
                        )}>
                            {seat}
                        </span>

                        {/* Layer 4: The Glass Rim (Edge Highlight) 
                            Crisp, thin white stroke to define the shape. */}
                        <span className={clsx(
                            "absolute font-black tracking-tighter select-none leading-none",
                            "text-5xl sm:text-6xl md:text-7xl lg:text-8xl",
                            "text-transparent"
                        )}
                        style={{
                            WebkitTextStroke: isSpeaking ? '1px rgba(253, 224, 71, 0.5)' : '1px rgba(255, 255, 255, 0.5)',
                            filter: 'drop-shadow(0 1px 1px rgba(255,255,255,0.2))' // Subtle glow on the rim
                        }}
                        >
                            {seat}
                        </span>
                    </div>
                </div>

                {/* Status Icons (Poison/Shoot) - Absolute positioned around */}
                {player.status === PlayerStatus.DEAD_POISON && (
                    <div className="absolute -right-1 top-0 text-base sm:text-xl drop-shadow-md filter" title="中毒">🧪</div>
                )}
                {player.status === PlayerStatus.DEAD_SHOOT && (
                    <div className="absolute -left-1 top-0 text-base sm:text-xl drop-shadow-md filter" title="中枪">🔫</div>
                )}
                
                {/* Speaking Badge */}
                {isSpeaking && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-white text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full shadow-sm animate-bounce z-40 whitespace-nowrap border border-amber-200">
                        发言中...
                    </div>
                )}
            </div>

            {/* Info Box */}
            <div className="mt-1 sm:mt-2 flex flex-col items-center space-y-0.5 min-h-[2.5rem]"> 
                {displayLabel ? (
                    <span className={clsx(
                        "text-[9px] sm:text-[10px] md:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded shadow-sm backdrop-blur-md border border-white/20",
                        displayColor,
                        "bg-slate-900/90"
                    )}>
                        {displayLabel}
                    </span>
                ) : (
                    <div className="h-[18px] sm:h-[21px]"></div> // Spacer
                )}
                
                {actor && (
                     <div className="flex flex-col items-center opacity-90">
                        <span className={clsx(
                            "text-[8px] sm:text-[9px] md:text-[10px] truncate max-w-[3.5rem] sm:max-w-[5rem] font-semibold px-1 sm:px-1.5 py-0.5 text-slate-700 bg-white/70 backdrop-blur-sm rounded-md shadow-sm border border-white/40"
                        )}>
                            {actor.name}
                        </span>
                    </div>
                )}
                
                {/* Witch Potions Indicators */}
                {(shouldShowRole && player.role === Role.WITCH && player.potions) && (
                    <div className="flex gap-1 pt-1">
                        <div className={clsx("w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full border border-white/50 shadow-sm transition-colors", player.potions.cure ? "bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.6)]" : "bg-slate-300")}></div>
                        <div className={clsx("w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full border border-white/50 shadow-sm transition-colors", player.potions.poison ? "bg-purple-500 shadow-[0_0_5px_rgba(168,85,247,0.6)]" : "bg-slate-300")}></div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PlayerCard;
