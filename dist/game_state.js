"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameState = exports.Role = exports.Phase = void 0;
var Phase;
(function (Phase) {
    Phase["WAITING"] = "waiting";
    Phase["NIGHT"] = "night";
    Phase["DAY"] = "day";
    Phase["VOTING"] = "voting";
    Phase["ENDED"] = "ended";
})(Phase || (exports.Phase = Phase = {}));
var Role;
(function (Role) {
    Role["WEREWOLF"] = "werewolf";
    Role["VILLAGER"] = "villager";
    Role["SEER"] = "seer";
    Role["WITCH"] = "witch";
    Role["HUNTER"] = "hunter";
    Role["UNKNOWN"] = "unknown";
})(Role || (exports.Role = Role = {}));
class GameState {
    constructor() {
        this.channelId = "";
        this.myRole = Role.UNKNOWN;
        this.myUserId = "";
        this.myName = ""; // display name used in multi-agent games
        this.players = [];
        this.alivePlayers = [];
        this.deadPlayers = [];
        this.phase = Phase.WAITING;
        this.dayNumber = 0;
        /** Seer's investigation results: playerId → "werewolf" | "villager" */
        this.knownRoles = {};
        this.conversationHistory = [];
    }
    addMessage(user, text) {
        this.conversationHistory.push({ user, text });
        // Keep last 50 messages to bound context size
        if (this.conversationHistory.length > 50) {
            this.conversationHistory = this.conversationHistory.slice(-50);
        }
    }
    eliminatePlayer(playerId) {
        this.alivePlayers = this.alivePlayers.filter((p) => p !== playerId);
        if (!this.deadPlayers.includes(playerId)) {
            this.deadPlayers.push(playerId);
        }
    }
    reset(channelId, myUserId) {
        this.channelId = channelId;
        this.myRole = Role.UNKNOWN;
        this.myUserId = myUserId;
        this.myName = "";
        this.players = [];
        this.alivePlayers = [];
        this.deadPlayers = [];
        this.phase = Phase.WAITING;
        this.dayNumber = 0;
        this.knownRoles = {};
        this.conversationHistory = [];
    }
    getContextStr() {
        const lines = [
            `Day: ${this.dayNumber}`,
            `Phase: ${this.phase}`,
            `Alive players: ${this.alivePlayers.join(", ") || "unknown"}`,
            `Dead players: ${this.deadPlayers.join(", ") || "none"}`,
        ];
        if (Object.keys(this.knownRoles).length > 0) {
            const known = Object.entries(this.knownRoles)
                .map(([p, r]) => `${p}=${r}`)
                .join(", ");
            lines.push(`Known roles (your investigation results): ${known}`);
        }
        return lines.join("\n");
    }
    getRecentConversation(n = 20) {
        return this.conversationHistory
            .slice(-n)
            .map((m) => `${m.user}: ${m.text}`)
            .join("\n");
    }
}
exports.GameState = GameState;
