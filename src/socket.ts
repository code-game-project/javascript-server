import type { WebSocket } from "ws";
import { v4 } from "uuid";

/** An extendable base class for creating players. */
export abstract class Socket {
  /** The `WebSocket` instance to be associated with the socket. */
  protected readonly socket: WebSocket;
  /** The socket's socket. */
  public readonly id: string = v4();
  /** The time between pings in seconds. */
  protected readonly HEARTBEAT_INTERVAL_SECONDS: number;
  /** Whether the client has responded with a `pong` since the last `ping`. */
  private connectionAlive: boolean = true;
  /** The timer responsible for the websocket heartbeat. */
  private heartbeatInterval?: NodeJS.Timer;

  /**
   * Creates a new socket.
   * @param socket The `WebSocket` instance to be associated with this socket.
   * @param heartbeatIntervalSeconds The time between pings in seconds.
   */
  public constructor(socket: WebSocket, heartbeatIntervalSeconds: number) {
    this.socket = socket;
    this.HEARTBEAT_INTERVAL_SECONDS = heartbeatIntervalSeconds;
    this.startHeartbeat();
  }

  /**
   * Pings the Client every `HEARTBEAT_INTERVAL` seconds and terminates
   * the websocket connection if the client does not respond.
   */
  private startHeartbeat() {
    this.socket.on('pong', () => this.connectionAlive = true);
    this.socket.on('close', () => {
      this.onDisconnect();
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    });
    this.heartbeatInterval = setInterval(() => {
      if (this.connectionAlive === false) {
        this.socket.terminate();
        this.onDisconnect();
      }
      this.connectionAlive = false;
      this.socket.ping();
    }, this.HEARTBEAT_INTERVAL_SECONDS * 1000);
  }

  /** Simply terminates the websocket encapsuled in the socket. */
  public terminate() {
    this.socket.terminate();
  }

  /** A function that is called when the websocket disconnects. */
  protected abstract onDisconnect(): void;
}
