import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { ProgressStatus } from '@sillsdev/machine';
import * as RichText from 'rich-text';
import { defer, Subject } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import {
  CheckingAnswerExport,
  CheckingShareLevel
} from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TranslateShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { Delta, TextDoc, TextDocId } from '../../core/models/text-doc';
import { TranslationEngineService } from '../../core/translation-engine.service';
import { RemoteTranslationEngine } from '../../machine-api/remote-translation-engine';
import { TrainingProgressComponent } from './training-progress.component';

const mockedProjectService = mock(SFProjectService);
const mockedTranslationEngineService = mock(TranslationEngineService);

describe('TrainingProgressComponent', () => {
  configureTestingModule(() => ({
    imports: [TestTranslocoModule, UICommonModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    declarations: [TrainingProgressComponent],
    providers: [
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: TranslationEngineService, useMock: mockedTranslationEngineService }
    ]
  }));

  it('should setup translation engine', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData(true);
    env.wait();

    verify(env.mockedRemoteTranslationEngine.listenForTrainingStatus()).once();
    expect(env.trainingProgress).toBeNull();
  }));

  it('should display', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData(true);
    env.wait();

    env.updateTrainingProgress(0.1);
    expect(env.trainingProgress).not.toBeNull();
  }));

  it('should not display if suggestions disabled', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData(false);
    env.wait();

    env.updateTrainingProgress(0.1);
    expect(env.trainingProgress).toBeNull();
  }));

  it('should close when the button is clicked', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData(true);
    env.wait();

    env.updateTrainingProgress(0.1);
    expect(env.trainingProgress).not.toBeNull();

    env.clickElement(env.closeButton);
    expect(env.trainingProgress).toBeNull();
  }));

  it('should close when completed', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData(true);
    env.wait();

    env.updateTrainingProgress(0.1);
    expect(env.trainingProgress).not.toBeNull();

    env.updateTrainingProgress(1);
    env.completeTrainingProgress();
    expect(env.trainingProgress).not.toBeNull();
    tick(5000);
    env.wait();
    expect(env.trainingProgress).toBeNull();
  }));
});

class TestEnvironment {
  readonly component: TrainingProgressComponent;
  readonly fixture: ComponentFixture<TrainingProgressComponent>;
  readonly mockedRemoteTranslationEngine = mock(RemoteTranslationEngine);
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  private trainingProgress$ = new Subject<ProgressStatus>();

  constructor() {
    when(mockedProjectService.getProfile(anything())).thenCall(id =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, id)
    );
    when(mockedTranslationEngineService.createTranslationEngine('project01')).thenReturn(
      instance(this.mockedRemoteTranslationEngine)
    );
    when(mockedTranslationEngineService.checkHasSourceBooks(anything())).thenReturn(true);
    when(this.mockedRemoteTranslationEngine.listenForTrainingStatus()).thenReturn(defer(() => this.trainingProgress$));

    this.fixture = TestBed.createComponent(TrainingProgressComponent);
    this.component = this.fixture.componentInstance;
    this.component.projectId = 'project01';
  }

  get closeButton(): HTMLButtonElement {
    return this.fixture.nativeElement.querySelector('#training-close-button') as HTMLButtonElement;
  }

  get trainingProgress(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.training-progress');
  }

  private addTextDoc(id: TextDocId): void {
    const delta = new Delta();
    delta.insert({ chapter: { number: id.chapterNum.toString(), style: 'c' } });
    delta.insert({ blank: true }, { segment: 'p_1' });
    delta.insert({ verse: { number: '1', style: 'v' } });
    delta.insert(`chapter ${id.chapterNum}, verse 1.`, { segment: `verse_${id.chapterNum}_1` });
    delta.insert({ verse: { number: '2', style: 'v' } });
    delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_2` });
    delta.insert({ verse: { number: '3', style: 'v' } });
    delta.insert(`chapter ${id.chapterNum}, verse 3.`, { segment: `verse_${id.chapterNum}_3` });
    this.realtimeService.addSnapshot(TextDoc.COLLECTION, {
      id: id.toString(),
      type: RichText.type.name,
      data: delta
    });
  }

  clickElement(element: HTMLElement): void {
    element.click();
    flush();
    this.fixture.detectChanges();
  }

  completeTrainingProgress(): void {
    const trainingProgress$ = this.trainingProgress$;
    this.trainingProgress$ = new Subject<ProgressStatus>();
    trainingProgress$.complete();
    this.fixture.detectChanges();
    tick();
  }

  setupProjectData(translationSuggestionsEnabled: boolean): void {
    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
      id: 'project01',
      data: {
        name: 'project 01',
        paratextId: 'pt01',
        shortName: 'P01',
        writingSystem: {
          tag: 'qaa'
        },
        translateConfig: {
          translationSuggestionsEnabled,
          shareEnabled: false,
          shareLevel: TranslateShareLevel.Specific
        },
        checkingConfig: {
          checkingEnabled: false,
          usersSeeEachOthersResponses: true,
          shareEnabled: true,
          shareLevel: CheckingShareLevel.Specific,
          answerExportMethod: CheckingAnswerExport.MarkedForExport
        },
        sync: { queuedCount: 0 },
        editable: true,
        userRoles: {
          user01: SFProjectRole.ParatextTranslator,
          user02: SFProjectRole.ParatextConsultant
        },
        userPermissions: {},
        texts: [
          {
            bookNum: 41,
            chapters: [{ number: 1, lastVerse: 3, isValid: true, permissions: {} }],
            hasSource: true,
            permissions: {}
          }
        ]
      }
    });

    this.addTextDoc(new TextDocId('project01', 40, 1, 'target'));
  }

  updateTrainingProgress(percentCompleted: number): void {
    this.trainingProgress$.next({ percentCompleted, message: 'message' });
    this.fixture.detectChanges();
  }

  wait() {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }
}
