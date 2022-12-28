import type { GameSocket, AnyEvent, AnyCommand } from "./game-socket.js";
import type { DebugSocket } from "./debug-socket.js";
import type { Game } from "./game.js";
import { Logger } from "./logger.js";
import { v4 } from "uuid";
import { randomSecret } from "./secret.js";

/** An exendable base class for creating players. */
export abstract class Player<Config extends object = object> {
  /** The game the player belongs to. */
  protected abstract game: Game;
  /** The player's player ID. */
  public readonly id: string = v4();
  /** The player's username. */
  public readonly username: string;
  /** The player's player secret. */
  public readonly secret: string = randomSecret();
  /** A map of game sockets associated with the player. */
  protected readonly gameSockets: { [index: string]: GameSocket; } = {};
  /** A map of debug sockets associated with the player. */
  protected readonly debugSockets: { [index: string]: DebugSocket<Config>; } = {};
  /** The unix timestamp of the time that the last socket disconnected from the player. */
  public inactiveSince = 0;
  public readonly logger = new Logger<Config>();

  /**
   * Creates a new player.
   * @param username The username to assign to the player.
   */
  public constructor(username: string) {
    this.username = username;
  }

  /**
   * Verifies if a given secret is correct.
   * @param secret A given player secret.
   * @returns whether the secret is valid.
  */
  public verifySecret(secret: string): boolean {
    this.logger.warn("Player secret validation failed. Someone might be trying hijack your player. It's very unlikely they'll have any luck though.");
    return this.secret === secret;
  }

  /** Terminates all attached websocket connections. */
  public terminate() {
    this.logger.warn("This player is being terminated due to inactivity.", { inactive_since: this.inactiveSince });
    for (const socket of Object.values(this.gameSockets)) {
      socket.terminate();
    }
    for (const socket of Object.values(this.debugSockets)) {
      socket.terminate();
    }
  }

  /**
   * Connects a socket to the player.
   *
   * All connected game sockets are able to control the player and
   * receive all events emitted to the player.
   * @param gameSocket The game socket to associate with the player.
   */
  public addGameSocket(gameSocket: GameSocket) {
    this.gameSockets[gameSocket.id] = gameSocket;
    this.logger.info("A new game socket connected to the player.", { socket_id: gameSocket.id });
  }

  /**
   * Disconnects a socket from the player.
   * @param socket The game socket that is to be disconnected.
  */
  public removeGameSocket(socket: GameSocket) {
    delete this.gameSockets[socket.id];
    this.logger.info("A game socket disconnected from the player.", { socket_id: socket.id });
    if (Object.keys(this.gameSockets).length === 0) this.inactiveSince = Date.now();
  }

  /**
   * Connects a debug socket to the player.
   * @param debugSocket The debug socket to associate with the player.
   */
  public addDebugSocket(debugSocket: DebugSocket<Config>) {
    this.debugSockets[debugSocket.id] = debugSocket;
  }

  /**
   * Disconnects a debug socket from the player.
   * @param socket The debug socket that is to be disconnected.
   */
  public removeDebugSocket(socket: DebugSocket<Config>) {
    delete this.debugSockets[socket.id];
  }

  /**
   * Checks if the player has any sockets.
   * @returns whether the player is active.
   */
  public active(): boolean {
    return Object.keys(this.gameSockets).length !== 0;
  }

  /**
   * Sends an event to all game sockets associated with the player.
   * @param event The event to send to all the player's game sockets.
   */
  public sendEvent<E extends AnyEvent = AnyEvent>(event: E) {
    Object.values(this.gameSockets).forEach((socket) => socket.send(event));
    this.logger.trace(`Sent event "${event.name}".`, { event });
  }

  public handleCommandInternalWrapper(command: AnyCommand) {
    try {
      this.logger.trace(`Received command "${command.name}".`, { command });
      if (!this.handleCommand(command)) this.logger.error(`Command "${command.name}" is unknown and cannot be handled.`, { command });
    } catch (err) {
      console.error(err);
    }
  }

  /**
   * Handles custom events sent to the player by an associated socket.
   * @param command The command to be handled.
   * @returns whether the event was handled.
   */
  public abstract handleCommand(command: AnyCommand): boolean;
}
