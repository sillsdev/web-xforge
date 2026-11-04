/**
 * Checks if two string arrays have identical content.
 */
export function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if a string is whitespace or empty.
 * @param text The string to check.
 * @returns True if the string is empty or contains only whitespace characters, false otherwise.
 * Nullish values are treated as false.
 */
export function isWhitespace(text: string): boolean {
  if (text == null) {
    return false;
  }

  if (text.length === 0) {
    return true;
  }

  return /^\s*$/.test(text);
}
