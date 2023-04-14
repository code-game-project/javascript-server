import { v4 } from "uuid";
import type { Player } from "./player.js";
import type { AnyEvent } from "./game-socket.js";
import type { SpectatorSocket } from "./spectator-socket.js";
import { randomSecret } from "./secret.js";
import { Logger } from "./logger.js";

const DEFAULT_MAX_PLAYER_COUNT = 6;
const DEFAULT_MAX_INACTIVE_MINUTES = 10;

/** An extendable base class for creating games. */
export abstract class Game<Config extends object = object> {
  /** The maximum amount of players allowed in one game at a time. */
  protected readonly MAX_PLAYER_COUNT: number;
  /** The maximum inactive time of a player in minutes. */
  protected readonly MAX_INACTIVE_TIME_MINUTES: number;
  /** The game's game ID. */
  public readonly id = v4();
  /** Whether the game is protected. */
  public readonly protected: boolean;
  /** The game's join secret. */
  public readonly secret: string = randomSecret();
  /** Custom config options provided at creation time. */
  public readonly config: Config;
  /** The players in the game. */
  private readonly players: { [index: string]: Player; } = {};
  /** The sockets spectating the game. */
  private readonly spectators: { [index: string]: SpectatorSocket<Config>; } = {};
  public readonly logger = new Logger<Config>();
  private joiningAllowed = true;

  /**
   * Creates a new game.
   * @param protected Whether the game should be protected by a join secret.
   * @param config Custom config options provided at creation time.
   * @param maxPlayerCount Maximum amount of players allowed in one game at a time. The default is 6. The minimum is 1.
   * @param maxInactiveTimeMinutes Maximum inactive time of a player in minutes. The default is 10 minutes.
   */
  constructor(
    _protected: boolean,
    config?: object,
    maxPlayerCount: number = DEFAULT_MAX_PLAYER_COUNT,
    maxInactiveTimeMinutes: number = DEFAULT_MAX_INACTIVE_MINUTES
  ) {
    this.MAX_PLAYER_COUNT = maxPlayerCount ? Math.max(maxPlayerCount, 1) : DEFAULT_MAX_PLAYER_COUNT;
    this.MAX_INACTIVE_TIME_MINUTES = maxInactiveTimeMinutes || DEFAULT_MAX_INACTIVE_MINUTES;
    this.protected = _protected;
    this.config = this.configSanitizer(config);
  }

  /**
   * Takes a potentially faulty or incomplete configuration object and returns a valid one.
   * @param config An unprocessed configuration object directly from the user.
   * @returns a valid config.
   * 
   * ## Example Implementation
   * 
   * ```ts
   * import { GameConfig } from "./game-types.js";
   * 
   * const defaultConfig: GameConfig = {
   *   some_property: 90,
   *   another_property: true
   * };
   *
   * export class MyGame extends Game<GameConfig> {
   *   protected configSanitizer(config?: object): GameConfig {
   *     // merge our config with the default so that we don't have any undefined properties
   *     const complete = Object.assign(defaultConfig, config);
   *     const sanitized: GameConfig = {
   *       // `some_property` has a minimum value
   *       some_property: Math.max(complete.some_property, 10),
   *       // `another_property` can only be `false` if `some_property` is greater than `60`
   *       another_property: complete.some_property > 60 ? complete.another_property : true
   *     };
   *     return sanitized;
   *   }
   * 
   *   // <-- snip -->
   * }
   * ```
   */
  protected abstract configSanitizer(config?: object): Config;

  /**
   * Verifies if a given secret is correct.
   * @param secret A given join secret.
   * @returns whether the secret is valid.
  */
  public verifySecret(secret: string): boolean {
    return this.secret === secret;
  }

  /**
   * Checks if the game has any active players.
   * @returns whether there are active players or they have not been inactive for too long.
   */
  public active() {
    let active = false;
    const now = Date.now();
    for (const player of Object.values(this.players)) {
      if (player.active() || player.inactiveSince > now - this.MAX_INACTIVE_TIME_MINUTES * 60 * 1000) active = true;
      else player.terminate();
    }
    return active;
  }

  /** Terminates all attached websocket connections. */
  public terminate() {
    this.logger.warn("This game is being terminated due to inactivity.");
    for (const player of Object.values(this.players)) {
      player.terminate();
    }
  }

  /**
   * Broadcasts an event to all players and spectators in the game.
   * @param event The event to send to everyone in the game.
   * @param omitPlayersById The IDs of the players to which the event should not be sent.
   */
  protected broadcastEvent<E extends AnyEvent = AnyEvent>(event: E, ...omitPlayersById: string[]) {
    this.logger.trace(`Broadcasting "${event.name}" event to all players...`, { event });
    for (const [playerId, player] of Object.entries(this.players)) {
      if (omitPlayersById.includes(playerId)) continue;
      player.sendEvent(event);
    }
    for (const spectator of Object.values(this.spectators)) {
      spectator.send(event);
    }
  }

  /**
   * Creates a new player.
   * @param username The username to assign to the new player.
   */
  protected abstract createPlayer(username: string): Player;

  /**
   * Checks if the maximum player count has been reached.
   * @returns `true` if the maximum player count has been reached.
   */
  public full(): boolean {
    return !(this.getPlayerCount() < this.MAX_PLAYER_COUNT);
  }

  /** Allows new players to join as long as the game is not full yet. */
  protected allowJoining() {
    this.joiningAllowed = true;
    this.logger.warn("Joining has been re-allowed.");
  }

  /** 
   * Prevents new players from joining the game.
   * 
   * This is useful for round-based games where joining
   * after a certain point in time might mess the game logic up.
   */
  protected disallowJoining() {
    this.joiningAllowed = false;
    this.logger.warn("Joining has been disallowed temporarily.");
  }

  /**
   * Whether the game is in a state that new players could join.
   * 
   * Note that this has nothing to do with the game being full.
   * This is strictly a game logic based prevention measure.
   */
  public joinable() {
    return this.joiningAllowed;
  }

  public getPlayerCount(): number {
    return Object.keys(this.players).length;
  }

  public getPlayers(): Readonly<{ [index: string]: Player; }> {
    return this.players;
  }

  /**
   * Gets a player by their player ID.
   * @param playerId The player ID.
   * @returns the player.
   */
  public getPlayer(playerId: string): Player {
    return this.players[playerId];
  }

  /**
   * Creates and adds a new player to the game.
   * @param username The username of the new player.
   * @returns The new player.
   * @throws if the `MAX_PLAYER_COUNT` is reached.
   */
  public addPlayer(username: string): Player {
    if (this.full()) throw "The game is full.";
    const newPlayer = this.createPlayer(username);
    this.players[newPlayer.id] = newPlayer;
    this.logger.info(`${newPlayer.username} (${newPlayer.id}) joined the game.`);
    this.playerAdded(newPlayer);
    return newPlayer;
  }

  /**
   * Runs whenever a player is added to the game.
   * @param player The player that joined.
   */
  protected abstract playerAdded(player: Player): void;

  /**
   * Removes a player from the game.
   * @param player The player to remove from the game.
   */
  public removePlayer(player: Player) {
    this.logger.info(`Player ${player.username} (${player.id}) left the game.`);
    this.playerRemoved(player);
    delete this.players[player.id];
  }

  /**
   * Runs code whenever a player is removed from the game.
   * @param player The player that was removed.
   */
  protected abstract playerRemoved(player: Player): void;

  /**
   * Adds a socket to the game as a spectator.
   * @param socket The socket that wants to spectate the game.
   */
  public addSpectator(socket: SpectatorSocket<Config>) {
    this.spectators[socket.id] = socket;
    this.logger.info(`A new spectator is now watching the game. (total spectators: ${Object.keys(this.spectators).length})`);
  }

  /**
   * Removes a spectator from the game.
   * @param socket The spectating socket to remove from the game.
  */
  public removeSpectator(socket: SpectatorSocket<Config>) {
    delete this.spectators[socket.id];
    this.logger.info(`A spectator has stopped watching the game. (total spectators: ${Object.keys(this.spectators).length})`);
  }
};
