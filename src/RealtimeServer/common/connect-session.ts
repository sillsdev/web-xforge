/**
 * This interface represents the in-memory session state for a ShareDB connection.
 */
export interface ConnectSession {
  userId: string;
  role?: string;
  isServer: boolean;
}
