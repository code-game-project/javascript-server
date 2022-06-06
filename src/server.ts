import { Server } from "http";
import { v4 } from "uuid";
import { WebSocketServer, WebSocket } from "ws";
import { Game } from "./game.js";
import { Player } from "./player.js";
import { Socket } from "./socket.js";

/** Game IDs mapped to `Game` instances. */
interface Games { [index: string]: Game; }

/** An exendable base class for creating players. */
export abstract class GameServer {
  private wss: WebSocketServer;
  public readonly privateGames: Games = {};
  public readonly publicGames: Games = {};

  public constructor(server: Server, createSocket: (socket: WebSocket) => Socket) {
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on("connection", (ws) => createSocket(ws));
    this.handleUpgrades(server);
  }

  /**
   * Handles HTTP WebSocket upgrade requests to `/ws` by
   * converting them to WebSocket connections.
   * @param server the HTTP server
   */
  private handleUpgrades(server: Server) {
    server.on("upgrade", (request, socket, head) => {
      if (request.url === "/ws") {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit("connection", ws, request);
        });
      } else {
        socket.destroy();
      }
    });
  }

  /** Creates a new `Game` instance. */
  protected abstract createGame(): Game;

  /**
   * Looks for a game in the `publicGames`, as well as in the `privateGames`.
   * @param gameId the game_id
   * @returns the `Game` or undefined if the game does not exist
   */
  public getGame(gameId: string): Game | undefined {
    return this.publicGames[gameId] || this.privateGames[gameId];
  }

  /**
   * Creates a new game.
   * @param _public if the game should be listed publicly
   * @returns the game_id
   */
  public create(_public: boolean): string {
    this.deleteInactive();
    const gameId = v4();
    if (_public) this.publicGames[gameId] = this.createGame();
    else this.privateGames[gameId] = this.createGame();
    return gameId;
  }

  /** Deletes inactive games. */
  protected deleteInactive() {
    for (const [gameId, game] of Object.entries(this.publicGames)) {
      if (!game.active()) delete this.publicGames[gameId];
    }
    for (const [gameId, game] of Object.entries(this.privateGames)) {
      if (!game.active()) delete this.publicGames[gameId];
    }
  }

  /**
   * Creates a new `Player` in a given `Game`.
   * @param gameId the game_id
   * @param socket the socket that wants to join
   * @returns the `Player`
   * @throws if the game does not exist
   */
  public join(gameId: string, username: string, socket: Socket): Player {
    const game = this.getGame(gameId);
    if (game) return game.addPlayer(username, socket);
    else throw `There is no game with the game_id "${gameId}".`;
  }

  /**
   * Attempts to retrieve an existing `Player` for a `Socket`.
   * @param gameId the game_id
   * @param playerId the player_id
   * @param secret the secret
   * @param socket the socket that wants to connect
   * @returns the `Player`
   * @throws if the game does not exist or the secret is incorrect
   */
  public connect(gameId: string, playerId: string, secret: string, socket: Socket): Player {
    const game = this.getGame(gameId);
    if (game) {
      if (game.players[playerId].verifySecret(secret)) {
        const player = game.players[playerId];
        player.connectSocket(socket);
        this.emitInfo(player.playerId, game, socket);
        return player;
      }
      else throw "Incorrect player_secret";
    }
    else throw `There is no game with the game_id "${gameId}".`;
  }

  /**
   * Adds a socket to given `Game` as a specatator.
   * @param gameId the game_id
   * @param socket the socket that wants to spectate
   * @throws if the game does not exist
   */
  public spectate(gameId: string, socket: Socket) {
    const game = this.getGame(gameId);
    if (game) game.addSpectator(socket);
    else throw `There is no game with the game_id "${gameId}".`;
  }

  /**
   * Adds a socket to given `Game` as a specatator.
   * @param gameId the game_id
   * @param socketId the socket ID of the socket that wants to stop spectating
   * @throws if the game does not exist
   */
  public stopSpectating(gameId: string, socketId: string) {
    const game = this.getGame(gameId);
    if (game) game.removeSpectator(socketId);
    else throw `There is no game with the game_id "${gameId}".`;
  }

  /**
   * Emits information about a given `Game` to a new `Socket`.
   * @param playerId the player_id of the player that joined or connected
   * @param game the `Game` about which to provide the information
   * @param socket the `Socket` that joined or connected
   */
  public emitInfo(playerId: string, game: Game, socket: Socket) {
    const players: { [index: string]: string; } = {};
    for (const [playerId, player] of Object.entries(game.players)) {
      players[playerId] = player.username;
    }
    socket.emit(playerId, { name: "cg_info", data: { players } });
  }

  /**
   * Checks if a game is inactive and deletes it after someone has left a game.
   * @param gameId the game_id
   */
  public leaveGame(gameId: string) {
    if (this.publicGames[gameId] && !this.publicGames[gameId].active()) {
      delete this.publicGames[gameId];
    } else if (this.privateGames[gameId] && !this.privateGames[gameId].active()) {
      delete this.privateGames[gameId];
    }
  }
}
