import { createProvider, LLMProvider } from "./providers";
import { GameState, Phase, Role } from "./game_state";

// ── Personality system ─────────────────────────────────────────────────────

export interface PersonalityConfig {
  /** 個性名稱（顯示用） */
  name: string;
  /** 注入到 system prompt 的個性特徵描述 */
  traits: string;
}

export const PRESET_PERSONALITIES: Record<string, PersonalityConfig> = {
  aggressive: {
    name: "積極型",
    traits:
      "你個性積極、主動，喜歡第一個發言，語氣直接強硬，會大膽指控看起來可疑的人，不怕衝突，說話帶有攻擊性。",
  },
  cautious: {
    name: "謹慎型",
    traits:
      "你個性謹慎保守，傾向先觀察他人再發言，說話有所保留，不會太早表態，給人穩重可靠的感覺。",
  },
  analytical: {
    name: "分析型",
    traits:
      "你喜歡邏輯推理，說話條理分明，會引用具體的對話內容當證據，像偵探一樣一步步推導結論。",
  },
  talkative: {
    name: "話多型",
    traits:
      "你個性開朗話多，喜歡聊天，有時說話會有點跳脫，但觀察力敏銳，對小細節很有感覺。",
  },
  quiet: {
    name: "沉默型",
    traits:
      "你話非常少，只在必要時簡短發言，讓人捉摸不透，偶爾一句話就能點中要害。",
  },
  suspicious: {
    name: "疑心重型",
    traits:
      "你天性多疑，對任何人都保持高度警戒，很容易懷疑別人，說話帶有神經質感，看誰都像狼人。",
  },
  friendly: {
    name: "親和型",
    traits:
      "你個性親切友善，說話溫和，容易和大家打成一片，不喜歡衝突，但關鍵時刻也能果斷表態。",
  },
  emotional: {
    name: "情緒化型",
    traits:
      "你情緒起伏明顯，被懷疑時容易激動，為朋友辯護很用力，有時衝動說錯話但也顯得真實。",
  },
};

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  [Role.WEREWOLF]: `你是【狼人】。目標：淘汰村民，同時不被發現。
- 夜晚：從村民中選一人淘汰（不能選狼人隊友）
- 白天：假裝無辜，融入村民，巧妙地把懷疑引導到別人身上
- 策略：一旦確認預言家或女巫的身份，優先淘汰他們`,

  [Role.VILLAGER]: `你是【平民】。目標：找出並投票淘汰所有狼人。
- 觀察誰在轉移話題、誰沉默、誰的投票行為奇怪
- 從實際的對話內容推理，有根據地懷疑`,

  [Role.SEER]: `你是【預言家】。每晚可查驗一名玩家，得知其真實身份。
- 謹慎使用情報：過早暴露身份會讓狼人優先淘汰你
- 考慮是否公開身份，還是暗中引導投票`,

  [Role.WITCH]: `你是【女巫】。你有兩瓶藥水：解藥（救人，僅限一次）和毒藥（毒殺，僅限一次）。
- 夜晚：你能看到狼人選的目標，決定是否要救他
- 毒藥可以對任何存活玩家使用`,

  [Role.HUNTER]: `你是【獵人】。無論何種原因死亡，你可以帶走一名玩家。
- 盡量保持存活，你的威脅會讓狼人不敢輕易對你下手`,

  [Role.UNKNOWN]: `你的角色尚未設定。`,
};

const BASE_SYSTEM_PROMPT = `你正在 Slack 上玩狼人殺。你必須用繁體中文回應，策略性且自然地扮演一個真實玩家。

遊戲規則：
- 狼人：每晚選一名村民淘汰，白天混入人群不被發現
- 村民：透過白天討論與投票，找出並淘汰所有狼人
- 特殊身份：預言家（每晚查驗一人）、女巫（一次救人、一次毒人）、獵人（死亡時帶走一人）
- 勝利條件：村民淘汰所有狼人獲勝；狼人數量等於或超過村民獲勝

行為規則：
- **一律用繁體中文回應**，語氣自然、口語化，像真人在聊天
- 絕對不能透露自己是 AI 或機器人
- 發言要簡短（討論時 1–3 句即可），不要長篇大論
- 根據對話內容推理，有根據地表達懷疑
- 適時表現猶豫感：「嗯⋯⋯」、「我有點懷疑」、「說不定啦」、「感覺怪怪的」
- 偶爾反問其他玩家，探測他們的反應

夜晚行動時：只輸出目標玩家的名字或 ID，不要其他內容。`;

function buildSystemPrompt(personality?: PersonalityConfig): string {
  if (!personality) return BASE_SYSTEM_PROMPT;
  return `${BASE_SYSTEM_PROMPT}

你的個性特徵（${personality.name}）：
${personality.traits}`;
}

export class WerewolfAgent {
  private provider: LLMProvider;
  public gameState: GameState;
  private lastResponseTime = 0;
  private systemPrompt: string;
  /** 玩家層級的個性（優先於角色層級） */
  private playerPersonality?: PersonalityConfig;

  constructor(personality?: PersonalityConfig) {
    this.provider = createProvider();
    this.gameState = new GameState();
    this.playerPersonality = personality;
    this.systemPrompt = buildSystemPrompt(personality);
  }

  /**
   * 根據角色設定個性（僅在無玩家層級個性時生效）。
   * 在角色分配後由遊戲引擎呼叫。
   */
  setRolePersonality(personality: PersonalityConfig) {
    if (!this.playerPersonality) {
      this.systemPrompt = buildSystemPrompt(personality);
    }
  }

  private buildPrompt(action: string): string {
    const gs = this.gameState;
    const roleDesc = ROLE_DESCRIPTIONS[gs.myRole];
    const nameHint = gs.myName ? `你的名字：${gs.myName}（請用這個名字稱呼自己）\n` : "";

    return `${nameHint}你的身份：${gs.myRole.toUpperCase()}
${roleDesc}

目前遊戲狀況：
${gs.getContextStr()}

最近對話：
${gs.getRecentConversation() || "（尚無訊息）"}

你需要做的事：${action}`;
  }

  private async callLLM(prompt: string, maxTokens = 200): Promise<string> {
    return this.provider.complete(this.systemPrompt, prompt, maxTokens);
  }

  /** Generate a discussion message for the day phase.
   *  Pass force=true to bypass the cooldown (used in multi-agent games). */
  async discuss(triggerMessage = "", force = false): Promise<string> {
    const now = Date.now();
    // Cooldown: don't proactively respond more than once per 15s
    if (!force && !triggerMessage && now - this.lastResponseTime < 15_000) return "";

    const action = triggerMessage
      ? `有人剛說了：「${triggerMessage}」。回應這則訊息，分享你的想法。`
      : "加入討論，針對剛才的對話發表意見或表達你的懷疑。";

    const response = await this.callLLM(this.buildPrompt(action), 200);
    this.lastResponseTime = Date.now();
    return response;
  }

  /** Decide who to vote for during the voting phase. */
  async decideVote(): Promise<string> {
    const action = "現在要投票放逐人了。決定要投誰出局，並用 2–3 句話說明你的理由。";
    return this.callLLM(this.buildPrompt(action), 150);
  }

  /**
   * Perform the night action appropriate to the bot's role.
   * Returns the target player name/ID, or a witch command ("save X" / "poison X" / "pass").
   */
  async nightAction(): Promise<string> {
    const { myRole } = this.gameState;

    let action: string;
    if (myRole === Role.WEREWOLF) {
      action = "選一名存活玩家（不能是狼人隊友）今晚淘汰。只輸出那個玩家的名字或 ID，不要其他文字。";
    } else if (myRole === Role.SEER) {
      action = "選一名存活玩家今晚查驗。只輸出那個玩家的名字或 ID，不要其他文字。";
    } else if (myRole === Role.WITCH) {
      action = "決定今晚是否使用藥水。只輸出以下其中一種格式：'save <玩家名>' 或 'poison <玩家名>' 或 'pass'。";
    } else {
      return "";
    }

    return (await this.callLLM(this.buildPrompt(action), 50)).trim();
  }

  /** Hunter's dying shot — pick one player to eliminate. */
  async hunterShot(): Promise<string> {
    const action = "你是獵人，剛被淘汰了！馬上選一名玩家跟你一起出局。只輸出那個玩家的名字或 ID，不要其他文字。";
    return (await this.callLLM(this.buildPrompt(action), 30)).trim();
  }

  /** Record seer investigation result. */
  recordSeerResult(player: string, isWerewolf: boolean) {
    this.gameState.knownRoles[player] = isWerewolf ? "werewolf" : "villager";
  }
}
