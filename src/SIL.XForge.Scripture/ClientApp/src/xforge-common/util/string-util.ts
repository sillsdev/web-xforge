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

  // Skip processing if no tags or angle brackets
  if (!/[<>]/.test(content)) {
    return content;
  }

  const parser = new DOMParser();
  let result: string;

  try {
    // Use 'text/html' to avoid parsing errors with 'text/xml', as it is more lenient
    const doc: Document = parser.parseFromString(content, 'text/html');

    result = doc.documentElement.textContent || '';
  } catch {
    // Fallback to regex if parsing fails.
    // This regex does not handle all edge cases, but is good enough for most cases.
    result = content.replace(/<[^>]*>/g, '');
  }

  // Remove any remaining stray angle brackets
  return result.replace(/[<>]/g, '');
}
