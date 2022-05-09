import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectService } from './sf-project.service';

describe('SFProjectService', () => {
  it('compares projects for sorting', () => {
    const projects = [{ shortName: 'BBB' }, { shortName: 'AAA' }] as SFProject[];
    projects.sort(SFProjectService.compareProjectsForSorting);
    expect(projects[0].shortName).toBe('AAA');
  });
});
