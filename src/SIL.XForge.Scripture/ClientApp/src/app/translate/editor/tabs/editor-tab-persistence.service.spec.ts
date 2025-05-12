import { fakeAsync, tick } from '@angular/core/testing';
import { cloneDeep } from 'lodash-es';
import { EditorTabPersistData } from 'realtime-server/lib/esm/scriptureforge/models/editor-tab-persist-data';
import { createTestProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config-test-data';
import { of, Subject } from 'rxjs';
import { anything, instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { noopDestroyRef } from 'xforge-common/realtime.service';
import { UserService } from 'xforge-common/user.service';
import { SFProjectUserConfigDoc } from '../../../core/models/sf-project-user-config-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { EditorTabPersistenceService } from './editor-tab-persistence.service';

describe('EditorTabPersistenceService', () => {
  it('should persist tabs if they are not equal', fakeAsync(() => {
    const tabs = [
      { a: 1, b: 2 },
      { a: 3, b: 4 }
    ] as unknown as EditorTabPersistData[];
    const env = new TestEnvironment([]);
    env.service.persistTabsOpen(tabs);
    tick();
    expect(env.pucDoc.updateEditorOpenTabs).toHaveBeenCalledWith(tabs);
  }));

  it('should not persist tabs if they are equal', fakeAsync(() => {
    const tabs = [
      { a: 1, b: 2 },
      { a: 3, b: 4 }
    ] as unknown as EditorTabPersistData[];
    const env = new TestEnvironment(tabs);
    env.service.persistTabsOpen(tabs);
    tick();
    expect(env.pucDoc.updateEditorOpenTabs).not.toHaveBeenCalled();
  }));

  it('should ignore undefined properties', fakeAsync(() => {
    const tabs = [
      { a: 1, b: 2 },
      { a: 3, b: 4, c: undefined }
    ] as unknown as EditorTabPersistData[];
    const env = new TestEnvironment([]);
    env.service.persistTabsOpen(tabs);
    tick();
    expect(env.pucDoc.updateEditorOpenTabs).toHaveBeenCalledWith([
      { a: 1, b: 2 },
      { a: 3, b: 4 }
    ] as any);
  }));

  it('should not return invalid persisted tabs', fakeAsync(() => {
    const tabs = [{ tabType: 'invalid' }, { tabType: 'biblical-terms' }] as unknown as EditorTabPersistData[];
    const env = new TestEnvironment(tabs);
    let persistedTabs: EditorTabPersistData[] = [];
    env.service.persistedTabs$.subscribe(tabs => {
      persistedTabs = tabs;
    });
    tick();
    expect(persistedTabs.length).toBe(1);
  }));
});

class TestEnvironment {
  service: EditorTabPersistenceService;
  pucDoc: SFProjectUserConfigDoc;
  mockActivatedProjectService: ActivatedProjectService;
  mockUserService: UserService;
  mockProjectService: SFProjectService;

  constructor(tabs: EditorTabPersistData[]) {
    this.pucDoc = {
      data: createTestProjectUserConfig({
        editorTabsOpen: cloneDeep(tabs)
      }),
      updateEditorOpenTabs: jasmine.createSpy('updateEditorOpenTabs'),
      changes$: new Subject()
    } as unknown as SFProjectUserConfigDoc;

    this.mockActivatedProjectService = mock(ActivatedProjectService);
    this.mockUserService = mock(UserService);
    this.mockProjectService = mock(SFProjectService);

    when(this.mockActivatedProjectService.projectId$).thenReturn(of('project01'));
    when(this.mockUserService.currentUserId).thenReturn('user01');
    when(this.mockProjectService.getUserConfig('project01', 'user01', anything())).thenReturn(
      Promise.resolve(this.pucDoc)
    );

    this.service = new EditorTabPersistenceService(
      instance(this.mockActivatedProjectService),
      instance(this.mockUserService),
      instance(this.mockProjectService),
      noopDestroyRef
    );
  }
}
