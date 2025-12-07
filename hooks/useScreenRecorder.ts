
import { useState, useRef, useCallback } from 'react';

// Type definitions for Region Capture API
interface CropTarget { } // Opaque type

declare global {
    var CropTarget: {
        fromElement(element: Element): Promise<CropTarget>;
    };
    interface MediaStreamTrack {
        cropTo(cropTarget: CropTarget): Promise<void>;
    }
}

export const useScreenRecorder = () => {
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const startRecording = useCallback(async (elementId: string) => {
        try {
            const element = document.getElementById(elementId);
            if (!element) {
                console.error(`Element with id ${elementId} not found`);
                return;
            }

            // 1. Get Display Media (User must select the current tab)
            // Note: TS might complain about preferCurrentTab, casting to any or Custom types
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    frameRate: 60,
                },
                audio: true,
                preferCurrentTab: true,
            } as any);

            // 2. Crop to specific element using Region Capture API
            if (window.CropTarget && window.CropTarget.fromElement) {
                try {
                    const cropTarget = await window.CropTarget.fromElement(element);
                    const [videoTrack] = stream.getVideoTracks();
                    if (videoTrack && videoTrack.cropTo) {
                        await videoTrack.cropTo(cropTarget);
                    }
                } catch (e) {
                    console.warn("CropTarget failed", e);
                }
            } else {
                console.warn('Region Capture API not supported/enabled. Recording full selected area.');
            }

            // 3. Setup MediaRecorder
            const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9')
                ? 'video/webm; codecs=vp9'
                : 'video/webm';

            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: mimeType });
                const url = URL.createObjectURL(blob);

                // Auto download
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `recording-${new Date().toISOString()}.webm`;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                }, 100);

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
                setIsRecording(false);
            };

            mediaRecorder.start();
            setIsRecording(true);

            // Handle stream ended manually by user
            stream.getVideoTracks()[0].onended = () => {
                if (mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                }
            };

        } catch (err) {
            console.error('Error starting recording:', err);
            setIsRecording(false);
        }
    }, []);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'running') {
            mediaRecorderRef.current.stop();
        }
    }, []);

    return {
        isRecording,
        startRecording,
        stopRecording
    };
};
