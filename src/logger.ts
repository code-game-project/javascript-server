import consola from 'consola';
import type { DebugSocket } from "./debug-socket.js";

/** Severity levels. */
export enum Severity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
  TRACE = 'trace'
}

/** A debug message. */
export type DebugMessage = {
  severity: Severity,
  message: string,
  data?: object;
};

export class Logger<Config extends object = object> {
  /** A map of debug sockets associated with this logger. */
  private readonly debugSockets: { [index: string]: DebugSocket<Config>; } = {};

  public error(message: DebugMessage["message"], data?: DebugMessage["data"]) {
    this.broadcastDebugMessage({ severity: Severity.ERROR, message, data });
  }

  public errorStdout(message: DebugMessage["message"], data?: DebugMessage["data"]) {
    if (data) consola.error(`[${Logger.dateTime()}] ${message}`, data);
    else consola.error(`[${Logger.dateTime()}] ${message}`);
    this.error(message, data);
  }

  public warn(message: DebugMessage["message"], data?: DebugMessage["data"]) {
    this.broadcastDebugMessage({ severity: Severity.WARNING, message, data });
  }

  public warnStdout(message: DebugMessage["message"], data?: DebugMessage["data"]) {
    if (data) consola.warn(`[${Logger.dateTime()}] ${message}`, data);
    else consola.warn(`[${Logger.dateTime()}] ${message}`);
    this.warn(message, data);
  }

  public info(message: DebugMessage["message"], data?: DebugMessage["data"]) {
    this.broadcastDebugMessage({ severity: Severity.INFO, message, data });
  }

  public infoStdout(message: DebugMessage["message"], data?: DebugMessage["data"]) {
    if (data) consola.info(`[${Logger.dateTime()}] ${message}`, data);
    else consola.info(`[${Logger.dateTime()}] ${message}`);
    this.info(message, data);
  }

  public trace(message: DebugMessage["message"], data?: DebugMessage["data"]) {
    this.broadcastDebugMessage({ severity: Severity.TRACE, message, data });
  }

  public traceStdout(message: DebugMessage["message"], data?: DebugMessage["data"]) {
    if (data) consola.trace(`[${Logger.dateTime()}] ${message}`, data);
    else consola.trace(`[${Logger.dateTime()}] ${message}`);
    this.trace(message, data);
  }

  private static dateTime() {
    const now = new Date();
    return (
      `${now.getFullYear()}-${now.getMonth()}-${now.getDay()}` + " " +
      `${this.padNumber(now.getHours())}:${this.padNumber(now.getMinutes())}:${this.padNumber(now.getSeconds())}`
    );
  }

  private static padNumber(number: number) {
    return ("0" + String(number)).slice(-2);
  }

  /**
   * Sends a debug message to all debug sockets associated with the logger.
   * @param message The debug message to send.
   */
  private broadcastDebugMessage(message: DebugMessage) {
    for (const debugSocket of Object.values(this.debugSockets)) {
      debugSocket.send(message);
    }
  }

  /**
   * Connects a debug socket to the logger.
   * @param debugSocket The debug socket to associate with the logger.
   */
  public addDebugSocket(debugSocket: DebugSocket<Config>) {
    this.debugSockets[debugSocket.id] = debugSocket;
  }

  /**
   * Disconnects a debug socket from the logger.
   * @param socket The debug socket that is to be disconnected.
   */
  public removeDebugSocket(socket: DebugSocket<Config>) {
    delete this.debugSockets[socket.id];
  }
};
