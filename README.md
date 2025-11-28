# AI 狼人杀模拟器 - 架构设计方案

您好！根据您的需求（视频录制专用、多AI博弈、高度可定制、历史回放），以下是针对**状态管理**和**CSS架构**的详细设计建议。

## 1. 状态管理架构：为什么选择 Jotai？

对于这个项目，**Jotai** 是绝佳的选择，远优于 Redux 或 React Context。

### 核心理由：
1.  **原子化更新 (Atomic Updates)：**
    *   在狼人杀游戏中，状态非常细碎且更新频率不同。比如，“当前发言的文字”在不断跳动（打字机效果），而“存活玩家列表”很久才变一次。
    *   使用 Jotai，我们可以把 `currentPlayerTextAtom` 和 `playerListAtom` 分开。当文字跳动时，只有中间的“发言面板”会渲染，顶部的“玩家头像”不会闪烁。这对于**视频录制**至关重要，因为画面必须极其流畅，不能有不必要的重绘。
2.  **时间旅行与回放 (Time Travel & Replay)：**
    *   您提到了“回顾”和“回放模式”。
    *   Jotai 的原子状态非常容易序列化。我们可以创建一个 `historyAtom`，记录每一步的原子快照（Snapshot）。
    *   当您点击“回放”时，我们只需要将当前的 Atoms 值重置为历史记录中的某一帧，整个 UI 就会瞬间回到那个时刻。
3.  **派生状态 (Derived State)：**
    *   游戏中有很多计算属性。例如：`aliveWolfCountAtom`（存活狼人数量）可以自动从 `playersAtom` 派生。当任意玩家死亡时，这个计数器自动更新，无需手动维护副作用。

### 建议的 Jotai 结构 (在 `store.ts` 中体现)：
*   `configAtom`: 游戏规则配置（几人局、有哪些角色）。
*   `gamePhaseAtom`: 当前阶段（天黑、狼人行动、女巫行动、天亮发言、投票）。
*   `playersAtom`: 包含所有玩家对象（ID、AI模型、角色、生卒状态、历史发言）。
*   `logsAtom`: 全局的游戏日志，用于生成上下文传给 AI。
*   `currentSpeakerAtom`: 当前正在发言的玩家 ID（用于 UI 高亮）。

## 2. CSS 架构：Tailwind CSS 方案

为了满足“录视频专用”的高审美要求，我们采用 **Tailwind CSS** 配合 **Utility-First** 策略。

### 核心方案：
1.  **Tailwind CSS + `clsx` / `tailwind-merge`：**
    *   这是处理动态样式的标准方案。
    *   **场景：** 玩家卡片会有多种状态（存活、死亡、被选中、发言中、中毒、中枪）。
    *   **写法：** `clsx('border-2', isSpeaking ? 'border-yellow-400 scale-110' : 'border-gray-600', isDead && 'grayscale opacity-50')`。这种写法清晰且性能极高。
2.  **布局策略 (Layout)：**
    *   **上帝视角 (Spectator View)：** 采用 Flexbox 或 Grid 布局。
    *   **顶部/底部：** 玩家卡片横向排列（Avatar Row）。
    *   **中央舞台：** 巨大的对话框和当前行动提示。字体要大（建议 `text-2xl` 或更大），确保在手机上刷短视频时也能看清文字。
3.  **主题与动效 (Theming & Animation)：**
    *   **日夜交替：** 利用 Tailwind 的颜色系统定义 `transition-colors duration-1000`。天黑时背景平滑过渡到深蓝/黑色，天亮过渡到暖色。
    *   **高对比度：** 文字颜色主要使用 `text-white` 或 `text-gray-100`，配合深色半透明背景（Glassmorphism），确保在复杂的背景图上也能看清。

## 3. AI 与 Agent 设计架构

*   **Game Loop (裁判):** 主控逻辑，负责分发 Prompt。它不直接产生内容，而是像“服务器”一样询问 AI。
*   **Player Agents (玩家):** 每个玩家是一个独立的 AI 会话。**关键点**：同一个 AI 模型（如 Gemini）可以实例化多次，通过维持不同的 `history` 数组来模拟不同的玩家视角。
*   **Meta Agent (规则助手):** 这是一个独立的 Agent。
    *   **工具:** `googleSearch`。
    *   **功能:** 它可以上网查“12人预女猎白规则”，然后输出一个标准的 JSON 配置对象，直接应用到 `configAtom` 中。

此架构已在代码框架中初步搭建。您可以查看 `store.ts` 和 `types.ts` 了解数据流向。