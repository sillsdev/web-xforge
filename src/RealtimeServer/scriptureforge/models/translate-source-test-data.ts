import { SFProjectProfile } from './sf-project';
import { TranslateSource } from './translate-config';

export function getTranslateSource(id: string, isResource: boolean): TranslateSource {
  if (isResource) {
    return {
      paratextId: 'resource16char0' + id,
      projectRef: 'resource0' + id,
      name: 'Resource 0' + id,
      shortName: 'R' + id,
      writingSystem: { tag: 're' }
    };
  }
  return {
    paratextId: 'ptproject0' + id,
    projectRef: 'project0' + id,
    name: 'Project 0' + id,
    shortName: 'P' + id,
    writingSystem: { tag: 'pr' }
  };
}

export function projectToTranslateSource(projectId: string, project: SFProjectProfile): TranslateSource {
  return {
    projectRef: projectId,
    paratextId: project.paratextId,
    name: project.name,
    shortName: project.shortName,
    writingSystem: project.writingSystem
  };
}
