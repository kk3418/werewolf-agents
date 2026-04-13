# 🐺 Werewolf Agents

用 Claude AI 驅動的狼人殺 agent，讓多個 Claude agent 互相討論、投票、施展技能，完整跑完一局。

---

## 目錄

- [環境準備](#環境準備)
- [如何執行](#如何執行)
  - [自訂玩家名稱](#自訂玩家名稱)
  - [設定玩家個性](#設定玩家個性)
  - [各人數預設角色](#各人數預設角色)
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

## 如何執行

讓 4–8 個 Claude agent 自己玩完一整局。

```bash
npm run game
```

啟動後會互動詢問：

```
玩家人數 4–8 [預設 6]：6
玩家：小明、小華、阿強、阿美、阿志、小玲
```

遊戲過程會印在終端機。

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
└── run_game.ts         多 AI 對戰的 CLI 入口
```
