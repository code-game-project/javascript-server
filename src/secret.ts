/**
 * Generates a random string in the range `[A-Za-z0-9]`.
 * @param length The length of the secret in characters.
 * @returns a random string of the given length.
 */
export function randomSecret(length = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let str = '';
  for (let i = 0; i < length; i++) {
    str += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return str;
}
