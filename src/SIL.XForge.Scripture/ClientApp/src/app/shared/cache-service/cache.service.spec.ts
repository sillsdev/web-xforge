import { NgZone } from '@angular/core';
import { fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { Chapter, TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { configureTestingModule } from 'xforge-common/test-utils';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { TextDocId } from '../../core/models/text-doc';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';
import { CacheService } from './cache.service';

const mockedProjectService = mock(SFProjectService);
const mockedProjectDoc = mock(SFProjectProfileDoc);
const mockedPermissionService = mock(PermissionsService);

describe('cache service', () => {
  configureTestingModule(() => ({
    providers: [
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: PermissionsService, useMock: mockedPermissionService }
    ]
  }));
  describe('load all texts', () => {
    it('does not get texts from project service if no permission', fakeAsync(async () => {
      const env = new TestEnvironment();
      when(mockedPermissionService.canAccessText(anything())).thenResolve(false);
      await env.service.cache(env.projectDoc);
      env.wait();

      verify(mockedProjectService.getText(anything())).times(0);

      flush();
      expect(true).toBeTruthy();
    }));

    it('gets all texts from project service', fakeAsync(async () => {
      const env = new TestEnvironment();
      await env.service.cache(env.projectDoc);
      env.wait();

      verify(mockedProjectService.getText(anything())).times(200 * 100 * 2);

      flush();
      expect(true).toBeTruthy();
    }));

    it('stops the current operation if cache is called again', fakeAsync(async () => {
      const env = new TestEnvironment();

      const mockProject = mock(SFProjectProfileDoc);
      when(mockProject.id).thenReturn('new project');
      const data = createTestProjectProfile({
        texts: env.createTexts()
      });
      when(mockProject.data).thenReturn(data);

      env.service.cache(env.projectDoc);
      await env.service.cache(instance(mockProject));
      env.wait();

      verify(
        mockedProjectService.getText(deepEqual(new TextDocId('new project', anything(), anything(), 'target')))
      ).times(200 * 100);

      //verify at least some books were not gotten
      verify(mockedProjectService.getText(anything())).atMost(200 * 100 * 2 - 1);

      flush();
      expect(true).toBeTruthy();
    }));

    it('gets the source texts if they are present and the user can access', fakeAsync(async () => {
      const env = new TestEnvironment();
      when(mockedPermissionService.canAccessText(deepEqual(new TextDocId('sourceId', 0, 0, 'target')))).thenResolve(
        false
      ); //remove access for one source doc

      await env.service.cache(env.projectDoc);
      env.wait();

      //verify all sources and targets were gotten except the inaccessible one
      verify(mockedProjectService.getText(anything())).times(200 * 100 * 2 - 1);

      flush();
      expect(true).toBeTruthy();
    }));
  });
});

class TestEnvironment {
  readonly ngZone: NgZone = TestBed.inject(NgZone);
  readonly service: CacheService;
  readonly projectDoc: SFProjectProfileDoc = instance(mockedProjectDoc);

  constructor() {
    this.service = TestBed.inject(CacheService);

    const data = createTestProjectProfile({
      texts: this.createTexts(),
      translateConfig: {
        source: {
          projectRef: 'sourceId'
        }
      }
    });

    when(mockedProjectDoc.data).thenReturn(data);
    when(mockedPermissionService.canAccessText(anything())).thenResolve(true);
  }

  createTexts(): TextInfo[] {
    const texts: TextInfo[] = [];
    for (let book = 0; book < 200; book++) {
      const chapters: Chapter[] = [];
      for (let chapter = 0; chapter < 100; chapter++) {
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
