/**
 * This interface represents the snapshot of a real-time doc.
 */
export interface Snapshot<T = any> {
  id: string;
  v?: number;
  data: T;
  type: string;
}
