import { NgZone } from '@angular/core';
import { fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { Chapter, TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { BehaviorSubject } from 'rxjs';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { MemoryRealtimeDocAdapter } from '../../../xforge-common/memory-realtime-remote-store';
import { RealtimeDocAdapter } from '../../../xforge-common/realtime-remote-store';
import { AppComponent } from '../../app.component';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { TextDoc, TextDocId } from '../../core/models/text-doc';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';
import { CacheService } from './cache.service';

const mockedProjectService = mock(SFProjectService);
const mockedPermissionService = mock(PermissionsService);
const mockedActivatedProject = mock(ActivatedProjectService);
const projectId$ = new BehaviorSubject<string>('');

describe('cache service', () => {
  configureTestingModule(() => ({
    declarations: [AppComponent],
    imports: [
      UICommonModule,
      NoopAnimationsModule,
      TestTranslocoModule,
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    providers: [
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: PermissionsService, useMock: mockedPermissionService },
      { provide: ActivatedProjectService, useMock: mockedActivatedProject }
    ]
  }));

  describe('load all texts', () => {
    beforeEach(() => {
      const text = { adapter: instance(mock<RealtimeDocAdapter>()) } as TextDoc;
      when(mockedProjectService.getText(anything())).thenResolve(text);
      when(mockedActivatedProject.projectId$).thenReturn(projectId$);
    });

    it('does not get texts from project service if no permission', fakeAsync(async () => {
      when(mockedPermissionService.canAccessText(anything())).thenResolve(false);
      const env = new TestEnvironment();
      env.wait();

      verify(mockedProjectService.getText(anything())).times(0);

      flush();
      expect(true).toBeTruthy();
    }));

    it('gets all texts from project service', fakeAsync(async () => {
      const env = new TestEnvironment();
      env.wait();
      flush();

      verify(mockedProjectService.getText(anything())).times(20 * 10 * 2);

      flush();
      expect(true).toBeTruthy();
    }));

    it('stops the current operation if cache is called again', fakeAsync(async () => {
      // configure the first project to interrupt itself
      let timesCalled = 0;
      const text = { adapter: instance(mock(MemoryRealtimeDocAdapter)) as RealtimeDocAdapter } as TextDoc;
      when(mockedProjectService.getText(anything())).thenCall(async () => {
        ++timesCalled;
        if (timesCalled > 1) {
          await cacheNewProject();
        }

        return text;
      });

      // configure the new project
      when(
        mockedProjectService.getText(deepEqual(new TextDocId('new project', anything(), anything(), 'target')))
      ).thenResolve(text);

      const env = new TestEnvironment();
      when(
        mockedPermissionService.canAccessText(deepEqual(new TextDocId('sourceId', anything(), anything(), 'target')))
      ).thenResolve(false); // remove source permissions for simpler test calculations

      env.wait();
      flush();

      verify(
        mockedProjectService.getText(deepEqual(new TextDocId('new project', anything(), anything(), 'target')))
      ).times(20 * 10);

      //verify at least some books were not gotten
      verify(mockedProjectService.getText(anything())).atMost(20 * 10 * 2 - 1);

      flush();
      expect(true).toBeTruthy();

      async function cacheNewProject(): Promise<void> {
        const mockProject = mock(SFProjectProfileDoc);
        when(mockProject.id).thenReturn('new project');
        const data = createTestProjectProfile({
          texts: env.createTexts()
        });
        when(mockProject.data).thenReturn(data);

        await env.service['cache'](instance(mockProject));
        env.wait();
      }
    }));

    it('gets the source texts if they are present and the user can access', fakeAsync(async () => {
      const env = new TestEnvironment();
      when(mockedPermissionService.canAccessText(deepEqual(new TextDocId('sourceId', 0, 0, 'target')))).thenResolve(
        false
      ); //remove access for one source doc

      env.wait();
      flush();

      //verify all sources and targets were gotten except the inaccessible one
      verify(mockedProjectService.getText(anything())).times(20 * 10 * 2 - 1);

      flush();
      expect(true).toBeTruthy();
    }));

    it('destroys the old text subscriptions when switching to a new project', fakeAsync(async () => {
      //save all adapters for original project
      const adapterMocks: RealtimeDocAdapter[] = [];
      for (let book = 0; book < 20; book++) {
        for (let chapter = 0; chapter < 10; chapter++) {
          when(mockedProjectService.getText(deepEqual(new TextDocId(anything(), book, chapter, 'target')))).thenCall(
            _ => {
              const adapterMock = mock<RealtimeDocAdapter>();
              adapterMocks.push(adapterMock);
              return { adapter: instance(adapterMock) } as TextDoc;
            }
          );
        }
      }

      //ensure new project doesn't add its adapters to the above list
      when(
        mockedProjectService.getText(deepEqual(new TextDocId('new project', anything(), anything(), 'target')))
      ).thenResolve({ adapter: instance(mock(MemoryRealtimeDocAdapter)) as RealtimeDocAdapter } as TextDoc);

      const env = new TestEnvironment();
      env.wait();
      flush();

      //trigger a project change
      when(mockedProjectService.getProfile('new project')).thenResolve({
        id: 'new project',
        data: createTestProjectProfile({ texts: env.createTexts() })
      } as SFProjectProfileDoc);
      projectId$.next('new project');
      env.wait();
      flush();

      //verify all adapters are destroyed
      for (const adapterMock of adapterMocks) {
        verify(adapterMock.destroy()).once();
      }

      //verify no original adapter is present
      for (const text of env.service['subscribedTexts']) {
        for (const adapterMock of adapterMocks) {
          expect(text.adapter).not.toBe(instance(adapterMock));
        }
      }
    }));
  });
});

class TestEnvironment {
  readonly ngZone: NgZone = TestBed.inject(NgZone);
  readonly service: CacheService;

  constructor() {
    const data = createTestProjectProfile({
      texts: this.createTexts(),
      translateConfig: {
        source: {
          projectRef: 'sourceId'
        }
      }
    });

    when(mockedPermissionService.canAccessText(anything())).thenResolve(true);
    when(mockedProjectService.getProfile(anything())).thenResolve({ data } as SFProjectProfileDoc);

    this.service = TestBed.inject(CacheService);
  }

  createTexts(): TextInfo[] {
    const texts: TextInfo[] = [];
    for (let book = 0; book < 20; book++) {
      const chapters: Chapter[] = [];
      for (let chapter = 0; chapter < 10; chapter++) {
        chapters.push({ isValid: true, lastVerse: 1, number: chapter, permissions: {}, hasAudio: false });
      }
      texts.push({ bookNum: book, chapters: chapters, hasSource: true, permissions: {} });
    }
    return texts;
  }

  async wait(ms: number = 200): Promise<void> {
    await new Promise(resolve => this.ngZone.runOutsideAngular(() => setTimeout(resolve, ms)));
    tick();
  }
}
