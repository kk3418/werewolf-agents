/**
 * run_game.ts — CLI entry point for the autonomous multi-agent Werewolf game.
 *
 * Usage:
 *   npm run game
 *
 * The script will interactively ask:
 *   1. Game mode  → terminal-only  OR  Slack broadcast
 *   2. Player count (4–8)
 *
 * Env vars (all optional — the script will prompt for missing Slack credentials):
 *   SLACK_BOT_TOKEN   → Slack bot token (xoxb-...)
 *   GAME_CHANNEL_ID   → Slack channel to broadcast into
 *   PLAYER_NAMES      → comma-separated custom names (skips the count prompt)
 *   DELAY_MS          → ms between messages (default: 2000)
 */

import readline from "readline";
import dotenv from "dotenv";
import { WerewolfMultiAgentGame } from "./multi_agent_game";

dotenv.config();

// ── Minimal readline helper ────────────────────────────────────────────────
function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
}

// ── Default player names (6 players) ──────────────────────────────────────
const DEFAULT_NAMES_6 = ["小明", "小華", "阿強", "阿美", "阿志", "小玲"];
// Extend if user picks 7 or 8
const NAME_POOL = [...DEFAULT_NAMES_6, "大雄", "靜香"];

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("\n🐺  狼人殺 Multi-Agent 遊戲\n");

  // ── Step 1: game mode ────────────────────────────────────────────────────
  console.log("遊戲模式：");
  console.log("  [1] 僅終端機（純 AI 對戰，結果印在 console）");
  console.log("  [2] 串接 Slack（同時把對話廣播到 Slack 頻道供觀戰）");
  const modeRaw = await ask(rl, "請輸入 1 或 2 [預設 1]：");
  const useSlack = modeRaw === "2";

  let slackToken: string | undefined;
  let channelId: string | undefined;

  if (useSlack) {
    slackToken = process.env.SLACK_BOT_TOKEN;
    if (!slackToken) {
      slackToken = await ask(rl, "SLACK_BOT_TOKEN (xoxb-...)：");
    }

    channelId = process.env.GAME_CHANNEL_ID;
    if (!channelId) {
      channelId = await ask(rl, "GAME_CHANNEL_ID（Slack 頻道 ID，例如 C0123456789）：");
    }

    console.log(`\n✅ Slack 模式：將廣播到頻道 ${channelId}\n`);
  } else {
    console.log("\n✅ 終端機模式：遊戲內容只會印在這裡\n");
  }

  // ── Step 2: player names ─────────────────────────────────────────────────
  let playerNames: string[];

  if (process.env.PLAYER_NAMES) {
    playerNames = process.env.PLAYER_NAMES.split(",").map((s) => s.trim());
    console.log(`玩家（來自 PLAYER_NAMES）：${playerNames.join("、")}`);
  } else {
    const countRaw = await ask(rl, "玩家人數 4–8 [預設 6]：");
    const count = parseInt(countRaw) || 6;

    if (count < 4 || count > 8) {
      console.error("❌ 請輸入 4 到 8 之間的數字");
      rl.close();
      process.exit(1);
    }

    playerNames = NAME_POOL.slice(0, count);
    console.log(`玩家：${playerNames.join("、")}`);
  }

  // ── Step 3: delay ────────────────────────────────────────────────────────
  const delayMs = process.env.DELAY_MS ? Number(process.env.DELAY_MS) : 2000;

  rl.close();

  // ── Launch ───────────────────────────────────────────────────────────────
  console.log("\n── 遊戲即將開始 ──\n");

  const game = new WerewolfMultiAgentGame({
    playerNames,
    slackToken,
    channelId,
    delayMs,
    discussionRounds: 2,
  });

  await game.run();
}

main().catch((err) => {
  console.error("遊戲發生錯誤：", err);
  process.exit(1);
});
