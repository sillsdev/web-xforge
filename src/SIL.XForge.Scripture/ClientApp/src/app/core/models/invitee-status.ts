/** Status information for a user who has been invited to a project. */
export interface InviteeStatus {
  email: string;
  role: string;
  expired?: boolean;
}
