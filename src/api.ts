import { Router, json } from "express";
import { GameServer } from "./server.js";

/**
 * Creates an express.js `Router` that handles the standard routes defined in the Game Server Specification.
 * @param gameServer The `GameServer` instace.
 * @param cgePath The file path to the Code Game Events file about the game.
 * @param info Information about the game server.
 * @returns express `Router`
 */
export function createApi(gameServer: GameServer, cgePath: string, info: {
  name: string,
  cg_version: string,
  display_name?: string,
  description?: string,
  version?: string,
  repository_url?: string,
}): Router {
  const router = Router();
  router.use(json({ limit: '2kb' }));

  router.get("/events", (_, res) => res.contentType('text/plain').sendFile(cgePath));
  router.get("/info", (_, res) => res.json(info));
  router.get("/games", (_, res) => {
    res.json({
      private: Object.keys(gameServer.privateGames).length,
      public: Object.entries(gameServer.publicGames).map(([id, game]) => ({
        id: id, players: Object.keys(game.players).length
      }))
    });
  });
  router.post("/games", (req, res) => {
    res.json({ game_id: gameServer.create(req.body?.public || false) });
  });

  return router;
}
