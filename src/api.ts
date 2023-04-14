import { Router, json } from "express";
import express from "express";
import { GameServer } from "./server.js";

export interface Info {
  name: string,
  display_name?: string,
  description?: string,
  version?: string,
  repository_url?: string,
}

interface InfoInternal extends Info {
  cg_version: string,
}

/**
 * Creates an express.js `Router` that handles the standard routes defined in the Game Server Specification.
 * @param gameServer The `GameServer` instance.
 * @param webRoot The path to the root of the frontend. Specify `null` if there are no static assets.
 * @param cgePath The file path to the Code Game Events file about the game.
 * @param info Information about the game server.
 * @returns an express `Router`.
 */
export function createApi<Config extends object>(
  gameServer: GameServer<Config>,
  webRoot: string | null,
  cgePath: string,
  info: InfoInternal
): Router {
  const router = Router();
  router.use(json({ limit: '2kb' }));

  // static
  if (webRoot) router.use(express.static(webRoot));

  // info
  router.get("/api/info", (_, res) => res.status(200).json(info));

  router.get("/api/events", (_, res) => res.status(200).contentType('text/plain').sendFile(cgePath));

  // games
  router.get("/api/games", (_, res) => {
    res.status(200).json({
      public: Object.entries(gameServer.getPublicGames()).map(([id, game]) => ({
        id, players: game.getPlayerCount(), protected: game.protected
      })),
      private: Object.keys(gameServer.getPrivateGames()).length
    });
  });

  router.post("/api/games", (req, res) => {
    if (gameServer.maxGamesCountReached()) res.status(403).send("The maximum number of games for this server has been reached.");
    else {
      const { gameId, joinSecret } = gameServer.createGame(req.body?.public || false, req.body?.protected || false, req.body?.config);
      res.status(201).json({ game_id: gameId, join_secret: joinSecret });
    }
  });

  router.get("/api/games/:gameId", (req, res) => {
    const game = gameServer.getGame(req.params.gameId);
    if (!game) {
      res.status(404).send("Game not found.");
    } else {
      res.status(200).json({ id: game.id, players: game.getPlayerCount(), protected: game.protected, config: game.config });
    }
  });

  router.get("/api/games/:gameId/players", (req, res) => {
    const game = gameServer.getGame(req.params.gameId);
    if (!game) {
      res.status(404).send("Game not found.");
    } else {
      res.status(200).json({ players: Object.fromEntries(Object.entries(game.getPlayers()).map(([id, player]) => [id, player.username])) });
    }
  });

  router.post("/api/games/:gameId/players", (req, res) => {
    const game = gameServer.getGame(req.params.gameId);
    if (!game) {
      res.status(404).send("Game not found.");
    } else if (game.full()) {
      res.status(403).send("Player limit has been reached.");
    } else if (!game.joinable()) {
      res.status(403).send("Joining has been temporarily disallowed by the game logic.");
    } else if (!req.body.username) {
      res.status(400).send("Please specify a username.");
    } else if (game.protected && !req.body.join_secret) {
      res.status(400).send("The game is protected. Please provide a join secret.");
    } else if (game.protected && !game.verifySecret(req.body.join_secret)) {
      res.status(401).send("Incorrect join secret provided.");
    } else {
      const { id, secret } = game.addPlayer(req.body.username);
      res.status(200).json({ player_id: id, player_secret: secret });
    }
  });

  router.get("/api/games/:gameId/players/:playerId", (req, res) => {
    const game = gameServer.getGame(req.params.gameId);
    if (!game) {
      res.status(404).send("Game not found.");
    } else {
      const player = game?.getPlayer(req.params.playerId);
      if (!player) {
        res.status(404).send("Player not found.");
      } else {
        res.status(200).send({ username: player.username });
      }
    }
  });

  return router;
}
