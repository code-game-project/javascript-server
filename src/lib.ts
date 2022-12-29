// Re-export
export type { Info } from "./api.js";
export { GameServer, type CreateGameFn } from "./server.js";
export { Game } from "./game.js";
export { Player } from "./player.js";
export type { AnyCommand, AnyEvent } from "./game-socket.js";
export { Severity } from "./logger.js";

export const CG_VERSION = Object.freeze([0, 8]);
