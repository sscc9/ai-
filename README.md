# AI 狼人杀模拟器 (AI Werewolf Simulator)

这是一个基于 React + Jotai + Vite 驱动前端，FastAPI + Edge-TTS 驱动后端的全自动/人机交互 AI 狼人杀模拟器。项目专为多 AI 对局博弈、游戏策略研究、可视化回放及视频录制设计。

## 项目特点

1. **多模型博弈**：支持不同 AI 角色（Gemini、DeepSeek 等）进行逻辑对决，每个玩家拥有独立的记忆、视角和战术设定。
2. **结构化流程控制**：游戏状态机采用清晰的流程驱动，避免了传统的模糊正则解析，保证了状态变化的精准性。
3. **音画同步回放**：支持旁白与玩家发言的文字转语音（TTS）播报，支持时间旅行回放与剧场模式。
4. **高自由度定制**：可在后台配置各角色的系统策略提示词（System Prompt）、模型参数（Temperature、Thinking）以及个性化音色。

---

## 快速开始

本项目由前端（Vite 开发服务器）和后端（FastAPI TTS 服务）两部分组成。

### 1. 后端 TTS 服务配置与启动

后端使用 Python 执行 Edge-TTS 接口，提供免费且高质量的语音合成服务。

#### 安装步骤：
1. 确保系统已安装 Python 3.10+。
2. 进入 `server` 目录：
   ```bash
   cd server
   ```
3. 创建虚拟环境并激活：
   * **Windows**:
     ```powershell
     python -m venv venv
     venv\Scripts\activate
     ```
   * **macOS/Linux**:
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```
4. 安装 Python 依赖：
   ```bash
   pip install -r requirements.txt
   ```

#### 启动后端：
* 直接运行 Python 脚本：
  ```bash
  python main.py
  ```
* 或者在项目根目录下双击运行 `start_tts_backend.bat` (Windows) 或执行 `start_tts_backend.sh` (macOS/Linux)。

后端将在 `http://localhost:8000` 启动服务。

### 2. 前端服务安装与启动

前端采用 Vite 进行模块打包和本地热更新，利用 `http-proxy` 代理请求到后端。

#### 安装步骤：
1. 确保系统已安装 Node.js (推荐 18+ 或 20+)。
2. 在项目根目录下，安装 Node 依赖包：
   ```bash
   npm install
   ```

#### 配置 API Key：
启动应用后，直接在浏览器网页的右上角点击 **设置 (Settings ⚙️)** 图标，配置您个人的 Google Gemini 或 DeepSeek 等模型的 API Key 即可。

#### 启动前端：
在根目录下运行以下命令启动本地开发服务器：
```bash
npm run dev
```
前端开发服务器将在 `http://localhost:3000` 启动，您可以通过浏览器访问它。

* **Windows 一键启动**：根目录下提供了 `start_app.bat`，双击可自动开启后端 TTS 虚拟环境并并行启动前端 Vite。

---

## 🔒 部署与安全设计

> [!NOTE]
> **零 Key 泄露风险**：
> 本项目已彻底移除了在编译打包时将外部 Key 注入打包产物的行为。
>
> 页面中所有大模型 API Key 均**完全由用户自行在网页“设置⚙️”界面配置**，且仅加密或直接保存在玩家本地浏览器的 `localStorage` 中。公开部署上线此网页（例如使用 Vercel 或 GitHub Pages）完全不用担心密钥被泄露。

---

## 架构与核心逻辑

* **`atoms.ts`**：Jotai 的全局状态原子库，负责定义核心的角色名单、游戏阶段、上帝笔记本、日志归档等底层数据结构。
* **`store.ts`**：派生状态与事务动作，提供游戏初始化、历史快照保存和回放逻辑。
* **`hooks/useGameEngine.ts`**：游戏主引擎。通过轮询驱动各阶段的游戏转换。包含 AI 投票的 JSON 重新呼叫和纠错机制。
* **`hooks/useTheaterEngine.ts`**：音频剧场级播放引擎。通过结构化的 `log.deaths` 属性准确还原现场死亡状态，剔除了不稳定的正则自然语言反推。
* **`services/skills/werewolf/WerewolfSkill.ts`**：狼人杀专有技能类，用于根据游戏上下文为每个玩家组装最优提示词。
* **`services/llm.ts`**：通用大模型网关层，支持 Gemini SDK 的结构化多轮 `contents` 会话，并能够自适应预设中配置的思维链属性和温度参数。