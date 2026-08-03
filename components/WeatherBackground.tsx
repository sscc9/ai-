
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { clsx } from 'clsx';
import { gamePhaseAtom, gameWeatherAtom, GameWeather, isDaytimeAtom, globalApiConfigAtom, appScreenAtom } from '../store';
import { GamePhase } from '../types';

// Ambient audio elements kept outside component to persist across re-renders
let rainAudio: HTMLAudioElement | null = null;
let thunderAudio: HTMLAudioElement | null = null;

const WeatherBackground: React.FC = () => {
    const phase = useAtomValue(gamePhaseAtom);
    const screen = useAtomValue(appScreenAtom);
    const isDay = useAtomValue(isDaytimeAtom);
    const globalConfig = useAtomValue(globalApiConfigAtom);
    const [weather, setWeather] = useAtom(gameWeatherAtom);

    const [isLightningFlashing, setIsLightningFlashing] = useState(false);
    const lastPhaseRef = useRef<GamePhase | null>(null);
    const bgmEnabled = globalConfig.bgmEnabled !== false;
    const bgmVolume = globalConfig.bgmVolume ?? 0.2;

    // Roll for new weather only on day/night transitions
    useEffect(() => {
        if (phase === lastPhaseRef.current) return;

        // Reset weather to SUNNY if game setup or over
        if (phase === GamePhase.SETUP) {
            setWeather(GameWeather.SUNNY);
        } else if (phase === GamePhase.NIGHT_START || phase === GamePhase.DAY_ANNOUNCE) {
            const roll = Math.random();
            let newWeather = GameWeather.SUNNY;

            if (phase === GamePhase.NIGHT_START) {
                // Night weather probabilities
                if (roll < 0.50) newWeather = GameWeather.SUNNY;         // 50% clear starry sky
                else if (roll < 0.75) newWeather = GameWeather.CLOUDY;   // 25% cloudy
                else if (roll < 0.90) newWeather = GameWeather.RAINY;    // 15% rainy night
                else newWeather = GameWeather.THUNDERSTORM;              // 10% thunderstorm
            } else {
                // Day weather probabilities
                if (roll < 0.60) newWeather = GameWeather.SUNNY;         // 60% sunny day
                else if (roll < 0.85) newWeather = GameWeather.CLOUDY;   // 25% cloudy
                else if (roll < 0.95) newWeather = GameWeather.RAINY;    // 10% rainy day
                else newWeather = GameWeather.THUNDERSTORM;              // 5% daytime thunderstorm
            }
            setWeather(newWeather);
        }

        lastPhaseRef.current = phase;
    }, [phase, setWeather]);

    // Handle Rain audio loop
    useEffect(() => {
        const isGameScreen = screen === 'GAME';
        const shouldPlayRain = isGameScreen && bgmEnabled && (weather === GameWeather.RAINY || weather === GameWeather.THUNDERSTORM);

        if (shouldPlayRain) {
            if (!rainAudio) {
                rainAudio = new Audio('/bgm/rain.mp3');
                rainAudio.loop = true;
            }
            // Set rain volume to be softer than the main music
            rainAudio.volume = bgmVolume * 0.45;
            if (rainAudio.paused) {
                rainAudio.play().catch(e => console.warn("Rain audio autoplay blocked:", e));
            }
        } else {
            if (rainAudio && !rainAudio.paused) {
                rainAudio.pause();
            }
        }

        return () => {
            // Volume sync on change
            if (rainAudio) {
                rainAudio.volume = bgmVolume * 0.45;
            }
        };
    }, [weather, screen, bgmEnabled, bgmVolume]);

    // Handle Thunderstorm loop (Lightning flashes & Thunder claps)
    useEffect(() => {
        const isGameScreen = screen === 'GAME';
        if (weather !== GameWeather.THUNDERSTORM || !isGameScreen) {
            setIsLightningFlashing(false);
            return;
        }

        let lightningTimeout: NodeJS.Timeout;
        let flashEndTimeout1: NodeJS.Timeout;
        let flashStartTimeout2: NodeJS.Timeout;
        let flashEndTimeout2: NodeJS.Timeout;
        let thunderPlayTimeout: NodeJS.Timeout;

        const triggerStrike = () => {
            // 1. Lightning Double Flash (Subtle opacity changes to avoid blinding eyes)
            // Initial flash
            setIsLightningFlashing(true);
            
            flashEndTimeout1 = setTimeout(() => {
                setIsLightningFlashing(false);
            }, 60);

            // Second strike of double flash
            flashStartTimeout2 = setTimeout(() => {
                setIsLightningFlashing(true);
            }, 120);

            flashEndTimeout2 = setTimeout(() => {
                setIsLightningFlashing(false);
            }, 260);

            // 2. Synchronized Thunder Sound with realistic delay (speed of sound simulation)
            if (bgmEnabled) {
                const distanceDelay = 600 + Math.random() * 1200; // 0.6s to 1.8s delay
                thunderPlayTimeout = setTimeout(() => {
                    if (!thunderAudio) {
                        thunderAudio = new Audio('/bgm/thunder.mp3');
                    }
                    // Random volume representing proximity of thunder strike
                    thunderAudio.volume = (0.4 + Math.random() * 0.5) * bgmVolume;
                    thunderAudio.currentTime = 0;
                    thunderAudio.play().catch(e => console.warn("Thunder play blocked:", e));
                }, distanceDelay);
            }

            // Schedule next strike in 10 to 25 seconds
            const nextStrikeDelay = 10000 + Math.random() * 15000;
            lightningTimeout = setTimeout(triggerStrike, nextStrikeDelay);
        };

        // First strike after 5 seconds
        lightningTimeout = setTimeout(triggerStrike, 5000 + Math.random() * 5000);

        return () => {
            clearTimeout(lightningTimeout);
            clearTimeout(flashEndTimeout1);
            clearTimeout(flashStartTimeout2);
            clearTimeout(flashEndTimeout2);
            clearTimeout(thunderPlayTimeout);
        };
    }, [weather, screen, bgmEnabled, bgmVolume]);

    // Clean up audios on unmount
    useEffect(() => {
        return () => {
            if (rainAudio) {
                rainAudio.pause();
                rainAudio = null;
            }
            if (thunderAudio) {
                thunderAudio.pause();
                thunderAudio = null;
            }
        };
    }, []);

    // Memoize Rain Drops positioning to prevent jumping on state change
    const rainDrops = useMemo(() => {
        if (weather !== GameWeather.RAINY && weather !== GameWeather.THUNDERSTORM) return [];
        const count = weather === GameWeather.THUNDERSTORM ? 50 : 30;
        return Array.from({ length: count }).map((_, i) => ({
            left: `${Math.random() * 100}%`,
            top: `${-20 - Math.random() * 20}%`,
            delay: `${Math.random() * 1.5}s`,
            duration: `${0.6 + Math.random() * 0.4}s`,
            opacity: 0.15 + Math.random() * 0.2
        }));
    }, [weather]);

    // Memoize Stars positioning
    const stars = useMemo(() => {
        if (isDay) return [];
        return Array.from({ length: 45 }).map((_, i) => ({
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 45}%`, // upper half
            size: `${1 + Math.random() * 1.5}px`,
            delay: `${Math.random() * 4}s`,
            duration: `${2 + Math.random() * 4}s`,
            opacity: 0.2 + Math.random() * 0.6
        }));
    }, [isDay]);

    // Cloud objects
    const clouds = useMemo(() => {
        const count = weather === GameWeather.CLOUDY ? 4 : (weather === GameWeather.SUNNY ? 1 : 2);
        return Array.from({ length: count }).map((_, i) => {
            const size = 150 + Math.random() * 180;
            return {
                top: `${5 + Math.random() * 35}%`,
                duration: `${90 + Math.random() * 80}s`,
                delay: `${-Math.random() * 100}s`, // start offset
                opacity: weather === GameWeather.CLOUDY ? 0.25 : 0.12,
                size
            };
        });
    }, [weather]);

    const isRaining = weather === GameWeather.RAINY || weather === GameWeather.THUNDERSTORM;

    return (
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden select-none">
            {/* Custom CSS animations */}
            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes weather-rain {
                    0% { transform: translateY(0) rotate(12deg); }
                    100% { transform: translateY(120vh) rotate(12deg); }
                }
                @keyframes weather-twinkle {
                    0%, 100% { opacity: 0.2; }
                    50% { opacity: 1; }
                }
                @keyframes weather-cloud-drift {
                    0% { transform: translateX(-150%); }
                    100% { transform: translateX(110vw); }
                }
                .weather-drop {
                    position: absolute;
                    width: 1px;
                    height: 50px;
                    background: linear-gradient(transparent, rgba(255, 255, 255, 0.45));
                    animation: weather-rain linear infinite;
                }
                .weather-star {
                    position: absolute;
                    background-color: white;
                    border-radius: 50%;
                    animation: weather-twinkle ease-in-out infinite;
                }
                .weather-cloud {
                    position: absolute;
                    background: radial-gradient(circle, rgba(255, 255, 255, 0.15) 0%, transparent 70%);
                    border-radius: 50%;
                    animation: weather-cloud-drift linear infinite;
                    filter: blur(10px);
                }
                .weather-cloud-dark {
                    background: radial-gradient(circle, rgba(15, 23, 42, 0.35) 0%, transparent 70%);
                }
            `}} />

            {/* --- Stars for night (Clear BGM Night) --- */}
            {stars.map((s, idx) => (
                <div
                    key={`star-${idx}`}
                    className="weather-star"
                    style={{
                        left: s.left,
                        top: s.top,
                        width: s.size,
                        height: s.size,
                        animationDelay: s.delay,
                        animationDuration: s.duration,
                        opacity: s.opacity,
                        boxShadow: '0 0 4px rgba(255, 255, 255, 0.8)'
                    }}
                />
            ))}

            {/* --- Clouds (slow drift) --- */}
            {clouds.map((c, idx) => (
                <div
                    key={`cloud-${idx}`}
                    className={clsx("weather-cloud", !isDay && "weather-cloud-dark")}
                    style={{
                        top: c.top,
                        width: `${c.size}px`,
                        height: `${c.size * 0.6}px`,
                        animationDuration: c.duration,
                        animationDelay: c.delay,
                        opacity: c.opacity
                    }}
                />
            ))}

            {/* --- Rain effect --- */}
            {isRaining && rainDrops.map((d, idx) => (
                <div
                    key={`rain-${idx}`}
                    className="weather-drop"
                    style={{
                        left: d.left,
                        top: d.top,
                        animationDelay: d.delay,
                        animationDuration: d.duration,
                        opacity: d.opacity
                    }}
                />
            ))}

            {/* --- Subtle Lightning glow overlay (Behind central panel, above stars/clouds) --- */}
            {/* Flashes dark blue/indigo in top corners rather than blinding white fullscreen */}
            <div
                className={clsx(
                    "absolute inset-0 bg-[#312e81]/15 transition-opacity duration-75 mix-blend-color-dodge",
                    isLightningFlashing ? "opacity-100" : "opacity-0"
                )}
            >
                {/* Visual flash focal points at the top */}
                <div className="absolute top-[-10%] left-[15%] w-[45vw] h-[45vw] bg-indigo-200/25 rounded-full blur-[90px]" />
                <div className="absolute top-[-15%] right-[25%] w-[55vw] h-[55vw] bg-blue-200/35 rounded-full blur-[100px]" />
            </div>
        </div>
    );
};

export default WeatherBackground;
