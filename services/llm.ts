
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { LLMPreset, Player, ROLE_INFO, LLMProviderConfig, Role } from '../types';

// --- LLM Service ---

// Helper: auto-retry wrapper
async function withRetry<T>(
    fn: () => Promise<T>,
    retries: number = 3,
    delayMs: number = 1000,
    backoffFactor: number = 2
): Promise<T> {
    let lastError: any;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            lastError = e;
            console.warn(`LLM Attempt ${i + 1} failed, retrying in ${delayMs}ms...`, e);
            if (i < retries - 1) {
                await new Promise(r => setTimeout(r, delayMs));
                delayMs *= backoffFactor;
            }
        }
    }
    throw lastError;
}

export async function generateText(
    messages: { role: string; content: string }[],
    preset: LLMPreset,
    providerConfig: LLMProviderConfig
): Promise<string> {
    const doFetch = async () => {
        if (providerConfig.type === 'gemini') {
            // --- GEMINI NATIVE SDK ---
            const apiKey = providerConfig.apiKey || process.env.API_KEY;
            if (!apiKey) return "Error: No API Key configured for Gemini.";

            const ai = new GoogleGenAI({ apiKey });
            let systemInstruction = "";
            let promptParts: string[] = [];

            messages.forEach(m => {
                if (m.role === 'system') systemInstruction += m.content + "\n\n";
                else promptParts.push(`${m.role === 'user' ? 'User' : 'Model'}: ${m.content}`);
            });

            const finalPrompt = promptParts.join('\n');

            const response = await ai.models.generateContent({
                model: preset.modelId,
                contents: finalPrompt,
                config: {
                    systemInstruction: systemInstruction,
                    temperature: 0.7,
                    safetySettings: [
                        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    ],
                }
            });

            return response.text || "";

        } else {
            // --- OPENAI COMPATIBLE ---
            if (!providerConfig.apiKey) return "Error: No API Key configured for this provider.";

            const baseUrl = providerConfig.baseUrl || "https://api.openai.com/v1";
            const url = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;

            const body: any = {
                model: preset.modelId,
                messages: messages,
                temperature: 0.7
            };

            if (preset.modelId === 'deepseek-v3-1-terminus') {
                body.thinking = { type: "enabled" };
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${providerConfig.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorText = await response.text();
                // Throw error to trigger retry
                throw new Error(`LLM API Error (${providerConfig.name}): ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            return data.choices?.[0]?.message?.content || "";
        }
    };

    try {
        // Try up to 3 times, starting with 1s delay, doubling each time
        return await withRetry(doFetch, 3, 1000, 2);
    } catch (e) {
        console.error("LLM Generation Failed after retries:", e);
        return `Error: Service unavailable after multiple attempts. (${e})`;
    }
}

// --- Utilities & Prompt Builders ---

export const parseLLMResponse = (responseText: string): any => {
    try {
        // Clean markdown code blocks if present
        const cleanText = responseText.replace(/```json\n?|\n?```/g, '').trim();
        return JSON.parse(cleanText);
    } catch (e) {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e2) {
                // Fallback: treat the whole text as speech if JSON fails
                return { speak: responseText };
            }
        }
        return { speak: responseText };
    }
};

