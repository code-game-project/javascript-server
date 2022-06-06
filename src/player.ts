import { v4 } from "uuid";
import { AnyEvent } from "./events.js";
import * as std from "./standard-events.js";
import { randomSecret } from "./secret.js";
import { Socket } from "./socket.js";
import { Game } from "./game.js";

/** An exendable base class for creating players. */
export abstract class Player {
  protected abstract sockets: { [index: string]: Socket; };
  public inactiveSince = 0;
  protected abstract game: Game;
  public readonly playerId: string = v4();
  public readonly username: string;
  private secret: string = randomSecret();

  public constructor(username: string, socket: Socket) {
    this.username = username;
    socket.emit(this.playerId, { name: "cg_joined", data: { secret: this.secret } });
  }

  /**
   * Verifies if a given secret is the secret for this `Player`.
   * @param secret the secret
   * @returns if the secret is valid
   */
  public verifySecret(secret: string): boolean {
    return this.secret === secret;
  }

  /**
   * Connects a `Socket` to this `Player`.
   * 
   * All connected `Socket`s are able to control this `Player` and
   * receive all events emitted to this `Player`.
   * @param socket the socket
   */
  public connectSocket(socket: Socket) {
    this.sockets[socket.socketId] = socket;
    socket.emit(this.playerId, { name: "cg_connected", data: { username: this.username } });
  }

  /**
   * Disconnects a `Socket` from this `Player`.
   * @param socketId the socket_id of the socket that is to be disconnected
   */
  public disconnectSocket(socketId: string) {
    delete this.sockets[socketId];
    if (Object.keys(this.sockets).length === 0) this.inactiveSince = Date.now();
  }

  /**
   * Checks if the player has any sockets.
   * @returns if the player is active
   */
  public active(): boolean {
    return Object.keys(this.sockets).length !== 0;
  }

  /**
   * Sends an event to all `Socket`s associated with this `Player`.
   * @param origin the player_id that triggered the event
   * @param event the event
   */
  public emit<E extends AnyEvent = AnyEvent>(origin: string, event: std.Events | E) {
    Object.values(this.sockets).forEach((socket) => socket.emit(origin, event));
  }

  /** Leaves the game. */
  public leave() {
    this.game.removePlayer(this.playerId);
  }
}
