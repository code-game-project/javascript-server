/** An interface representing all possibly valid events. */
export interface AnyEvent {
  name: string,
  data?: object | undefined;
}
