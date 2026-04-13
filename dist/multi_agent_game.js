"use strict";
/**
 * multi_agent_game.ts
 *
 * Runs a fully autonomous Werewolf game with N Claude agents.
 * All agents share a public conversation log; private info (roles, night
 * results) is injected only into the relevant agent's game state.
 *
 * results) is injected only into the relevant agent's game state.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WerewolfMultiAgentGame = void 0;
const agent_1 = require("./agent");
const game_state_1 = require("./game_state");
// ── Role presets by player count ────────────────────────────────────────────
const ROLE_PRESETS = {
    4: [game_state_1.Role.WEREWOLF, game_state_1.Role.SEER, game_state_1.Role.VILLAGER, game_state_1.Role.VILLAGER],
    5: [game_state_1.Role.WEREWOLF, game_state_1.Role.SEER, game_state_1.Role.VILLAGER, game_state_1.Role.VILLAGER, game_state_1.Role.VILLAGER],
    6: [game_state_1.Role.WEREWOLF, game_state_1.Role.WEREWOLF, game_state_1.Role.SEER, game_state_1.Role.VILLAGER, game_state_1.Role.VILLAGER, game_state_1.Role.VILLAGER],
    7: [game_state_1.Role.WEREWOLF, game_state_1.Role.WEREWOLF, game_state_1.Role.SEER, game_state_1.Role.WITCH, game_state_1.Role.VILLAGER, game_state_1.Role.VILLAGER, game_state_1.Role.VILLAGER],
    8: [game_state_1.Role.WEREWOLF, game_state_1.Role.WEREWOLF, game_state_1.Role.SEER, game_state_1.Role.WITCH, game_state_1.Role.HUNTER, game_state_1.Role.VILLAGER, game_state_1.Role.VILLAGER, game_state_1.Role.VILLAGER],
};
class WerewolfMultiAgentGame {
    constructor(options) {
        this.players = [];
        this.publicLog = []; // all public messages
        this.dayNumber = 0;
        this.phase = game_state_1.Phase.WAITING;
        const { playerNames, personalities, rolePersonalities = {}, delayMs = 2000, discussionRounds = 2, } = options;
        this.rolePersonalities = rolePersonalities;
        this.delayMs = delayMs;
        this.discussionRounds = discussionRounds;
        this.players = playerNames.map((name, i) => {
            const personality = personalities?.[i] ?? undefined;
            return {
                id: `P${i + 1}`,
                name,
                role: game_state_1.Role.UNKNOWN,
                agent: new agent_1.WerewolfAgent(personality),
                alive: true,
                personality,
            };
        });
    }
    // ── Helpers ────────────────────────────────────────────────────────────────
    get alivePlayers() {
        return this.players.filter((p) => p.alive);
    }
    nameOf(id) {
        return this.players.find((p) => p.id === id)?.name ?? id;
    }
    /** Try to match a raw string (name or ID) to a player. */
    resolvePlayer(raw) {
        const normalised = raw.trim();
        return (this.players.find((p) => p.name === normalised) ??
            this.players.find((p) => p.id === normalised) ??
            // partial name match as fallback
            this.players.find((p) => p.name.includes(normalised) || normalised.includes(p.name)));
    }
    sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }
    shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
    // ── Broadcast (public log) ─────────────────────────────────────────────────
    async broadcast(text, speaker = "🎲 主持人") {
        this.publicLog.push({ speaker, text });
        console.log(`\n[${speaker}] ${text}`);
    }
    async playerSpeak(player, text) {
        await this.broadcast(text, player.name);
    }
    /** Private log — only goes to console (simulates secret info). */
    privateLog(label, msg) {
        console.log(`  🔒 [${label}] ${msg}`);
    }
    // ── Sync public state into an agent's game state ───────────────────────────
    syncAgentState(player) {
        const gs = player.agent.gameState;
        gs.phase = this.phase;
        gs.dayNumber = this.dayNumber;
        // Give the agent the full public conversation so it can reason from it
        gs.conversationHistory = this.publicLog.map((m) => ({
            user: m.speaker,
            text: m.text,
        }));
        // Alive / dead from each agent's perspective (agent is alive but not in alivePlayers list)
        gs.alivePlayers = this.alivePlayers
            .filter((p) => p.id !== player.id)
            .map((p) => p.name); // use names so Claude can reference them naturally
        gs.deadPlayers = this.players
            .filter((p) => !p.alive)
            .map((p) => p.name);
    }
    // ── Setup ──────────────────────────────────────────────────────────────────
    async setup() {
        const n = this.players.length;
        const preset = ROLE_PRESETS[n];
        if (!preset)
            throw new Error(`不支援 ${n} 人遊戲，請用 4–8 人`);
        const shuffled = this.shuffle(preset);
        for (let i = 0; i < this.players.length; i++) {
            const p = this.players[i];
            p.role = shuffled[i];
            const gs = p.agent.gameState;
            gs.myRole = p.role;
            gs.myUserId = p.id;
            gs.myName = p.name;
            gs.players = this.players.map((x) => x.name); // name-based for natural speech
            // Apply role-based personality (player-level personality takes precedence)
            const rolePersonality = this.rolePersonalities[p.role];
            if (rolePersonality) {
                p.agent.setRolePersonality(rolePersonality);
                if (!p.personality)
                    p.personality = rolePersonality;
            }
        }
        // Tell werewolves who their teammates are (private knowledge)
        const wolves = this.players.filter((p) => p.role === game_state_1.Role.WEREWOLF);
        for (const wolf of wolves) {
            for (const other of wolves) {
                if (other.id !== wolf.id) {
                    wolf.agent.gameState.knownRoles[other.name] = "werewolf";
                }
            }
        }
        await this.broadcast(`遊戲開始！${n} 名 AI 玩家：${this.players.map((p) => p.name).join("、")}\n` +
            `本局角色：${[...preset].sort().join("、")}`);
        await this.sleep(this.delayMs);
        // Private role announcements (console only)
        console.log("\n── 角色分配（私訊）──");
        for (const p of this.players) {
            const teammates = wolves.filter((w) => w.id !== p.id).map((w) => w.name);
            const note = p.role === game_state_1.Role.WEREWOLF && teammates.length > 0
                ? `，隊友：${teammates.join("、")}`
                : "";
            const personalityNote = p.personality ? ` ｜ 個性：${p.personality.name}` : "";
            this.privateLog("角色", `${p.name} → 【${p.role}】${note}${personalityNote}`);
        }
        console.log("──────────────────\n");
    }
    // ── Win condition ──────────────────────────────────────────────────────────
    checkWin() {
        const wolves = this.alivePlayers.filter((p) => p.role === game_state_1.Role.WEREWOLF);
        const others = this.alivePlayers.filter((p) => p.role !== game_state_1.Role.WEREWOLF);
        if (wolves.length === 0)
            return "villagers";
        if (wolves.length >= others.length)
            return "werewolves";
        return null;
    }
    // ── Night phase ────────────────────────────────────────────────────────────
    async nightPhase() {
        this.phase = game_state_1.Phase.NIGHT;
        await this.broadcast(`☾ 第 ${this.dayNumber} 夜開始，請閉眼⋯⋯`);
        await this.sleep(this.delayMs);
        // 1. Werewolves vote on kill target
        const wolves = this.alivePlayers.filter((p) => p.role === game_state_1.Role.WEREWOLF);
        const killVotes = {};
        for (const wolf of wolves) {
            this.syncAgentState(wolf);
            const raw = await wolf.agent.nightAction();
            const target = this.resolvePlayer(raw);
            if (target && target.alive && target.role !== game_state_1.Role.WEREWOLF) {
                this.privateLog("夜晚", `${wolf.name}（狼人）選擇攻擊：${target.name}`);
                killVotes[target.name] = (killVotes[target.name] ?? 0) + 1;
            }
        }
        const killTargetName = Object.entries(killVotes).sort((a, b) => b[1] - a[1])[0]?.[0];
        // 2. Seer investigates
        const seer = this.alivePlayers.find((p) => p.role === game_state_1.Role.SEER);
        if (seer) {
            this.syncAgentState(seer);
            const raw = await seer.agent.nightAction();
            const target = this.resolvePlayer(raw);
            if (target) {
                const isWolf = target.role === game_state_1.Role.WEREWOLF;
                seer.agent.recordSeerResult(target.name, isWolf);
                this.privateLog("夜晚", `${seer.name}（預言家）查驗 ${target.name} → ${isWolf ? "狼人 🐺" : "好人 👤"}`);
            }
        }
        // 3. Witch
        const witch = this.alivePlayers.find((p) => p.role === game_state_1.Role.WITCH);
        let witchSaved = false;
        let witchPoisonName = null;
        if (witch) {
            // Inject private info about tonight's victim
            const gs = witch.agent.gameState;
            gs.conversationHistory = [
                ...this.publicLog.map((m) => ({ user: m.speaker, text: m.text })),
                {
                    user: "主持人（私訊）",
                    text: killTargetName
                        ? `今晚狼人選擇攻擊：${killTargetName}。你是否要使用藥水？`
                        : "今晚是平安夜，沒有玩家被攻擊。",
                },
            ];
            this.syncAgentState(witch);
            const action = (await witch.agent.nightAction()).trim().toLowerCase();
            this.privateLog("夜晚", `${witch.name}（女巫）決定：${action}`);
            if (action.startsWith("save") && killTargetName) {
                witchSaved = true;
                this.privateLog("夜晚", `女巫使用解藥救了 ${killTargetName}`);
            }
            else if (action.startsWith("poison")) {
                const rawTarget = action.replace(/^poison\s*/i, "").trim();
                const target = this.resolvePlayer(rawTarget);
                if (target?.alive)
                    witchPoisonName = target.name;
            }
        }
        // Apply results
        const deaths = [];
        if (killTargetName && !witchSaved) {
            const p = this.players.find((x) => x.name === killTargetName);
            if (p?.alive) {
                p.alive = false;
                deaths.push(p.name);
            }
        }
        if (witchPoisonName) {
            const p = this.players.find((x) => x.name === witchPoisonName);
            if (p?.alive) {
                p.alive = false;
                deaths.push(p.name);
            }
        }
        await this.sleep(this.delayMs);
        await this.broadcast(deaths.length > 0
            ? `☀️ 天亮了！昨晚死亡：${deaths.join("、")}`
            : `☀️ 天亮了！昨晚平安夜，無人死亡。`);
        // Hunter trigger
        for (const deadName of deaths) {
            const dead = this.players.find((p) => p.name === deadName);
            if (dead?.role === game_state_1.Role.HUNTER) {
                this.syncAgentState(dead);
                const raw = await dead.agent.hunterShot();
                const target = this.resolvePlayer(raw);
                if (target?.alive) {
                    target.alive = false;
                    await this.broadcast(`💥 獵人 ${dead.name} 臨死帶走了 ${target.name}！`, dead.name);
                }
            }
        }
    }
    // ── Day phase ──────────────────────────────────────────────────────────────
    async dayPhase() {
        this.phase = game_state_1.Phase.DAY;
        this.dayNumber++;
        await this.broadcast(`💬 第 ${this.dayNumber} 天討論開始`);
        await this.sleep(this.delayMs);
        // Discussion rounds
        for (let round = 0; round < this.discussionRounds; round++) {
            await this.broadcast(`── 第 ${round + 1} 輪發言 ──`);
            const order = this.shuffle(this.alivePlayers);
            for (const player of order) {
                this.syncAgentState(player);
                const response = await player.agent.discuss("", true); // force=true bypasses cooldown
                if (response) {
                    await this.playerSpeak(player, response);
                    await this.sleep(this.delayMs);
                }
            }
        }
        // Voting
        this.phase = game_state_1.Phase.VOTING;
        await this.broadcast(`🗳️ 投票時間！選出你認為最可疑的玩家`);
        await this.sleep(this.delayMs);
        const voteTally = {};
        for (const player of this.alivePlayers) {
            this.syncAgentState(player);
            const response = await player.agent.decideVote();
            await this.playerSpeak(player, response);
            await this.sleep(this.delayMs / 2);
            // Extract vote target by scanning for player names in the response
            const voted = this.alivePlayers.find((p) => p.id !== player.id && response.includes(p.name));
            if (voted) {
                voteTally[voted.name] = (voteTally[voted.name] ?? 0) + 1;
                this.privateLog("投票統計", `${player.name} → ${voted.name}`);
            }
        }
        // Determine who gets eliminated
        const sorted = Object.entries(voteTally).sort((a, b) => b[1] - a[1]);
        const eliminatedName = sorted[0]?.[0];
        if (eliminatedName) {
            const eliminated = this.players.find((p) => p.name === eliminatedName);
            eliminated.alive = false;
            await this.broadcast(`⚖️ 投票結果：${eliminated.name} 以 ${sorted[0][1]} 票出局！真實身份：【${eliminated.role}】`);
            // Hunter trigger on day elimination
            if (eliminated.role === game_state_1.Role.HUNTER) {
                this.syncAgentState(eliminated);
                const raw = await eliminated.agent.hunterShot();
                const target = this.resolvePlayer(raw);
                if (target?.alive) {
                    target.alive = false;
                    await this.broadcast(`💥 獵人 ${eliminated.name} 臨死帶走了 ${target.name}！真實身份：【${target.role}】`, eliminated.name);
                }
            }
        }
        else {
            await this.broadcast("⚖️ 投票無效，無人出局（票數分散）");
        }
    }
    // ── Main game loop ─────────────────────────────────────────────────────────
    async run() {
        await this.setup();
        await this.sleep(this.delayMs);
        for (let iteration = 0; iteration < 20; iteration++) {
            // Safety cap: max 20 rounds
            const preNightWin = this.checkWin();
            if (preNightWin) {
                await this.announceWinner(preNightWin);
                return;
            }
            await this.nightPhase();
            const postNightWin = this.checkWin();
            if (postNightWin) {
                await this.announceWinner(postNightWin);
                return;
            }
            await this.dayPhase();
        }
        await this.broadcast("⏰ 遊戲超過回合上限，強制結束");
    }
    async announceWinner(winner) {
        await this.broadcast(winner === "villagers"
            ? "🎉 遊戲結束！好人陣營獲勝！所有狼人已被淘汰！"
            : "🐺 遊戲結束！狼人陣營獲勝！狼人數量已與好人相當！");
        console.log("\n══ 最終角色揭曉 ══");
        for (const p of this.players) {
            const status = p.alive ? "存活" : "已出局";
            console.log(`  ${p.name.padEnd(6)} │ 【${p.role}】 │ ${status}`);
        }
        console.log("══════════════════\n");
    }
}
exports.WerewolfMultiAgentGame = WerewolfMultiAgentGame;
