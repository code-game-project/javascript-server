import type { WebSocket } from "ws";
import type { GameServer } from "./server.js";
import type { Game } from "./game.js";
import type { Player } from "./player.js";
import type { DebugMessage } from "./logger.js";
import { Socket } from "./socket.js";

export class DebugSocket<Config extends object = object> extends Socket {
  private readonly server: GameServer<Config> | null;
  private readonly game: Game<Config> | null;
  private readonly player: Player<Config> | null;

  public constructor(socket: WebSocket, server: GameServer<Config> | null, game: Game<Config> | null, player: Player<Config> | null, heartbeatIntervalSeconds: number) {
    super(socket, heartbeatIntervalSeconds);
    this.server = server;
    this.game = game;
    this.player = player;
  }

  public send(message: DebugMessage) {
    try {
      this.socket.send(JSON.stringify(message));
    } catch (err) {
      console.error(err);
    }
  }

  protected onDisconnect(): void {
    if (this.server) this.server.logger.removeDebugSocket(this);
    if (this.game) this.game.logger.removeDebugSocket(this);
    if (this.player) this.player.logger.removeDebugSocket(this);
  }
}
