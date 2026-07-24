/**
 * Set helpers that mirror the ES2024 `Set.prototype` composition methods (intersection/union/difference), implemented
 * without relying on those methods so the app keeps working on browsers that don't yet support them. Each returns a new
 * Set and leaves the inputs unmodified.
 */

/** Returns a new Set containing the elements present in both `a` and `b`. */
export function intersection<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): Set<T> {
  // Iterate the smaller set for fewer membership checks; the result is the same either way.
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  const result = new Set<T>();
  for (const value of smaller) {
    if (larger.has(value)) result.add(value);
  }
  return result;
}

/** Returns a new Set containing the elements present in either `a` or `b`. */
export function union<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): Set<T> {
  const result = new Set<T>(a);
  for (const value of b) {
    result.add(value);
  }
  return result;
}

/** Returns a new Set containing the elements present in `a` but not in `b`. */
export function difference<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): Set<T> {
  const result = new Set<T>(a);
  for (const value of b) {
    result.delete(value);
  }
  return result;
}
