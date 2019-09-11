import { InputSystem } from 'realtime-server/lib/common/models/input-system';

export interface ParatextProject {
  paratextId: string;
  name: string;
  inputSystem: InputSystem;
  projectId?: string;
  isConnectable: boolean;
  isConnected: boolean;
}
