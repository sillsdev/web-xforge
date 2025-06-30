import { HttpErrorResponse } from '@angular/common/http';
import { DebugElement } from '@angular/core';
import { ComponentFixture, discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatProgressBar } from '@angular/material/progress-bar';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Params } from '@angular/router';
import { ProgressStatus } from '@sillsdev/machine';
import { Delta } from 'quill';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { getTextDocId } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import * as RichText from 'rich-text';
import { defer, of, Subject } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { UNKNOWN_COMPONENT_OR_SERVICE } from 'xforge-common/models/realtime-doc';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { TextDoc, TextDocId } from '../../core/models/text-doc';
import { PermissionsService } from '../../core/permissions.service';
import { TranslationEngineService } from '../../core/translation-engine.service';
import { RemoteTranslationEngine } from '../../machine-api/remote-translation-engine';
import { Progress, ProgressService, TextProgress } from '../../shared/progress-service/progress.service';
import { FontUnsupportedMessageComponent } from '../font-unsupported-message/font-unsupported-message.component';
import { TrainingProgressComponent } from '../training-progress/training-progress.component';
import { TranslateOverviewComponent } from './translate-overview.component';

const mockedActivatedRoute = mock(ActivatedRoute);
const mockedAuthService = mock(AuthService);
const mockedTranslationEngineService = mock(TranslationEngineService);
const mockedNoticeService = mock(NoticeService);
const mockedUserService = mock(UserService);
const mockedPermissionService = mock(PermissionsService);
const mockedProgressService = mock(ProgressService);

describe('TranslateOverviewComponent', () => {
  configureTestingModule(() => ({
    declarations: [TranslateOverviewComponent, TrainingProgressComponent],
    imports: [
      UICommonModule,
      TestTranslocoModule,
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      FontUnsupportedMessageComponent
    ],
    providers: [
      { provide: AuthService, useMock: mockedAuthService },
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: TranslationEngineService, useMock: mockedTranslationEngineService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: UserService, useMock: mockedUserService },
      { provide: PermissionsService, useMock: mockedPermissionService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: ProgressService, useMock: mockedProgressService }
    ]
  }));

  describe('Progress Card', () => {
    it('should list all books in project', fakeAsync(() => {
      const env = new TestEnvironment();
      env.wait();

      expect(env.progressTitle.textContent).toContain('Progress');
      expect(env.component.progressService.texts.length).toEqual(4);
      env.expectContainsTextProgress(0, 'Matthew', '10 of 20 segments');
      env.expectContainsTextProgress(1, 'Mark', '10 of 20 segments');
      env.expectContainsTextProgress(2, 'Luke', '10 of 20 segments');
      env.expectContainsTextProgress(3, 'John', '10 of 20 segments');

      discardPeriodicTasks();
    }));
  });

  describe('Engine Card', () => {
    it('should be hidden when translation suggestions disabled', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProjectData({ translationSuggestionsEnabled: false });
      env.wait();

      expect(env.engineCard).toBeNull();

      discardPeriodicTasks();
    }));

    it('should be hidden when user cannot edit texts', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setCurrentUser('user02');
      env.setupProjectData({ translationSuggestionsEnabled: false });
      env.wait();

      expect(env.engineCard).toBeNull();

      discardPeriodicTasks();
    }));

    it('should display engine stats', fakeAsync(() => {
      const env = new TestEnvironment();
      env.wait();

      expect(env.qualityStarIcons).toEqual(['star', 'star_half', 'star_border']);
      expect(env.segmentsCount.nativeElement.textContent).toBe('100');

      discardPeriodicTasks();
    }));

    it('should start training engine if not initially enabled', fakeAsync(() => {
      const env = new TestEnvironment({ translationSuggestionsEnabled: false });
      env.wait();

      verify(env.mockedRemoteTranslationEngine.listenForTrainingStatus()).never();
      expect(env.retrainButton).toBeNull();
      env.simulateTranslateSuggestionsEnabled();
      verify(env.mockedRemoteTranslationEngine.listenForTrainingStatus()).twice();
      expect(env.retrainButton).toBeTruthy();

      discardPeriodicTasks();
    }));

    it('training progress status', fakeAsync(() => {
      const env = new TestEnvironment();
      env.wait();

      // We need an extra tick for the TrainingProgress projectId subscription
      tick();
      verify(env.mockedRemoteTranslationEngine.listenForTrainingStatus()).twice();
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgressShown).toBe(true);
      expect(env.component.isTraining).toBe(true);
      env.updateTrainingProgress(1);
      env.completeTrainingProgress();
      expect(env.trainingProgressShown).toBe(false);
      expect(env.component.isTraining).toBe(false);
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgressShown).toBe(true);
      expect(env.component.isTraining).toBe(true);

      discardPeriodicTasks();
    }));

    it('error in training status', fakeAsync(() => {
      const env = new TestEnvironment();
      env.wait();

      // We need an extra tick for the TrainingProgress projectId subscription
      tick();
      verify(env.mockedRemoteTranslationEngine.listenForTrainingStatus()).twice();
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgressShown).toBe(true);
      expect(env.component.isTraining).toBe(true);
      env.throwTrainingProgressError();
      expect(env.trainingProgressShown).toBe(false);
      expect(env.component.isTraining).toBe(false);

      tick(30000);
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgressShown).toBe(true);
      expect(env.component.isTraining).toBe(true);

      discardPeriodicTasks();
    }));

    it('retrain', fakeAsync(() => {
      const env = new TestEnvironment();
      env.wait();

      // We need an extra tick for the TrainingProgress projectId subscription
      tick();
      verify(env.mockedRemoteTranslationEngine.listenForTrainingStatus()).twice();
      env.clickRetrainButton();
      expect(env.trainingProgressShown).toBe(true);
      expect(env.trainingProgress.mode).toBe('indeterminate');
      expect(env.component.isTraining).toBe(true);
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress.mode).toBe('determinate');

      discardPeriodicTasks();
    }));

    it('should display the Paratext credentials update prompt when get projects throws a forbidden error', fakeAsync(() => {
      const env = new TestEnvironment();
      when(env.mockedRemoteTranslationEngine.startTraining()).thenReject(new HttpErrorResponse({ status: 401 }));
      env.wait();

      env.clickRetrainButton();
      env.wait();

      verify(env.mockedRemoteTranslationEngine.startTraining()).once();
      verify(mockedAuthService.requestParatextCredentialUpdate()).once();
      expect(env.trainingProgressShown).toBe(false);
      expect(env.component.isTraining).toBe(false);

      discardPeriodicTasks();
    }));

    it('should not create engine if no source text docs', fakeAsync(() => {
      const env = new TestEnvironment({ translationSuggestionsEnabled: false });
      when(mockedTranslationEngineService.checkHasSourceBooks(anything())).thenReturn(false);
      verify(mockedTranslationEngineService.createTranslationEngine(anything())).never();
      expect(env.translationSuggestionsInfoMessage).toBeFalsy();
      env.simulateTranslateSuggestionsEnabled(true);
      verify(mockedTranslationEngineService.createTranslationEngine(anything())).never();
      expect(env.translationSuggestionsInfoMessage).toBeTruthy();
      env.clickRetrainButton();
      verify(mockedTranslationEngineService.createTranslationEngine(anything())).never();
      expect(env.translationSuggestionsInfoMessage).toBeTruthy();

      discardPeriodicTasks();
    }));

    it('retrain should be disabled if offline', fakeAsync(() => {
      const env = new TestEnvironment();
      env.wait();

      expect(env.retrainButton).toBeTruthy();
      expect(env.retrainButton.nativeElement.disabled).toBe(false);

      env.isOnline = false;
      expect(env.retrainButton.nativeElement.disabled).toBe(true);

      discardPeriodicTasks();
    }));
  });
});

interface TestProjectConfiguration {
  projectId?: string;
  sourceProjectId?: string;
  translationSuggestionsEnabled?: boolean;
  allSegmentsBlank?: boolean;
  textPermission?: TextInfoPermission;
}

class TestEnvironment {
  readonly component: TranslateOverviewComponent;
  readonly fixture: ComponentFixture<TranslateOverviewComponent>;

  readonly mockedRemoteTranslationEngine = mock(RemoteTranslationEngine);
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  private trainingProgress$ = new Subject<ProgressStatus>();

  constructor(projectConfig: TestProjectConfiguration = {}) {
    const params = { ['projectId']: 'project01' } as Params;
    when(mockedActivatedRoute.params).thenReturn(of(params));
    when(mockedActivatedRoute.snapshot).thenReturn({} as any); // just needs to not be null/undefined
    when(mockedTranslationEngineService.createTranslationEngine('project01')).thenReturn(
      instance(this.mockedRemoteTranslationEngine)
    );
    when(mockedTranslationEngineService.checkHasSourceBooks(anything())).thenReturn(true);
    when(this.mockedRemoteTranslationEngine.getStats()).thenResolve({ confidence: 0.25, trainedSegmentCount: 100 });
    when(this.mockedRemoteTranslationEngine.listenForTrainingStatus()).thenReturn(defer(() => this.trainingProgress$));
    when(this.mockedRemoteTranslationEngine.startTraining()).thenResolve();
    when(mockedProgressService.isLoaded$).thenReturn(of(true));
    when(mockedProgressService.overallProgress).thenReturn(new Progress());
    when(mockedProgressService.texts).thenReturn([
      { translated: 10, blank: 10, total: 20, percentage: 50, text: { bookNum: 40 } as TextInfo } as TextProgress,
      { translated: 10, blank: 10, total: 20, percentage: 50, text: { bookNum: 41 } as TextInfo } as TextProgress,
      { translated: 10, blank: 10, total: 20, percentage: 50, text: { bookNum: 42 } as TextInfo } as TextProgress,
      { translated: 10, blank: 10, total: 20, percentage: 50, text: { bookNum: 43 } as TextInfo } as TextProgress
    ]);

    this.setCurrentUser();

    this.fixture = TestBed.createComponent(TranslateOverviewComponent);
    this.component = this.fixture.componentInstance;
    this.setupProjectData(projectConfig);
    this.setupUserData();
  }

  get progressTextList(): HTMLElement {
    return this.fixture.nativeElement.querySelector('mat-list');
  }

  get progressTitle(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#translate-overview-title');
  }

  get qualityStars(): DebugElement {
    return this.fixture.debugElement.query(By.css('.engine-card-quality-stars'));
  }

  get qualityStarIcons(): string[] {
    const stars = this.qualityStars.queryAll(By.css('mat-icon'));
    return stars.map(s => s.nativeElement.textContent);
  }

  get segmentsCount(): DebugElement {
    return this.fixture.debugElement.query(By.css('.engine-card-segments-count'));
  }

  get translationSuggestionsInfoMessage(): DebugElement {
    return this.fixture.debugElement.query(By.css('.translation-suggestions-info'));
  }

  get trainingProgress(): MatProgressBar {
    return this.fixture.debugElement.query(By.css('#training-progress-bar')).componentInstance;
  }

  get trainingProgressShown(): boolean {
    return !(this.trainingProgress._elementRef.nativeElement as HTMLElement).classList.contains(
      'mat-progress-bar--closed'
    );
  }

  get retrainButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#retrain-button'));
  }

  get engineCard(): DebugElement {
    return this.fixture.debugElement.query(By.css('.engine-card'));
  }

  set isOnline(value: boolean) {
    this.testOnlineStatusService.setIsOnline(value);
    this.wait();
  }

  setCurrentUser(userId: string = 'user01'): void {
    when(mockedUserService.currentUserId).thenReturn(userId);
    when(mockedUserService.getCurrentUser()).thenCall(() =>
      this.realtimeService.subscribe(UserDoc.COLLECTION, userId, UNKNOWN_COMPONENT_OR_SERVICE)
    );
  }

  wait(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  // Some project doc changes are throttled by 1000 ms, so we have to wait for them
  waitForProjectDocChanges(): void {
    tick(1000);
    this.wait();
  }

  expectContainsTextProgress(index: number, primary: string, secondary: string): void {
    const items: NodeListOf<Element> = this.progressTextList.querySelectorAll('mat-list-item');
    const item: Element = items.item(index);
    const primaryElem: Element = item.querySelectorAll('.mat-mdc-list-item-title')[0];
    expect(primaryElem.textContent).toBe(primary);
    const secondaryElem: Element = item.querySelectorAll('.mat-mdc-list-item-line')[0];
    expect(secondaryElem.textContent).toBe(secondary);
  }

  setupProjectData(projectConfig: TestProjectConfiguration = {}): void {
    // Set default configuration values
    const projectId: string = projectConfig.projectId ?? 'project01';
    const translationSuggestionsEnabled = projectConfig.translationSuggestionsEnabled ?? true;
    const textPermission: TextInfoPermission = projectConfig?.textPermission ?? TextInfoPermission.Write;
    when(mockedPermissionService.canAccessText(anything())).thenResolve(textPermission !== TextInfoPermission.None);

    // Setup the project data
    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
      id: projectId,
      data: createTestProjectProfile({
        translateConfig: {
          translationSuggestionsEnabled,
          source: {
            projectRef: projectConfig.sourceProjectId
          }
        },
        userRoles: {
          user01: SFProjectRole.ParatextTranslator,
          user02: SFProjectRole.ParatextConsultant
        },
        texts: [
          {
            bookNum: 41,
            chapters: [
              {
                number: 1,
                lastVerse: 3,
                isValid: true,
                permissions: {
                  user01: textPermission,
                  user02: textPermission
                }
              },
              {
                number: 2,
                lastVerse: 3,
                isValid: true,
                permissions: {
                  user01: textPermission,
                  user02: textPermission
                }
              }
            ],
            hasSource: true,
            permissions: {
              user01: textPermission,
              user02: textPermission
            }
          },
          {
            bookNum: 42,
            chapters: [
              {
                number: 1,
                lastVerse: 3,
                isValid: true,
                permissions: {
                  user01: textPermission,
                  user02: textPermission
                }
              },
              {
                number: 2,
                lastVerse: 3,
                isValid: true,
                permissions: {
                  user01: textPermission,
                  user02: textPermission
                }
              }
            ],
            hasSource: true,
            permissions: {
              user01: textPermission,
              user02: textPermission
            }
          },
          {
            bookNum: 43,
            chapters: [
              {
                number: 1,
                lastVerse: 3,
                isValid: true,
                permissions: {
                  user01: textPermission,
                  user02: textPermission
                }
              },
              {
                number: 2,
                lastVerse: 3,
                isValid: true,
                permissions: {
                  user01: textPermission,
                  user02: textPermission
                }
              }
            ],
            hasSource: false,
            permissions: {
              user01: textPermission,
              user02: textPermission
            }
          },
          {
            bookNum: 40,
            chapters: [
              {
                number: 1,
                lastVerse: 3,
                isValid: true,
                permissions: {
                  user01: textPermission,
                  user02: textPermission
                }
              },
              {
                number: 2,
                lastVerse: 3,
                isValid: true,
                permissions: {
                  user01: textPermission,
                  user02: textPermission
                }
              }
            ],
            hasSource: true,
            permissions: {
              user01: textPermission,
              user02: textPermission
            }
          }
        ]
      })
    });

    this.addTextDoc(new TextDocId(projectId, 40, 1, 'target'), projectConfig.allSegmentsBlank);
    this.addTextDoc(new TextDocId(projectId, 40, 2, 'target'), projectConfig.allSegmentsBlank);
    this.addTextDoc(new TextDocId(projectId, 41, 1, 'target'), projectConfig.allSegmentsBlank);
    this.addTextDoc(new TextDocId(projectId, 41, 2, 'target'), projectConfig.allSegmentsBlank);
    this.addTextDoc(new TextDocId(projectId, 42, 1, 'target'), projectConfig.allSegmentsBlank);
    this.addTextDoc(new TextDocId(projectId, 42, 2, 'target'), projectConfig.allSegmentsBlank);
    this.addTextDoc(new TextDocId(projectId, 43, 1, 'target'), projectConfig.allSegmentsBlank);
    this.addTextDoc(new TextDocId(projectId, 43, 2, 'target'), projectConfig.allSegmentsBlank);
  }

  setupUserData(userId: string = 'user01', projects: string[] = ['project01']): void {
    this.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
      id: userId,
      data: createTestUser({
        sites: {
          sf: {
            projects
          }
        }
      })
    });
  }

  updateTrainingProgress(percentCompleted: number): void {
    this.trainingProgress$.next({ percentCompleted, message: 'message' });
    this.fixture.detectChanges();
  }

  throwTrainingProgressError(): void {
    const trainingProgress$ = this.trainingProgress$;
    this.trainingProgress$ = new Subject<ProgressStatus>();
    trainingProgress$.error(new HttpErrorResponse({ status: 404 }));
    this.fixture.detectChanges();
  }

  completeTrainingProgress(): void {
    const trainingProgress$ = this.trainingProgress$;
    this.trainingProgress$ = new Subject<ProgressStatus>();
    trainingProgress$.complete();
    this.fixture.detectChanges();
    tick();
  }

  clickRetrainButton(): void {
    this.retrainButton.nativeElement.click();
    this.fixture.detectChanges();
  }

  addVerse(bookNum: number, chapter: number): void {
    const delta = new Delta();
    delta.insert(`chapter ${chapter}, verse 22.`, { segment: `verse_${chapter}_22` });

    const textDoc = this.realtimeService.get<TextDoc>(
      TextDoc.COLLECTION,
      getTextDocId('project01', bookNum, chapter),
      UNKNOWN_COMPONENT_OR_SERVICE
    );
    textDoc.submit({ ops: delta.ops });
    this.waitForProjectDocChanges();
  }

  simulateTranslateSuggestionsEnabled(enabled: boolean = true): void {
    const projectDoc: SFProjectProfileDoc = this.realtimeService.get(
      SFProjectProfileDoc.COLLECTION,
      'project01',
      UNKNOWN_COMPONENT_OR_SERVICE
    );
    projectDoc.submitJson0Op(
      op => op.set<boolean>(p => p.translateConfig.translationSuggestionsEnabled, enabled),
      false
    );
    this.waitForProjectDocChanges();
  }

  private addTextDoc(id: TextDocId, allSegmentsBlank?: boolean): void {
    const delta = new Delta();
    delta.insert({ chapter: { number: id.chapterNum.toString(), style: 'c' } });
    delta.insert({ blank: true }, { segment: 'p_1' });
    delta.insert({ verse: { number: '1', style: 'v' } });
    if (allSegmentsBlank) {
      delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_1` });
    } else {
      delta.insert(`chapter ${id.chapterNum}, verse 1.`, { segment: `verse_${id.chapterNum}_1` });
    }
    delta.insert({ verse: { number: '2', style: 'v' } });
    delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_2` });
    delta.insert({ verse: { number: '3', style: 'v' } });
    if (allSegmentsBlank) {
      delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_3` });
    } else {
      delta.insert(`chapter ${id.chapterNum}, verse 3.`, { segment: `verse_${id.chapterNum}_3` });
    }
    delta.insert({ verse: { number: '4', style: 'v' } });
    delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_4` });
    delta.insert({ verse: { number: '5', style: 'v' } });
    if (allSegmentsBlank) {
      delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_5` });
    } else {
      delta.insert(`chapter ${id.chapterNum}, verse 5.`, { segment: `verse_${id.chapterNum}_5` });
    }
    delta.insert({ verse: { number: '6', style: 'v' } });
    delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_6` });
    delta.insert({ verse: { number: '7', style: 'v' } });
    if (allSegmentsBlank) {
      delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_7` });
    } else {
      delta.insert(`chapter ${id.chapterNum}, verse 7.`, { segment: `verse_${id.chapterNum}_7` });
    }
    delta.insert({ verse: { number: '8', style: 'v' } });
    delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_8` });
    delta.insert({ verse: { number: '9', style: 'v' } });
    if (allSegmentsBlank) {
      delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_9` });
    } else {
      delta.insert(`chapter ${id.chapterNum}, verse 9.`, { segment: `verse_${id.chapterNum}_9` });
    }
    delta.insert({ verse: { number: '10', style: 'v' } });
    delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_10` });
    delta.insert('\n', { para: { style: 'p' } });
    this.realtimeService.addSnapshot(TextDoc.COLLECTION, {
      id: id.toString(),
      type: RichText.type.name,
      data: delta
    });
  }
}
