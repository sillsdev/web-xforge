/** See documentation in ParatextProject.cs. */
export interface ParatextProject {
  paratextId: string;
  name: string;
  shortName: string;
  languageTag: string;
  projectId?: string;
  isConnectable: boolean;
  isConnected: boolean;
}
