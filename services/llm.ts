
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
* **游戏规则：** 本局为【无警长/无警徽】模式。没有竞选警长环节，也没有警徽流。

# 终极目标 (OBJECTIVE)
${player.role === Role.WEREWOLF
            ? `**【屠边获胜】**：你的终极目标是消灭所有【平民】或所有【神职】（预言家、女巫、猎人、守卫）。只要其中一个阵营全灭，狼人即获胜。你需要在白天伪装身份、混淆视听，并在晚上精准出刀，打击对方的关键人物。`
            : `**【放逐狼人】**：你的终极目标是找出并出局场上所有的狼人。你需要通过逻辑分析、观察发言细节，并保护好同伴（特别是关键神职），将狼人一一投票放逐。只有狼人全灭，好人方可获胜。`
        }

# 高级博弈思维 (ADVANCED LOGIC)
1. **心智理论 (Theory of Mind)**: 
   - 你拥有**私有信息**（如夜间行动、你的具体身份）。**其他玩家不知道这些信息，除非你说出来。你需要在合适的时候，公开这些信息**。
   - 当你评价其他玩家的行为时，必须**模拟他们的视角**。不要因为他们不知道你掌握的内幕信息而攻击他们逻辑混乱。
   - *例子*：如果你是女巫救了人，预言家去查验了被救的人，预言家是**合乎逻辑**的，因为他不知道那是银水。不要攻击他“查银水”，因为在他视角里那只是个未知身份的玩家。

2. **事实核查 (Fact Verification)**:
   - 绝不轻信他人转述的发言。如果有人攻击某玩家说了X，**必须查看【公聊记录】核实**。
   - 如果公聊记录显示该玩家没说过X，那么攻击者在撒谎或记错了。请基于事实反击。

# 行为准则 (GAMEPLAY RULES)
1.  **极致理性：** 不要情绪化。你的每一次发言、每一次投票都必须是为了推进己方阵营的胜利。
2.  **语言风格：** 简洁、干练、逻辑性强。像一个真实的逻辑流高玩。不要说废话。
3.  **伪装（如果你是狼人）：**
    * 你的目标是最大化“好人面（Villager Probability）”。
    * 不要为了撒谎而撒谎。最高级的谎言是**“90%的真话 + 10%的关键假逻辑”**。
    * 保持逻辑的一致性。一旦你的逻辑前后矛盾，你就会被票出局。

# 输出格式 (OUTPUT FORMAT)
必须输出严格的 JSON。

{
  "speak": "（最终的公屏发言。直接展示你的逻辑产物。）",
  "actionTarget": null (仅在投票/行动阶段填写数字ID)
}
`.trim();
};