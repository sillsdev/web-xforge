import { InputSystem } from 'xforge-common/models/input-system';

export interface UpdateTasksParams {
  checkingEnabled?: boolean;
  translateEnabled?: boolean;
  sourceParatextId?: string;
  sourceInputSystem?: InputSystem;
}
