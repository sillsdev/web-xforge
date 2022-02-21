import { SF_PROJECT_RIGHTS_MAPPING } from './sf-project-rights-mapping';

const mapping: { [key: string]: any } = {};
for (const [key, value] of SF_PROJECT_RIGHTS_MAPPING.entries()) {
  mapping[key] = value.map(right => right.projectDomain + '.' + right.operation);
}

module.exports = (callback: any) => callback(null, mapping);
