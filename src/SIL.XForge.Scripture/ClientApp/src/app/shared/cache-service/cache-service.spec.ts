import { NgZone } from '@angular/core';
import { fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfo } from 'realtime-server/scriptureforge/models/text-info';
import { AppComponent } from 'src/app/app.component';
import { SFProjectProfileDoc } from 'src/app/core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from 'src/app/core/models/sf-type-registry';
import { TextDocId } from 'src/app/core/models/text-doc';
import { SFProjectService } from 'src/app/core/sf-project.service';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { CacheService } from './cache-service';

const mockedProjectService = mock(SFProjectService);
const mockedProjectDoc = mock(SFProjectProfileDoc);

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
    providers: [{ provide: SFProjectService, useMock: mockedProjectService }]
  }));
  describe('load all texts', () => {
    it('gets all texts from project service', fakeAsync(async () => {
      const env = new TestEnvironment();
      await env.service.cache(env.projectDoc);
      env.wait();

      verify(mockedProjectService.getText(anything())).times(200 * 100);

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
  });
});

class TestEnvironment {
  readonly ngZone: NgZone = TestBed.inject(NgZone);
  readonly service: CacheService;
  readonly projectDoc: SFProjectProfileDoc = instance(mockedProjectDoc);

  constructor() {
    this.service = TestBed.inject(CacheService);

    const data = createTestProjectProfile({
      texts: this.createTexts()
    });

    when(mockedProjectDoc.data).thenReturn(data);
  }

  createTexts(): TextInfo[] {
    const texts: TextInfo[] = [];
    for (let book = 0; book < 200; book++) {
      const chapters = [];
      for (let chapter = 0; chapter < 100; chapter++) {
        chapters.push({ isValid: true, lastVerse: 1, number: chapter, permissions: {}, hasAudio: false });
      }
      texts.push({ bookNum: book, chapters: chapters, hasSource: false, permissions: {} });
    }
    return texts;
  }

  async wait(ms: number = 200): Promise<void> {
    await new Promise(resolve => this.ngZone.runOutsideAngular(() => setTimeout(resolve, ms)));
    tick();
  }
}
