/**
 * run_game.ts — CLI entry point for the autonomous multi-agent Werewolf game.
 *
 * Usage:
 *   npm run game
 *
 * The script will interactively ask:
 *   1. Game mode  → terminal-only  OR  Slack broadcast
 *   2. Player count (4–8)
 *   3. Personality assignment (optional) — by player or by role
 *
 * Env vars (all optional — the script will prompt for missing Slack credentials):
 *   SLACK_BOT_TOKEN      → Slack bot token (xoxb-...)
 *   GAME_CHANNEL_ID      → Slack channel to broadcast into
 *   PLAYER_NAMES         → comma-separated custom names (skips the count prompt)
 *   PLAYER_PERSONALITIES → comma-separated personality keys per player
 *                          e.g. "aggressive,cautious,analytical,,,quiet"
 *                          (empty entry = no personality for that player)
 *   ROLE_PERSONALITIES   → role=key pairs, semicolon-separated
 *                          e.g. "werewolf=aggressive;seer=analytical;villager=cautious"
 *                          Applied after role assignment; overridden by PLAYER_PERSONALITIES
 *                          Keys: aggressive, cautious, analytical, talkative,
 *                                quiet, suspicious, friendly, emotional
 *   DELAY_MS             → ms between messages (default: 2000)
 */

import readline from "readline";
import dotenv from "dotenv";
import { WerewolfMultiAgentGame, RolePersonalities } from "./multi_agent_game";
import { PRESET_PERSONALITIES, PersonalityConfig } from "./agent";
import { Role } from "./game_state";

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

  // ── Step 3: personality mode ──────────────────────────────────────────────
  let personalities: (PersonalityConfig | null)[] = playerNames.map(() => null);
  let rolePersonalities: RolePersonalities = {};

  const hasPlayerPersonalityEnv = !!process.env.PLAYER_PERSONALITIES;
  const hasRolePersonalityEnv = !!process.env.ROLE_PERSONALITIES;

  if (hasPlayerPersonalityEnv || hasRolePersonalityEnv) {
    // ── From env vars ──────────────────────────────────────────────────────
    if (hasPlayerPersonalityEnv) {
      const keys = process.env.PLAYER_PERSONALITIES!.split(",").map((s) => s.trim());
      personalities = playerNames.map((_, i) => {
        const key = keys[i];
        return key && PRESET_PERSONALITIES[key] ? PRESET_PERSONALITIES[key] : null;
      });
      console.log("\n玩家個性（來自 PLAYER_PERSONALITIES）：");
      playerNames.forEach((name, i) => {
        const p = personalities[i];
        console.log(`  ${name}：${p ? p.name : "（無特定個性）"}`);
      });
    }

    if (hasRolePersonalityEnv) {
      // Format: "werewolf=aggressive;seer=analytical;villager=cautious"
      const roleMap: Record<string, Role> = {
        werewolf: Role.WEREWOLF, villager: Role.VILLAGER, seer: Role.SEER,
        witch: Role.WITCH, hunter: Role.HUNTER,
      };
      process.env.ROLE_PERSONALITIES!.split(";").forEach((pair) => {
        const [roleKey, personalityKey] = pair.split("=").map((s) => s.trim().toLowerCase());
        const role = roleMap[roleKey];
        const personality = PRESET_PERSONALITIES[personalityKey];
        if (role && personality) rolePersonalities[role] = personality;
      });
      console.log("\n角色個性（來自 ROLE_PERSONALITIES）：");
      Object.entries(rolePersonalities).forEach(([role, p]) => {
        console.log(`  【${role}】：${(p as PersonalityConfig).name}`);
      });
    }
  } else {
    // ── Interactive ────────────────────────────────────────────────────────
    console.log("\n── 個性設定（可選）──");
    console.log("設定方式：");
    console.log("  [1] 依玩家設定（每位玩家各自選）");
    console.log("  [2] 依角色設定（同角色使用相同個性）");
    console.log("  [3] 略過（全部無特定個性）");
    const modeInput = await ask(rl, "請選擇 [預設 3]：");

    if (modeInput === "1" || modeInput === "2") {
      console.log("\n可用個性：");
      Object.entries(PRESET_PERSONALITIES).forEach(([key, p]) => {
        console.log(`  ${key.padEnd(12)} → ${p.name}：${p.traits.slice(0, 30)}…`);
      });
      console.log();
    }

    if (modeInput === "1") {
      // Per-player
      console.log("依序為每位玩家選擇個性，直接按 Enter 略過：");
      for (let i = 0; i < playerNames.length; i++) {
        const input = await ask(rl, `  ${playerNames[i]} 的個性 [留空略過]：`);
        const key = input.trim().toLowerCase();
        if (key && PRESET_PERSONALITIES[key]) {
          personalities[i] = PRESET_PERSONALITIES[key];
          console.log(`    ✅ ${PRESET_PERSONALITIES[key].name}`);
        }
      }
    } else if (modeInput === "2") {
      // Per-role
      const roles: Array<{ key: string; role: Role; label: string }> = [
        { key: "werewolf", role: Role.WEREWOLF, label: "狼人" },
        { key: "seer",     role: Role.SEER,     label: "預言家" },
        { key: "witch",    role: Role.WITCH,     label: "女巫" },
        { key: "hunter",  role: Role.HUNTER,    label: "獵人" },
        { key: "villager", role: Role.VILLAGER,  label: "平民" },
      ];
      console.log("為每種角色選擇個性，直接按 Enter 略過：");
      for (const { role, label } of roles) {
        const input = await ask(rl, `  【${label}】的個性 [留空略過]：`);
        const key = input.trim().toLowerCase();
        if (key && PRESET_PERSONALITIES[key]) {
          rolePersonalities[role] = PRESET_PERSONALITIES[key];
          console.log(`    ✅ ${PRESET_PERSONALITIES[key].name}`);
        }
      }
    }
  }

  // ── Step 4: delay ────────────────────────────────────────────────────────
  const delayMs = process.env.DELAY_MS ? Number(process.env.DELAY_MS) : 2000;

  rl.close();

  // ── Launch ───────────────────────────────────────────────────────────────
  console.log("\n── 遊戲即將開始 ──\n");

  const game = new WerewolfMultiAgentGame({
    playerNames,
    personalities,
    rolePersonalities,
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
