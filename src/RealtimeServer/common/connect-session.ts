/**
 * This interface represents the in-memory session state for a ShareDB connection.
 */
export interface ConnectSession {
  userId: string;
  roles: string[];
  isServer: boolean;
}
