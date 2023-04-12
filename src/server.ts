import { createServer, type Server } from "http";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { createApi, type Info } from "./api.js";
import { DebugSocket } from "./debug-socket.js";
import { GameSocket } from "./game-socket.js";
import { SpectatorSocket } from "./spectator-socket.js";
import { Logger } from "./logger.js";
import type { Game } from "./game.js";
import { CG_VERSION } from "./lib.js";

/** Game IDs mapped to game instances. */
interface Games<Config extends object = object> { [index: string]: Game<Config>; }

export type CreateGameFn<Config extends object = object> = (_protected: boolean, config?: Config) => Game<Config>;

const DEFAULT_PORT = 8080;
const DEFAULT_GAMES_COUNT = 500;
const DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 10 * 60;

export class GameServer<Config extends object = object> {
  /** The `http.Server` instance that powers the API and Websockets. */
  public readonly server: Server;
  /** The websocket server encapsulated in the game server. */
  private wss: WebSocketServer;
  /** The maximum number of games that this server can have. */
  public readonly MAX_GAMES_COUNT: number;
  /** The time between pings in seconds. This option is to be passed to new Sockets on their creation. */
  public readonly HEARTBEAT_INTERVAL_SECONDS: number;
  /** Creates new instances of descendants of `Game`. */
  private readonly createGameFn: CreateGameFn<Config>;
  /** A map of public games on the server. */
  private readonly publicGames: Games<Config> = {};
  /** A map of private games on the server. */
  private readonly privateGames: Games<Config> = {};
  public readonly logger = new Logger<Config>();

  /**
   * Creates a new `GameServer`.
   * @param info Information about the game server.
   * @param cgePath The file path to the Code Game Events file about the game.
   * @param webRoot The path to the root of the frontend. Specify `null` if there are no static assets.
   * @param createGame A function that is called to create a new game. An instance of `Game` must be returned.
   * @param port The port that the server will bind to.
   * @param maxGamesCount The maximum number of games allowed on the server at once.
   * @param heartbeatIntervalSeconds The time in seconds to wait before checking again whether a socket is still alive.
   * @returns an instance of `GameServer`.
   */
  public constructor(
    info: Info,
    cgePath: string,
    webroot: string | null,
    createGame: CreateGameFn<Config>,
    port: number = DEFAULT_PORT,
    maxGamesCount: number = DEFAULT_GAMES_COUNT,
    heartbeatIntervalSeconds: number = DEFAULT_HEARTBEAT_INTERVAL_SECONDS
  ) {
    // Guards
    // These are necessary because `NaN != false` so the default parameters will
    // not be used. However, `!NaN == true`.
    if (!port) port = DEFAULT_PORT;
    if (!maxGamesCount) maxGamesCount = DEFAULT_GAMES_COUNT;
    if (!heartbeatIntervalSeconds) heartbeatIntervalSeconds = DEFAULT_HEARTBEAT_INTERVAL_SECONDS;

    // Api
    const app = express();
    app.use(cors());
    app.use(createApi(this, webroot, cgePath, Object.assign(info, { cg_version: CG_VERSION.join(".") })));

    // Game
    this.createGameFn = createGame;

    // Server
    this.wss = new WebSocketServer({ noServer: true });
    this.server = createServer(app);
    this.handleUpgrades();
    this.server.listen(port, () => console.log(`Listening on port ${port}.`));

    // Config
    this.MAX_GAMES_COUNT = maxGamesCount;
    this.HEARTBEAT_INTERVAL_SECONDS = heartbeatIntervalSeconds;
  }

  /**
   * Stops the server from accepting new connections and keeps
   * existing connections. This function is asynchronous, the
   * server is finally closed when all connections are ended
   * and the server emits a 'close' event. The optional callback
   * will be called once the 'close' event occurs. Unlike that
   * event, it will be called with an Error as its only argument
   * if the server was not open when it was closed.
   * 
   * See `http.Server.close` for more.
   */
  public close(onCloseCallback?: ((err?: Error | undefined) => void) | undefined) {
    this.server.close(onCloseCallback);
    // TODO: Close all WebSockets if they are not already closed.
  }

  /**
   * Looks for a game in the `publicGames`, as well as in the `privateGames`.
   * @param gameId The game ID.
   * @returns the game or undefined if the game does not exist.
  */
  public getGame(gameId: string): Game<Config> | undefined {
    return this.publicGames[gameId] || this.privateGames[gameId];
  }

  public maxGamesCountReached() {
    return (Object.keys(this.publicGames).length + Object.keys(this.publicGames).length) === this.MAX_GAMES_COUNT;
  }

  public getPublicGames(): Readonly<Games<Config>> {
    return this.publicGames;
  }

  public getPrivateGames(): Readonly<Games<Config>> {
    return this.privateGames;
  }

  /**
   * Creates a new game.
   * @param _public Whether the game should be listed publicly.
   * @param _protected Whether the game should be protected by a join secret.
   * @param config Custom config options provided at creation time.
   * @returns the game ID.
   * @throws when the `MAX_GAMES_COUNT` is reached.
  */
  public createGame(_public: boolean, _protected: boolean, config?: Config): { gameId: string, joinSecret?: string; } {
    this.deleteInactive();
    if (this.maxGamesCountReached()) {
      const errorMessage = "The maximum number of games for this server has been reached.";
      this.logger.errorStdout("Unable to create a new game: " + errorMessage);
      throw errorMessage;
    }
    const game = this.createGameFn(_protected, config);
    if (_public) {
      this.publicGames[game.id] = game;
      this.logger.infoStdout(`Created new public game ${game.id}.`);
    } else {
      this.privateGames[game.id] = game;
      this.logger.infoStdout(`Created new private game ${game.id.slice(0, 8)}-****-****-****-************.`);
    }
    return {
      gameId: game.id,
      joinSecret: game.secret,
    };
  }

  /** Deletes inactive games. */
  protected deleteInactive() {
    const deleted: string[] = [];
    for (const [gameId, game] of Object.entries(this.publicGames)) {
      if (!game.active()) {
        game.terminate();
        delete this.publicGames[gameId];
        delete this.privateGames[gameId];
        deleted.push(gameId);
      }
    }
    if (deleted.length > 0) {
      this.logger.info(`Deleted ${deleted.length} inactive games.`, { deleted_games_ids: deleted });
    }
  }

  /**
   * Handles HTTP websocket upgrade requests to the following URLs
   * by converting them to websocket connections and the `GameSocket`,
   * `SpectatorSocket` or `DebugSocket` class:
   * 
   * - `/api/debug` -> Debugs the entire server.
   * - `/api/games/{gameId}/spectate` -> Spectates a game.
   * - `/api/games/{gameId}/debug` -> Debugs a game.
   * - `/api/games/{gameId}/players/{playerId}/connect?player_secret=<the-secret>` -> Controls or spectates a player.
   * - `/api/games/{gameId}/players/{playerId}/debug?player_secret=<the-secret>` -> Debugs a player.
   */
  private handleUpgrades() {
    this.server.on("upgrade", (request, socket, head) => {
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        // TODO: return HTTP status codes as best as possible
        if (!request.url) {
          socket.destroy();
          return;
        }

        if (request.url === "/api/debug") {
          this.logger.addDebugSocket(new DebugSocket(ws, this, null, null, this.HEARTBEAT_INTERVAL_SECONDS));
          return;
        }

        const { gameId, route, playerId, playerRoute, playerSecret } = GameServer.deserializeURL(request.url);
        if (!gameId) {
          socket.destroy();
          return;
        }

        const game = this.getGame(gameId);
        if (!game) {
          socket.destroy();
          return;
        }

        if (route === "spectate") game.addSpectator(new SpectatorSocket(game, ws, this.HEARTBEAT_INTERVAL_SECONDS));
        else if (route === "debug") game.logger.addDebugSocket(new DebugSocket(ws, null, game, null, this.HEARTBEAT_INTERVAL_SECONDS));
        else if (route === "players" && playerId && playerSecret) {
          const player = game.getPlayer(playerId);
          if (!player.verifySecret(playerSecret)) {
            socket.destroy();
            return;
          }
          if (playerRoute === "connect") {
            player.addGameSocket(new GameSocket(player, ws, this.HEARTBEAT_INTERVAL_SECONDS));
          } else if (playerRoute === "debug") {
            player.logger.addDebugSocket(new DebugSocket(ws, null, null, player, this.HEARTBEAT_INTERVAL_SECONDS));
          }
        }
      });
    });
  }

  /**
   * Seperates a given URL into its components.
   * @param url The URL.
   * @returns an object with the relevant components.
   */
  private static deserializeURL(url: string): { gameId?: string, route?: string, playerId?: string, playerRoute?: string, playerSecret: string | null; } {
    const pathMatcher = /^\/api\/games\/(?<gameId>[A-Fa-f0-9\-]+)\/(?<route>\w+)(\/(?<playerId>[A-Fa-f0-9\-]+)\/(?<playerRoute>\w+))*?(\?(?<query>.+))*?$/;
    const { gameId, route, playerId, playerRoute, query } = pathMatcher.exec(url)?.groups || {};
    return {
      gameId,
      route,
      playerId,
      playerRoute,
      playerSecret: new URLSearchParams(query || "").get("player_secret")
    };
  }
}
