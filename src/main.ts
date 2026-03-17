import { App, GenericMessageEvent } from "@slack/bolt";
import dotenv from "dotenv";
import { Phase, Role } from "./game_state";
import { WerewolfAgent } from "./agent";

dotenv.config();

// ── Slack App (Socket Mode) ────────────────────────────────────────────────
const app = new App({
  token: process.env.SLACK_BOT_TOKEN!,
  appToken: process.env.SLACK_APP_TOKEN!,
  socketMode: true,
});

const agent = new WerewolfAgent();
let BOT_USER_ID: string | null = null;

// Map of keywords → Role enum (supports Chinese + English)
const ROLE_MAP: Record<string, Role> = {
  werewolf: Role.WEREWOLF,
  狼人: Role.WEREWOLF,
  wolf: Role.WEREWOLF,
  villager: Role.VILLAGER,
  平民: Role.VILLAGER,
  seer: Role.SEER,
  預言家: Role.SEER,
  witch: Role.WITCH,
  女巫: Role.WITCH,
  hunter: Role.HUNTER,
  獵人: Role.HUNTER,
};

// ── Message Event ──────────────────────────────────────────────────────────
// Slack Bolt fires this for every message the bot can see.
app.event("message", async ({ event, say, client }) => {
  const msg = event as GenericMessageEvent & { channel_type?: string };

  // Ignore bot's own messages and subtypes (edits, deletions, etc.)
  if ((msg as any).bot_id || msg.user === BOT_USER_ID) return;
  if (msg.subtype) return;

  const text = msg.text ?? "";
  const user = msg.user;
  const channel = msg.channel;
  const channelType = (msg as any).channel_type ?? "";

  // ── DM to bot = game master commands ──────────────────────────────────
  if (channelType === "im") {
    await handleDMCommand(text, user, channel, say, client);
    return;
  }

  // ── Public / private channel = live game discussion ───────────────────
  const gs = agent.gameState;
  if (gs.phase !== Phase.DAY && gs.phase !== Phase.VOTING) return;
  if (gs.channelId && channel !== gs.channelId) return;

  // Record the message so Claude has context
  try {
    const userInfo = await client.users.info({ user });
    const u = (userInfo as any).user;
    const username = u?.profile?.display_name || u?.name || user;
    gs.addMessage(username, text);
  } catch {
    gs.addMessage(user, text);
  }

  const isMentioned = BOT_USER_ID != null && text.includes(`<@${BOT_USER_ID}>`);
  // Always reply when mentioned; randomly chime in ~30% of the time otherwise
  const shouldSpeak = isMentioned || (gs.phase === Phase.DAY && Math.random() < 0.3);

  if (shouldSpeak) {
    const response = await agent.discuss(isMentioned ? text : "");
    if (response) await say(response);
  }
});

// ── DM Command Handler ─────────────────────────────────────────────────────
// Game master sends these commands to the bot via DM to control the game.
//
//   role: werewolf           – set the bot's role
//   players: @a @b @c        – register all players
//   channel: #game-channel   – set the game channel
//   phase: day               – advance to day phase (also increments day counter)
//   phase: night             – advance to night phase
//   phase: voting            – advance to voting phase
//   dead: @player            – mark a player as eliminated
//   vote                     – ask the bot who to vote for
//   night                    – ask the bot to perform its night action
//   seer: @player good/evil  – record an investigation result (seer role)
//   status                   – show current game state
//   reset                    – reset game state
// ──────────────────────────────────────────────────────────────────────────
async function handleDMCommand(
  text: string,
  _user: string,
  channel: string,
  say: (msg: string) => Promise<unknown>,
  client: any
) {
  const lower = text.toLowerCase().trim();
  const gs = agent.gameState;

  // ── role: <name> ─────────────────────────────────────────────────────
  if (lower.startsWith("role:")) {
    const roleStr = lower.slice(5).trim();
    const role = ROLE_MAP[roleStr];
    if (role) {
      if (!BOT_USER_ID) {
        const auth = await client.auth.test();
        BOT_USER_ID = (auth as any).user_id;
      }
      gs.myRole = role;
      gs.myUserId = BOT_USER_ID!;
      await say(`✅ 角色已設定：*${role}*`);
    } else {
      await say(
        `❌ 未知角色：\`${roleStr}\`\n可用角色：${Object.keys(ROLE_MAP).join(", ")}`
      );
    }
    return;
  }

  // ── players: @p1 @p2 ... ─────────────────────────────────────────────
  if (lower.startsWith("players:")) {
    const playerIds = [...text.matchAll(/<@([A-Z0-9]+)>/g)].map((m) => m[1]);
    gs.players = playerIds;
    gs.alivePlayers = playerIds.filter((p) => p !== BOT_USER_ID);
    await say(`✅ 已設定 ${playerIds.length} 位玩家`);
    return;
  }

  // ── channel: <channel> ───────────────────────────────────────────────
  if (lower.startsWith("channel:")) {
    // Accept both raw IDs and <#C...> formatted links
    const raw = text.slice(8).trim();
    const match = raw.match(/<#([A-Z0-9]+)(?:\|[^>]*)?>/) ?? raw.match(/([A-Z0-9]+)/);
    const channelId = match ? match[1] : raw.replace(/[<>#]/g, "");
    gs.channelId = channelId;
    await say(`✅ 遊戲頻道設定為：${channelId}`);
    return;
  }

  // ── phase: day/night/voting ──────────────────────────────────────────
  if (lower.startsWith("phase:")) {
    const phaseStr = lower.slice(6).trim();
    const phaseMap: Record<string, Phase> = {
      day: Phase.DAY,
      白天: Phase.DAY,
      night: Phase.NIGHT,
      夜晚: Phase.NIGHT,
      voting: Phase.VOTING,
      投票: Phase.VOTING,
    };
    const phase = phaseMap[phaseStr];
    if (phase) {
      gs.phase = phase;
      if (phase === Phase.DAY) gs.dayNumber++;
      await say(`✅ 已進入 *${phase}* 階段 (Day ${gs.dayNumber})`);
    } else {
      await say(`❌ 未知階段：\`${phaseStr}\`\n可用：day / night / voting`);
    }
    return;
  }

  // ── dead: @player ────────────────────────────────────────────────────
  if (lower.startsWith("dead:")) {
    const playerIds = [...text.matchAll(/<@([A-Z0-9]+)>/g)].map((m) => m[1]);
    for (const pid of playerIds) gs.eliminatePlayer(pid);

    // Hunter special: bot was killed → trigger hunter's shot
    if (BOT_USER_ID && playerIds.includes(BOT_USER_ID) && gs.myRole === Role.HUNTER) {
      const shot = await agent.hunterShot();
      await say(`💥 獵人遺言：我帶走 *${shot}*`);
    } else {
      await say(`✅ 已標記死亡：${playerIds.join(", ")}`);
    }
    return;
  }

  // ── vote ─────────────────────────────────────────────────────────────
  if (lower === "vote") {
    gs.phase = Phase.VOTING;
    const response = await agent.decideVote();
    await say(`🗳️ 投票決策：\n${response}`);
    return;
  }

  // ── night ────────────────────────────────────────────────────────────
  if (lower === "night") {
    gs.phase = Phase.NIGHT;
    const result = await agent.nightAction();
    if (result) {
      await say(`🌙 夜晚行動目標：*${result}*`);
    } else {
      await say(`😴 此角色（${gs.myRole}）無夜晚行動`);
    }
    return;
  }

  // ── seer: @player good/evil ──────────────────────────────────────────
  if (lower.startsWith("seer:")) {
    const playerIds = [...text.matchAll(/<@([A-Z0-9]+)>/g)].map((m) => m[1]);
    if (playerIds.length > 0) {
      const isWolf =
        lower.includes("evil") ||
        lower.includes("werewolf") ||
        lower.includes("wolf") ||
        lower.includes("狼");
      agent.recordSeerResult(playerIds[0], isWolf);
      await say(
        `✅ 查驗結果記錄：${playerIds[0]} = ${isWolf ? "狼人 🐺" : "好人 👤"}`
      );
    } else {
      await say("❌ 請 @ 要記錄的玩家，例如：`seer: @alice good`");
    }
    return;
  }

  // ── status ───────────────────────────────────────────────────────────
  if (lower === "status") {
    await say(
      `🎮 *遊戲狀態*\n` +
        `角色：${gs.myRole}\n` +
        `階段：${gs.phase} (Day ${gs.dayNumber})\n` +
        `存活：${gs.alivePlayers.join(", ") || "未設定"}\n` +
        `死亡：${gs.deadPlayers.join(", ") || "無"}\n` +
        `已知角色：${
          Object.keys(gs.knownRoles).length
            ? JSON.stringify(gs.knownRoles)
            : "無"
        }`
    );
    return;
  }

  // ── reset ─────────────────────────────────────────────────────────────
  if (lower === "reset") {
    gs.reset(gs.channelId, BOT_USER_ID ?? "");
    await say("✅ 遊戲狀態已重置");
    return;
  }

  // ── help (fallback) ───────────────────────────────────────────────────
  await say(
    `🐺 *狼人殺 Agent 指令*（DM 此 Bot 使用）\n\n` +
      "`role: <角色>` — 設定角色\n　可用：werewolf / villager / seer / witch / hunter\n" +
      "`players: @p1 @p2 ...` — 設定玩家列表\n" +
      "`channel: #頻道` — 設定遊戲頻道\n" +
      "`phase: day/night/voting` — 切換遊戲階段\n" +
      "`dead: @玩家` — 標記玩家死亡\n" +
      "`vote` — 詢問投票決策\n" +
      "`night` — 執行夜晚行動\n" +
      "`seer: @玩家 good/evil` — 記錄預言家查驗結果\n" +
      "`status` — 查看遊戲狀態\n" +
      "`reset` — 重置遊戲"
  );
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
(async () => {
  const auth = await app.client.auth.test();
  BOT_USER_ID = (auth as any).user_id;
  console.log(`🐺 Werewolf Agent started! Bot ID: ${BOT_USER_ID}`);
  await app.start();
})();
