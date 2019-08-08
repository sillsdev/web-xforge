import ShareDB = require('sharedb');

export type OTType = 'ot-text' | 'ot-json0' | 'ot-text-tp2' | 'rich-text';

export interface PathTemplateConfig {
  template: ShareDB.Path;
  inherit: boolean;
}

export interface DomainConfig {
  domain: number;
  pathTemplate: PathTemplateConfig;
}

export interface CollectionConfig {
  name: string;
  otTypeName: OTType;
  domains: DomainConfig[];
  immutableProps: PathTemplateConfig[];
}

export interface ProjectRoleConfig {
  name: string;
  rights: number[];
}

export interface RealtimeServerOptions {
  connectionString: string;
  port: number;
  audience: string;
  scope: string;
  authority: string;
  projectAdminRole: string;
  projectRoles: ProjectRoleConfig[];
  usersCollection: CollectionConfig;
  userProfilesCollectionName: string;
  projectsCollection: CollectionConfig;
  projectDataCollections: CollectionConfig[];
}
