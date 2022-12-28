import type { WebSocket } from "ws";
import type { Game } from "./game.js";
import { Socket } from "./socket.js";
import { AnyEvent } from "./game-socket.js";

export class SpectatorSocket<Config extends object = object> extends Socket {
  /** A reference to the game that the socket belongs to. */
  protected game: Game<Config>;

  public constructor(game: Game<Config>, socket: WebSocket, heartbeatIntervalSeconds: number) {
    super(socket, heartbeatIntervalSeconds);
    this.game = game;
  }

  /**
   * Sends an event to the socket's websocket peer.
   * @param event The event to send to the websocket's peer.
   */
  public send<E extends AnyEvent = AnyEvent>(message: E) {
    try {
      this.socket.send(JSON.stringify(message));
    } catch (err) {
      console.error(err);
    }
  }

  protected onDisconnect(): void {
    this.game.removeSpectator(this);
  }
}
