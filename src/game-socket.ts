import type { WebSocket, MessageEvent } from "ws";
import type { Player } from "./player.js";
import { Socket } from "./socket.js";

/** Interface representing all possible valid events. */
export type AnyEvent = {
  name: string,
  data?: object | undefined;
};

/** Interface representing all possible valid commands. */
export type AnyCommand = {
  name: string,
  data?: object | undefined;
};

export class GameSocket extends Socket {
  /** A reference to the player that the socket belongs to. */
  protected player: Player;

  public constructor(player: Player, socket: WebSocket, heartbeatIntervalSeconds: number) {
    socket.addEventListener("message", (message: MessageEvent) => this.handleMessage(message));
    super(socket, heartbeatIntervalSeconds);
    this.player = player;
  }

  /**
   * Handles messages that that are sent to the socket its peer.
   * @param message The `MessageEvent` to be handled.
   */
  private handleMessage(message: MessageEvent) {
    try {
      const deserialized = JSON.parse(message.data.toString());
      if (typeof deserialized !== "object") {
        this.player.logger.error(
          "Socket message must represent a JSON object.",
          { raw_message: message.data.toString() }
        );
      } else if (!deserialized.name) {
        this.player.logger.error(
          "Commands must have a `name` property to be valid.",
          { invalid_command: deserialized }
        );
      } else {
        this.player.handleCommandInternalWrapper(deserialized);
      }
    } catch (_err) {
      this.player.logger.error(
        "Unable to deserialize socket message.",
        { raw_message: message.data.toString() }
      );
    }
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
    this.player.removeGameSocket(this);
  }
}
