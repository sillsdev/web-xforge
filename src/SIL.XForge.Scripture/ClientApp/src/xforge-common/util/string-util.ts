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
 * Removes html tags from a string while preserving the text content.  Stray angle brackets are also removed.
 * @param content The string with possible HTML tags to process.
 * @returns The string with all tags and angle brackets removed.
 */
export function stripHtml(content: string): string {
  if (content == null) {
    return '';
  }

  // Skip processing if no angle brackets
  if (!/[<>]/.test(content)) {
    return content;
  }

  // Use 'text/html' to avoid parsing errors with 'text/xml', as it is more lenient
  const doc: Document = new DOMParser().parseFromString(content, 'text/html');
  const result: string = doc.documentElement.textContent || '';

  // Remove any remaining stray angle brackets
  return result.replace(/[<>]/g, '');
}
