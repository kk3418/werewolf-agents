export enum Phase {
  WAITING = "waiting",
  NIGHT = "night",
  DAY = "day",
  VOTING = "voting",
  ENDED = "ended",
}

export enum Role {
  WEREWOLF = "werewolf",
  VILLAGER = "villager",
  SEER = "seer",
  WITCH = "witch",
  HUNTER = "hunter",
  UNKNOWN = "unknown",
}

export interface ChatMessage {
  user: string;
  text: string;
}

export class GameState {
  channelId: string = "";
  myRole: Role = Role.UNKNOWN;
  myUserId: string = "";
  myName: string = ""; // display name used in multi-agent games
  players: string[] = [];
  alivePlayers: string[] = [];
  deadPlayers: string[] = [];
  phase: Phase = Phase.WAITING;
  dayNumber: number = 0;
  /** Seer's investigation results: playerId → "werewolf" | "villager" */
  knownRoles: Record<string, string> = {};
  conversationHistory: ChatMessage[] = [];

  addMessage(user: string, text: string) {
    this.conversationHistory.push({ user, text });
    // Keep last 50 messages to bound context size
    if (this.conversationHistory.length > 50) {
      this.conversationHistory = this.conversationHistory.slice(-50);
    }
  }

  eliminatePlayer(playerId: string) {
    this.alivePlayers = this.alivePlayers.filter((p) => p !== playerId);
    if (!this.deadPlayers.includes(playerId)) {
      this.deadPlayers.push(playerId);
    }
  }

  reset(channelId: string, myUserId: string) {
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

  getContextStr(): string {
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

  getRecentConversation(n = 20): string {
    return this.conversationHistory
      .slice(-n)
      .map((m) => `${m.user}: ${m.text}`)
      .join("\n");
  }
}
