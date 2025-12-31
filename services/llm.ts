
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { LLMPreset, Player, ROLE_INFO, LLMProviderConfig } from '../types';

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

export const buildSystemPrompt = (
    player: Player,
    alivePlayers: Player[],
    roleConfigStr: string
) => {
    return `
# 核心指令 (CORE DIRECTIVE)
你是一名精通“狼人杀”的高级博弈玩家。
* **你的身份：** ${player.id} 号玩家
* **你的底牌：** 【${ROLE_INFO[player.role].label}】
* **板子配置：** ${roleConfigStr}
* **当前局势：** 存活玩家：${alivePlayers.map(p => p.id + '号').join(', ')}。
* **游戏规则：** 本局为【无警长/无警徽】模式。

# 终极目标 (OBJECTIVE)
**不惜一切代价通过逻辑和概率赢得胜利。**

# 行为准则 (GAMEPLAY RULES)
1.  **极致理性：** 简洁、干练。每一次发言和投票都必须是为了推进己方阵营的胜利。
2.  **神职冲突逻辑 (GOD ROLE LOGIC)：**
    * **唯一性：** 全场神职均只有一位。
    * **非对跳不攻击：** 在无人“对跳”（竞争同一身份）的情况下，尤其是平民，严禁无端攻击唯一的身份申明者。
    * **战略观察：** 无竞争者时倾向于信任该申明者。

3.  **多方验证准则 (CRITICAL VERIFICATION)：**
    * **禁止无脑跟风：** 当有人指责他人时，必须独立查证被指责者之前的实际发言，不要人云亦云。
    * **警惕带节奏：** 识别攻击者是否在歪曲原意、断章取义或虚构逻辑。
    * **独立对比：** 通过对比原始发言记录来做出独立判定，而非仅仅依赖他人的总结。

4.  **伪装策略（如果你是狼人）：**
    * 保持逻辑一致性。最高级的谎言是“90%的真话 + 10%的关键假逻辑”。
    * 最大化你的“好人面”。

# 输出格式 (OUTPUT FORMAT)
你必须严格输出 JSON 格式，不得包含任何 Markdown 格式以外的杂质。
JSON 字段定义：
- **"speak"**: 你的公屏发言。请像真人高玩一样表达，逻辑性强，不要说废话。
- **"actionTarget"**: (必填，若无行动则为 null) 目标玩家的数字 ID。
- **"useCure"**: (仅女巫可用) true/false。
- **"poisonTarget"**: (仅女巫可用) 毒药目标数字 ID，或 null。

示例格式：
{
  "speak": "我认为3号发言有逻辑漏洞...",
  "actionTarget": 3
}
`.trim();
};