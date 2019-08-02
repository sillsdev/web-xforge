import { MdcLinearProgress } from '@angular-mdc/web';
import { DebugElement, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Params } from '@angular/router';
import { ProgressStatus, RemoteTranslationEngine } from '@sillsdev/machine';
import * as OTJson0 from 'ot-json0';
import * as RichText from 'rich-text';
import { defer, of, Subject } from 'rxjs';
import { deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { NoticeService } from 'xforge-common/notice.service';
import { MemoryRealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProject } from '../../core/models/sfproject';
import { SFProjectDoc } from '../../core/models/sfproject-doc';
import { Delta, TextDoc } from '../../core/models/text-doc';
import { TextDocId } from '../../core/models/text-doc-id';
import { SFProjectService } from '../../core/sfproject.service';
import { TranslateOverviewComponent } from './translate-overview.component';

describe('TranslateOverviewComponent', () => {
  describe('Progress Card', () => {
    it('should list all books in project', fakeAsync(() => {
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      expect(env.progressTitle.textContent).toContain('Progress');
      expect(env.component.texts.length).toEqual(3);
      env.expectContainsTextProgress(0, 'Matthew', '10 of 20 segments');
      env.expectContainsTextProgress(1, 'Mark', '10 of 20 segments');
      env.expectContainsTextProgress(2, 'Luke', '10 of 20 segments');
    }));
  });

  describe('Engine Card', () => {
    it('should display engine stats', fakeAsync(() => {
      const env = new TestEnvironment();
      env.fixture.detectChanges();

      expect(env.qualityStarIcons).toEqual(['star', 'star_half', 'star_border']);
      expect(env.segmentsCount.nativeElement.textContent).toBe('100');
    }));

    it('training progress status', fakeAsync(() => {
      const env = new TestEnvironment();
      env.fixture.detectChanges();

      verify(env.mockedRemoteTranslationEngine.listenForTrainingStatus()).once();
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress.open).toBe(true);
      expect(env.component.isTraining).toBe(true);
      env.updateTrainingProgress(1);
      env.completeTrainingProgress();
      expect(env.trainingProgress.open).toBe(false);
      expect(env.component.isTraining).toBe(false);
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress.open).toBe(true);
      expect(env.component.isTraining).toBe(true);
    }));

    it('retrain', fakeAsync(() => {
      const env = new TestEnvironment();
      env.fixture.detectChanges();

      verify(env.mockedRemoteTranslationEngine.listenForTrainingStatus()).once();
      env.clickRetrainButton();
      expect(env.trainingProgress.open).toBe(true);
      expect(env.trainingProgress.determinate).toBe(false);
      expect(env.component.isTraining).toBe(true);
      env.updateTrainingProgress(0.1);
      expect(env.trainingProgress.determinate).toBe(true);
    }));
  });
});

class TestEnvironment {
  readonly mockedActivatedRoute = mock(ActivatedRoute);
  readonly mockedSFProjectService = mock(SFProjectService);
  readonly mockedNoticeService = mock(NoticeService);
  readonly mockedRemoteTranslationEngine = mock(RemoteTranslationEngine);
  readonly mockedRealtimeOfflineStore = mock(RealtimeOfflineStore);

  readonly component: TranslateOverviewComponent;
  readonly fixture: ComponentFixture<TranslateOverviewComponent>;

  private trainingProgress$ = new Subject<ProgressStatus>();

  constructor() {
    const params = { ['projectId']: 'project01' } as Params;
    when(this.mockedActivatedRoute.params).thenReturn(of(params));
    when(this.mockedSFProjectService.createTranslationEngine('project01')).thenReturn(
      instance(this.mockedRemoteTranslationEngine)
    );
    when(this.mockedRemoteTranslationEngine.getStats()).thenResolve({ confidence: 0.25, trainedSegmentCount: 100 });
    when(this.mockedRemoteTranslationEngine.listenForTrainingStatus()).thenReturn(defer(() => this.trainingProgress$));
    TestBed.configureTestingModule({
      declarations: [TranslateOverviewComponent],
      imports: [UICommonModule],
      providers: [
        { provide: ActivatedRoute, useFactory: () => instance(this.mockedActivatedRoute) },
        { provide: SFProjectService, useFactory: () => instance(this.mockedSFProjectService) },
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });

    this.fixture = TestBed.createComponent(TranslateOverviewComponent);
    this.component = this.fixture.componentInstance;
    this.setupProjectData();
    this.fixture.detectChanges();
    tick();
  }

  get progressTextList(): HTMLElement {
    return this.fixture.nativeElement.querySelector('mdc-list');
  }

  get progressTitle(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#translate-overview-title');
  }

  get qualityStars(): DebugElement {
    return this.fixture.debugElement.query(By.css('.engine-card-quality-stars'));
  }

  get qualityStarIcons(): string[] {
    const stars = this.qualityStars.queryAll(By.css('mdc-icon'));
    return stars.map(s => s.nativeElement.textContent);
  }

  get segmentsCount(): DebugElement {
    return this.fixture.debugElement.query(By.css('.engine-card-segments-count'));
  }

  get trainingProgress(): MdcLinearProgress {
    return this.fixture.debugElement.query(By.css('#training-progress')).componentInstance;
  }

  get retrainButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#retrain-button'));
  }

  expectContainsTextProgress(index: number, primary: string, secondary: string): void {
    const items = this.progressTextList.querySelectorAll('mdc-list-item');
    const item = items.item(index);
    const primaryElem = item.querySelector('.mdc-list-item__primary-text');
    expect(primaryElem.textContent).toBe(primary);
    const secondaryElem = item.querySelector('.mdc-list-item__secondary-text');
    expect(secondaryElem.textContent).toBe(secondary);
  }

  setupProjectData(): void {
    const project: SFProject = {
      texts: [
        { bookId: 'MAT', name: 'Matthew', chapters: [{ number: 1 }, { number: 2 }], hasSource: true },
        { bookId: 'MRK', name: 'Mark', chapters: [{ number: 1 }, { number: 2 }], hasSource: true },
        { bookId: 'LUK', name: 'Luke', chapters: [{ number: 1 }, { number: 2 }], hasSource: true },
        { bookId: 'JHN', name: 'John', chapters: [{ number: 1 }, { number: 2 }], hasSource: false }
      ]
    };
    const adapter = new MemoryRealtimeDocAdapter(OTJson0.type, 'project01', project);
    const doc = new SFProjectDoc(adapter, instance(this.mockedRealtimeOfflineStore));
    when(this.mockedSFProjectService.get('project01')).thenResolve(doc);

    this.addTextDoc(new TextDocId('project01', 'MAT', 1, 'target'));
    this.addTextDoc(new TextDocId('project01', 'MAT', 2, 'target'));
    this.addTextDoc(new TextDocId('project01', 'MRK', 1, 'target'));
    this.addTextDoc(new TextDocId('project01', 'MRK', 2, 'target'));
    this.addTextDoc(new TextDocId('project01', 'LUK', 1, 'target'));
    this.addTextDoc(new TextDocId('project01', 'LUK', 2, 'target'));
  }

  updateTrainingProgress(percentCompleted: number): void {
    this.trainingProgress$.next({ percentCompleted, message: 'message' });
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

  private addTextDoc(id: TextDocId): void {
    when(this.mockedSFProjectService.getText(deepEqual(id))).thenResolve(this.createTextDoc(id));
  }

  private createTextDoc(id: TextDocId): TextDoc {
    const delta = new Delta();
    delta.insert({ chapter: { number: id.chapter.toString(), style: 'c' } });
    delta.insert({ verse: { number: '1', style: 'v' } });
    delta.insert(`chapter ${id.chapter}, verse 1.`, { segment: `verse_${id.chapter}_1` });
    delta.insert({ verse: { number: '2', style: 'v' } });
    delta.insert({ blank: 'normal' }, { segment: `verse_${id.chapter}_2` });
    delta.insert({ verse: { number: '3', style: 'v' } });
    delta.insert(`chapter ${id.chapter}, verse 3.`, { segment: `verse_${id.chapter}_3` });
    delta.insert({ verse: { number: '4', style: 'v' } });
    delta.insert({ blank: 'normal' }, { segment: `verse_${id.chapter}_4` });
    delta.insert({ verse: { number: '5', style: 'v' } });
    delta.insert(`chapter ${id.chapter}, verse 5.`, { segment: `verse_${id.chapter}_5` });
    delta.insert({ verse: { number: '6', style: 'v' } });
    delta.insert({ blank: 'normal' }, { segment: `verse_${id.chapter}_6` });
    delta.insert({ verse: { number: '7', style: 'v' } });
    delta.insert(`chapter ${id.chapter}, verse 7.`, { segment: `verse_${id.chapter}_7` });
    delta.insert({ verse: { number: '8', style: 'v' } });
    delta.insert({ blank: 'normal' }, { segment: `verse_${id.chapter}_8` });
    delta.insert({ verse: { number: '9', style: 'v' } });
    delta.insert(`chapter ${id.chapter}, verse 9.`, { segment: `verse_${id.chapter}_9` });
    delta.insert({ verse: { number: '10', style: 'v' } });
    delta.insert({ blank: 'normal' }, { segment: `verse_${id.chapter}_10` });
    delta.insert('\n', { para: { style: 'p' } });
    const adapter = new MemoryRealtimeDocAdapter(RichText.type, id.toString(), delta);
    return new TextDoc(adapter, instance(this.mockedRealtimeOfflineStore));
  }
}
