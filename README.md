# 🐺 Werewolf Agents

用 Claude AI 驅動的狼人殺 agent，支援兩種模式：

- **多 AI 自動對戰**：讓多個 Claude agent 互相討論、投票、施展技能，完整跑完一局
- **Slack 單人 agent**：把一個 AI 玩家加進你的 Slack 狼人殺遊戲，由真人主持、AI 參與

---

## 目錄

- [環境準備](#環境準備)
- [模式一：多 AI 自動對戰](#模式一多-ai-自動對戰)
  - [自訂玩家名稱](#自訂玩家名稱)
  - [設定玩家個性](#設定玩家個性)
  - [各人數預設角色](#各人數預設角色)
- [模式二：Slack 單人 agent](#模式二slack-單人-agent)
  - [建立 Slack App](#建立-slack-app)
  - [取得 Token](#取得-token)
  - [啟動 Bot](#啟動-bot)
  - [遊戲流程指令](#遊戲流程指令)
- [角色說明](#角色說明)
- [專案結構](#專案結構)

---

## 環境準備

**需求：** Node.js 18+、Anthropic API Key

```bash
cd werewolf-agents
npm install
cp .env.example .env
```

在 `.env` 填入需要的欄位：

```env
# 選擇供應商（預設 anthropic）
LLM_PROVIDER=anthropic        # anthropic | openai | google | ollama
LLM_MODEL=                    # 留空使用各供應商預設模型

# 對應供應商的 API Key（只填用到的那個）
ANTHROPIC_API_KEY=sk-ant-...  # Claude
OPENAI_API_KEY=sk-...         # GPT-4o
GOOGLE_API_KEY=AIza...        # Gemini
# Ollama 不需要 API key，在本機執行即可
```

| 供應商 | `LLM_PROVIDER` | 預設模型 | API Key 來源 |
|--------|---------------|----------|-------------|
| Anthropic Claude | `anthropic` | `claude-sonnet-4-6` | [console.anthropic.com](https://console.anthropic.com) |
| OpenAI | `openai` | `gpt-4o` | [platform.openai.com](https://platform.openai.com) |
| Google Gemini | `google` | `gemini-2.0-flash` | [aistudio.google.com](https://aistudio.google.com) |
| Ollama（本機免費）| `ollama` | `llama3.1` | 不需要，見下方 |

**Ollama 本機設定：**
```bash
# 安裝 Ollama
brew install ollama        # macOS
# 或參考 https://ollama.com

# 下載模型後啟動
ollama pull llama3.1
ollama serve               # 預設跑在 localhost:11434
```

---

## 模式一：多 AI 自動對戰

讓 4–8 個 Claude agent 自己玩完一整局，不需要 Slack。

```bash
npm run game
```

啟動後會互動詢問：

```
遊戲模式：
  [1] 僅終端機（純 AI 對戰，結果印在 console）
  [2] 串接 Slack（同時把對話廣播到 Slack 頻道供觀戰）
請輸入 1 或 2 [預設 1]：1

玩家人數 4–8 [預設 6]：6
玩家：小明、小華、阿強、阿美、阿志、小玲
```

選模式 **1** 即可直接開始，遊戲過程會印在終端機。

### 自訂玩家名稱

```env
# .env
PLAYER_NAMES=Alice,Bob,Carol,Dave,Eve,Frank
```

設定後啟動時跳過問玩家數，直接用這組名稱。

### 設定玩家個性

每個 agent 可以有不同的說話風格與行為傾向，讓遊戲更有趣、更像真人對戰。

**啟動時互動設定（推薦）：**

```
── 個性設定（可選）──
可用個性：
  aggressive   → 積極型：你個性積極、主動，喜歡第一個發言…
  cautious     → 謹慎型：你個性謹慎保守，傾向先觀察他人…
  analytical   → 分析型：你喜歡邏輯推理，說話條理分明…
  ...

依序為每位玩家選擇個性，直接按 Enter 略過（無特定個性）：
  小明 的個性 [留空略過]：aggressive
    ✅ 設定為：積極型
  小華 的個性 [留空略過]：
  阿強 的個性 [留空略過]：analytical
    ✅ 設定為：分析型
```

**環境變數批次設定：**

```env
# .env（順序對應 PLAYER_NAMES，留空表示無特定個性）
PLAYER_PERSONALITIES=aggressive,cautious,analytical,,,quiet
```

**可用個性一覽：**

| Key | 名稱 | 風格描述 |
|-----|------|---------|
| `aggressive` | 積極型 | 主動發言、直接指控、不怕衝突 |
| `cautious` | 謹慎型 | 觀察後再說、保留態度、不早表態 |
| `analytical` | 分析型 | 邏輯推理、引用證據、像偵探 |
| `talkative` | 話多型 | 開朗話多、觀察細節、有時跳脫 |
| `quiet` | 沉默型 | 話很少、簡短有力、讓人捉摸不透 |
| `suspicious` | 疑心重型 | 高度警戒、容易懷疑他人 |
| `friendly` | 親和型 | 溫和友善、不衝突、關鍵時表態 |
| `emotional` | 情緒化型 | 情緒起伏、激動辯護、顯得真實 |

不指定個性的玩家會使用通用的遊戲行為風格。

### 各人數預設角色

| 人數 | 角色組合 |
|------|----------|
| 4 | 狼人 ×1、預言家 ×1、平民 ×2 |
| 5 | 狼人 ×1、預言家 ×1、平民 ×3 |
| 6 | 狼人 ×2、預言家 ×1、平民 ×3 |
| 7 | 狼人 ×2、預言家 ×1、女巫 ×1、平民 ×3 |
| 8 | 狼人 ×2、預言家 ×1、女巫 ×1、獵人 ×1、平民 ×3 |

---

## 模式二：Slack 單人 agent

把一個 AI 玩家加進 Slack 頻道，由真人主持遊戲，AI 全程用繁體中文參與討論和投票。

### 建立 Slack App

1. 前往 [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**

2. **開啟 Socket Mode**（左側選單 → Socket Mode → Enable）
   - 按 **Generate** 產生 App-Level Token，scope 選 `connections:write`
   - 記下這個 token（`xapp-` 開頭），這是 `SLACK_APP_TOKEN`

3. **設定 Bot Token Scopes**（左側 OAuth & Permissions → Bot Token Scopes）

   加入以下 scopes：

   | Scope | 用途 |
   |-------|------|
   | `channels:history` | 讀取公開頻道訊息 |
   | `channels:read` | 列出頻道 |
   | `chat:write` | 發送訊息 |
   | `groups:history` | 讀取私人頻道訊息 |
   | `groups:read` | 列出私人頻道 |
   | `im:history` | 讀取 DM（接收主持人指令） |
   | `im:read` | 列出 DM |
   | `im:write` | 在 DM 回覆 |
   | `users:read` | 取得玩家名稱 |

4. **訂閱 Events**（左側 Event Subscriptions → Enable Events）

   在 **Subscribe to bot events** 加入：
   - `message.channels`
   - `message.groups`
   - `message.im`

5. **安裝 App 到 Workspace**（左側 Install App → Install to Workspace）
   - 安裝後取得 Bot User OAuth Token（`xoxb-` 開頭），這是 `SLACK_BOT_TOKEN`

### 取得 Token

完成後在 `.env` 填入：

```env
ANTHROPIC_API_KEY=sk-ant-你的金鑰
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
```

### 啟動 Bot

```bash
npm run dev
```

看到以下訊息代表連線成功：

```
🐺 Werewolf Agent started! Bot ID: U0123456789
```

把 Bot 加入遊戲頻道（`/invite @你的Bot名稱`）。

### 遊戲流程指令

所有指令都透過 **DM 傳給 Bot**（私訊，非頻道）。

#### 開局設定

```
role: werewolf          ← 設定 Bot 扮演的角色
players: @Alice @Bob @Carol @Dave @Eve @Bot
channel: #game-channel  ← 設定遊戲發生的頻道
```

支援的角色名稱：`werewolf`（狼人）、`villager`（平民）、`seer`（預言家）、`witch`（女巫）、`hunter`（獵人）

#### 推進遊戲

```
phase: night    ← 進入夜晚（Bot 靜止不發言）
night           ← 詢問 Bot 的夜晚行動目標（私訊回覆）
phase: day      ← 進入白天，Bot 開始在頻道討論（天數 +1）
phase: voting   ← 進入投票，Bot 在頻道發表投票意見
vote            ← 直接詢問 Bot 要投誰（私訊回覆）
dead: @玩家     ← 標記死亡玩家
```

#### 特殊身份

```
seer: @玩家 good    ← 告知預言家查驗結果為好人
seer: @玩家 evil    ← 告知預言家查驗結果為狼人
```

#### 其他

```
status   ← 查看目前遊戲狀態
reset    ← 重置遊戲（下一局開始前使用）
```

#### 完整一局範例

```
# 主持人 DM Bot：
role: seer
players: @小明 @小華 @阿強 @阿美 @WerewolfBot
channel: #狼人殺

phase: night
night
→ 🔒 Bot 回覆：我要查驗小明

phase: day
→ Bot 開始在頻道發言

dead: @阿強
→ ✅ 已標記死亡

phase: voting
→ Bot 在頻道公開投票並說明理由

dead: @小明
phase: night
...
```

---

## 角色說明

| 角色 | 陣營 | 能力 |
|------|------|------|
| 狼人 | 狼人 | 每晚選一名村民淘汰；多人時知道彼此身份 |
| 平民 | 村民 | 無特殊能力，靠推理找出狼人 |
| 預言家 | 村民 | 每晚查驗一人，得知其真實身份 |
| 女巫 | 村民 | 解藥救人一次、毒藥殺人一次 |
| 獵人 | 村民 | 死亡時可帶走一名玩家 |

勝利條件：
- **村民陣營**：淘汰所有狼人
- **狼人陣營**：狼人數量等於或超過存活村民

---

## 專案結構

```
src/
├── game_state.ts       遊戲狀態（玩家、階段、已知角色）
├── agent.ts            Claude 驅動的單一 agent 決策邏輯
├── multi_agent_game.ts 多 agent 自動對戰引擎（GameMaster）
├── run_game.ts         多 AI 對戰的 CLI 入口
└── main.ts             Slack Bot 入口（單人 agent 模式）
```
