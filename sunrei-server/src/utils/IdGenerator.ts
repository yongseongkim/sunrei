import { ulid } from 'ulid';

export class IdGenerator {
  private static readonly ULID_LENGTH = 26; // ULID is always 26 characters
  private static readonly TOTAL_ID_LENGTH = 32; // Fixed total length for the ID

  /**
   * Generates a unique ID with a fixed total length of 32 characters.
   * @param prefix The prefix to prepend to the ID (e.g., "P" for Place).
   * @returns A unique ID string with a fixed length of 32 characters.
   */
  static generate(prefix: string): string {
    const baseUlid = ulid(); // Generate a 26-character ULID
    const randomLength =
      this.TOTAL_ID_LENGTH - prefix.length - this.ULID_LENGTH; // Calculate remaining length for random string
    const randomStr = this.generateRandomString(randomLength);
    return `${prefix}${baseUlid}${randomStr}`;
  }

  /**
   * Generates a random string of uppercase letters and digits.
   * @param length The length of the random string.
   * @returns A random string.
   */
  private static generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
