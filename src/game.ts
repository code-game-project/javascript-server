import { env } from "process";
import * as std from "./standard-events";
import { AnyEvent } from "./events.js";
import { Player } from "./player.js";
import { Socket } from "./socket.js";

/** Maxiumum amount of players allowed in one game at a time. */
export const MAX_PLAYER_COUNT = env.MAX_PLAYER_COUNT ? Math.max(Number(env.MAX_PLAYER_COUNT), 2) : 5;
/** Maximum inactive time of a player in minutes. */
export const MAX_INACTIVE_TIME = Number(env.MAX_INACTIVE_TIME || 10);

/** An exendable base class for creating games. */
export abstract class Game {
  public readonly players: { [index: string]: Player; } = {};
  public readonly spectators: { [index: string]: Socket; } = {};

  /**
   * Checks if the `Game` has any active players.
   * @returns `true` if there are active players or they have not been inactive for too long
   */
  public active() {
    let active = false;
    const now = Date.now();
    for (const player of Object.values(this.players)) {
      if (player.active() || player.inactiveSince > now - MAX_INACTIVE_TIME * 60 * 1000) active = true;
    }
    return active;
  }

  /**
   * Emitts an event to all `Player`s and spectators associated with this `Game`.
   * @param origin the id of the `Player` that triggered the event
   * @param event the event
   * @param omitPlayersById the ids of the players to which the event should not be sent
   */
  protected broadcast<E extends AnyEvent = AnyEvent>(origin: string, event: std.Events | E, ...omitPlayersById: string[]) {
    for (const [playerId, player] of Object.entries(this.players)) {
      if (omitPlayersById.includes(playerId)) continue;
      player.emit(origin, event);
    }
    for (const specatator of Object.values(this.spectators)) {
      specatator.emit(origin, event);
    }
  }

  /** Creates a new `Player` instance. */
  protected abstract createPlayer(username: string, socket: Socket): Player;

  /**
   * Creates and adds a new player to the game.
   * @param username the username of the new player
   * @param socket socket the socket that wants to create a new `Player`
   * @returns the new `Player` object
   * @throws if the `MAX_PLAYER_COUNT` is reached
   */
  public addPlayer(username: string, socket: Socket): Player {
    if (Object.keys(this.players).length < MAX_PLAYER_COUNT) {
      const newPlayer = this.createPlayer(username, socket);
      this.players[newPlayer.playerId] = newPlayer;
      this.broadcast(newPlayer.playerId, { name: "cg_new_player", data: { username } });
      this.playerAdded(newPlayer.playerId);
      return newPlayer;
    } else throw "The game is full.";
  }

  /**
   * Override this method to run code whenever a player is added to the game.
   * @param playerId the ID of the player that joined
   */
  protected playerAdded(playerId: string): void {
    // Nothing
  }

  /**
   * Removes a player from the game.
   * @param playerId the id of the player that is to leave the game
   */
  public removePlayer(playerId: string) {
    this.broadcast(playerId, { name: "cg_left" });
    this.playerRemoved(playerId);
    delete this.players[playerId];
  }

  /**
   * Override this method to run code whenever a player is removed from the game.
   * @param playerId the ID of the player that joined
   */
  protected playerRemoved(playerId: string): void {
    // Nothing
  }

  /**
   * Adds a `Socket` to the game as a spectator.
   * @param socket the socket that wants to spectate the game
   */
  public addSpectator(socket: Socket) {
    this.spectators[socket.socketId] = socket;
  }

  /**
   * Removes a spectator from the game.
   * @param socketId the id of the socket that is to leave the game
   */
  public removeSpectator(socketId: string) {
    delete this.spectators[socketId];
  }
};
