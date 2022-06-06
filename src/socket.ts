import { env } from "process";
import { v4 } from "uuid";
import { WebSocket, MessageEvent } from "ws";
import * as std from "./standard-events.js";
import { AnyEvent } from "./events.js";
import { GameServer } from "./server.js";
import { Player } from "./player.js";

/** The time between pings in seconds */
export const HEARTBEAT_INTERVAL = Number(env.HEARTBEAT_INTERVAL || 15 * 60);

/** An exendable base class for creating players. */
export abstract class Socket {
  protected abstract server: GameServer;
  protected gameId?: string;
  protected abstract player?: Player;
  protected spectating: boolean = false;
  private socket: WebSocket;
  public readonly socketId: string = v4();
  private connectionAlive: boolean = true;
  private heartbeatInterval?: NodeJS.Timer;

  public constructor(socket: WebSocket) {
    this.socket = socket;
    this.socket.addEventListener("message", (message: MessageEvent) => this.handleMessage(message));
    this.startHeartbeat();
  }

  /**
   * Pings the Client every `HEARTBEAT_INTERVAL` seconds and terminates
   * the WebSocket connection if the client does not respond.
   */
  private startHeartbeat() {
    this.socket.on('pong', () => this.connectionAlive = true);
    this.socket.on('close', () => {
      if (this.player) this.player.disconnectSocket(this.socketId);
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    });
    this.heartbeatInterval = setInterval(() => {
      if (this.connectionAlive === false) {
        this.socket.terminate();
        if (this.player) this.player.disconnectSocket(this.socketId);
      }
      this.connectionAlive = false;
      this.socket.ping();
    }, HEARTBEAT_INTERVAL * 1000);
  }

  /**
   * Handles messages that that are sent to this `Socket` its peer.
   * @param message the message event
   */
  private handleMessage(message: MessageEvent) {
    try {
      const deserialized = JSON.parse(message.data.toString());
      if (typeof deserialized !== "object") {
        this.emit("server", {
          name: "cg_error",
          data: { message: "Message must represent a JSON object." }
        });
      } else if (!this.handleStandardEvent(deserialized) && !this.handleEvent(deserialized)) {
        this.emit("server", {
          name: "cg_error",
          data: { message: `This server does not handle '${deserialized.name}' events.` }
        });
      }
    } catch (_err) {
      this.emit("server", {
        name: "cg_error",
        data: { message: "Unable to deserialize message." }
      });
    }
  }

  /**
   * Handles standard events sent to this `Socket`.
   * @param event the event
   * @returns if an the event was handled
   */
  private handleStandardEvent(event: std.Events): boolean {
    try {
      switch (event.name) {
        case "cg_join":
          this.player = this.server.join(event.data.game_id, event.data.username, this);
          this.gameId = event.data.game_id;
          break;
        case "cg_leave":
          if (this.player) this.player.leave();
          if (this.gameId) this.server.leaveGame(this.gameId);
          if (this.spectating && this.gameId) this.server.stopSpectating(this.gameId, this.socketId);
          break;
        case "cg_connect":
          this.player = this.server.connect(
            event.data.game_id,
            event.data.player_id,
            event.data.secret,
            this
          );
          this.gameId = event.data.game_id;
          break;
        case "cg_spectate":
          this.server.spectate(event.data.game_id, this);
          this.gameId = event.data.game_id;
          break;
        default: return false;
      }
    } catch (err) {
      this.emit("server", {
        name: "cg_error",
        data: { message: String(err) }
      });
    }
    return true;
  }

  /**
   * Handles custom events sent to this `Socket`. Standard events are handled automatically.
   * @param event the event
   * @returns if an the event was handled
   */
  protected handleEvent(event: AnyEvent): boolean {
    return false;
  }

  /**
   * Sends an event to this `Socket`'s peer.
   * @param origin the player_id that triggered the event
   * @param event the event
   */
  public emit<E extends AnyEvent = AnyEvent>(origin: string, event: std.Events | E) {
    try {
      this.socket.send(JSON.stringify({ origin, event }));
    } catch (err) {
      console.error(err);
    }
  }
}
