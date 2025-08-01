import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatCheckboxHarness } from '@angular/material/checkbox/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { BehaviorSubject, of } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { ProgressService, TextProgress } from '../../../shared/progress-service/progress.service';
import { NllbLanguageService } from '../../nllb-language.service';
import { DraftSource, DraftSourcesAsArrays, DraftSourcesService } from '../draft-sources.service';
import { DraftGenerationStepsComponent, DraftGenerationStepsResult } from './draft-generation-steps.component';

describe('DraftGenerationStepsComponent', () => {
  let component: DraftGenerationStepsComponent;
  let fixture: ComponentFixture<DraftGenerationStepsComponent>;
  let loader: HarnessLoader;

  const mockActivatedProjectService = mock(ActivatedProjectService);
  const mockFeatureFlagService = mock(FeatureFlagService);
  const mockNllbLanguageService = mock(NllbLanguageService);
  const mockProgressService = mock(ProgressService);
  const mockOnlineStatusService = mock(OnlineStatusService);
  const mockNoticeService = mock(NoticeService);
  const mockDraftSourceService = mock(DraftSourcesService);

  when(mockActivatedProjectService.projectId).thenReturn('project01');

  configureTestingModule(() => ({
    imports: [TestTranslocoModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY), NoopAnimationsModule],
    providers: [
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: DraftSourcesService, useMock: mockDraftSourceService },
      { provide: FeatureFlagService, useMock: mockFeatureFlagService },
      { provide: NllbLanguageService, useMock: mockNllbLanguageService },
      { provide: ProgressService, useMock: mockProgressService },
      { provide: OnlineStatusService, useMock: mockOnlineStatusService },
      { provide: NoticeService, useMock: mockNoticeService },
      provideHttpClient(withInterceptorsFromDi()),
      provideHttpClientTesting()
    ]
  }));

  beforeEach(fakeAsync(() => {
    when(mockActivatedProjectService.projectId).thenReturn('project01');
    when(mockActivatedProjectService.projectId$).thenReturn(of('project01'));
    when(mockProgressService.isLoaded$).thenReturn(of(true));
    when(mockProgressService.texts).thenReturn([
      { text: { bookNum: 1 }, translated: 100 } as TextProgress,
      { text: { bookNum: 2 }, translated: 100 } as TextProgress,
      { text: { bookNum: 3 }, translated: 0 } as TextProgress,
      { text: { bookNum: 6 }, translated: 20 } as TextProgress,
      { text: { bookNum: 7 }, translated: 0 } as TextProgress
    ]);
    when(mockOnlineStatusService.isOnline).thenReturn(true);
  }));

  describe('one training source', async () => {
    const availableBooks = [{ bookNum: 1 }, { bookNum: 2 }, { bookNum: 3 }];
    const allBooks = [...availableBooks, { bookNum: 6 }, { bookNum: 7 }];
    const config: DraftSourcesAsArrays = {
      trainingSources: [
        {
          projectRef: 'sourceProject',
          paratextId: 'PT_SP',
          name: 'Source Project',
          shortName: 'sP',
          writingSystem: { tag: 'eng' },
          texts: allBooks.filter(b => b.bookNum !== 6)
        }
      ],
      trainingTargets: [
        {
          projectRef: mockActivatedProjectService.projectId!,
          paratextId: 'PT_TT',
          name: 'Target Project',
          shortName: 'tT',
          writingSystem: { tag: 'xyz' },
          texts: allBooks.filter(b => b.bookNum !== 7)
        }
      ],
      draftingSources: [
        {
          projectRef: 'sourceProject',
          paratextId: 'PT_SP',
          name: 'Source Project',
          shortName: 'sP',
          writingSystem: { tag: 'eng' },
          texts: allBooks.filter(b => b.bookNum !== 6)
        }
      ]
    };
    beforeEach(fakeAsync(() => {
      when(mockDraftSourceService.getDraftProjectSources()).thenReturn(of(config));
      const mockTargetProjectDoc = {
        id: 'project01',
        data: createTestProjectProfile({
          texts: allBooks,
          translateConfig: {
            source: { projectRef: 'sourceProject', shortName: 'sP', writingSystem: { tag: 'xyz' } }
          },
          writingSystem: { tag: 'eng' }
        })
      } as SFProjectProfileDoc;
      const targetProjectDoc$ = new BehaviorSubject<SFProjectProfileDoc>(mockTargetProjectDoc);

      when(mockActivatedProjectService.projectDoc).thenReturn(mockTargetProjectDoc);
      when(mockActivatedProjectService.projectDoc$).thenReturn(targetProjectDoc$);
      when(mockActivatedProjectService.changes$).thenReturn(targetProjectDoc$);
      when(mockNllbLanguageService.isNllbLanguageAsync(anything())).thenResolve(true);
      when(mockNllbLanguageService.isNllbLanguageAsync('xyz')).thenResolve(false);
      when(mockFeatureFlagService.showDeveloperTools).thenReturn(createTestFeatureFlag(false));

      fixture = TestBed.createComponent(DraftGenerationStepsComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      tick();
      fixture.detectChanges();
    }));

    it('should set "allAvailableTranslateBooks" correctly', fakeAsync(() => {
      expect(component.allAvailableTranslateBooks).toEqual([
        { number: 1, selected: false },
        { number: 2, selected: false },
        { number: 3, selected: false }
      ]);
    }));

    it('should set "availableTranslateBooks" correctly', fakeAsync(() => {
      expect(component.availableTranslateBooks).toEqual({
        sourceProject: [
          { number: 1, selected: false },
          { number: 2, selected: false },
          { number: 3, selected: false }
        ]
      });
    }));

    it('should set "availableTrainingBooks" correctly', fakeAsync(() => {
      expect(component.availableTrainingBooks).toEqual({
        project01: [
          { number: 1, selected: false },
          { number: 2, selected: false },
          { number: 3, selected: false }
        ],
        sourceProject: [
          { number: 1, selected: false },
          { number: 2, selected: false },
          { number: 3, selected: false }
        ]
      });
    }));

    it('should set "selectableTrainingBooksByProj" correctly', fakeAsync(() => {
      expect(component.selectableTrainingBooksByProj('project01')).toEqual([
        { number: 1, selected: false },
        { number: 2, selected: false },
        { number: 3, selected: false }
      ]);
      expect(component.selectableTrainingBooksByProj('sourceProject')).toEqual([]);

      component.onTranslatedBookSelect([1, 2]);

      expect(component.selectableTrainingBooksByProj('sourceProject')).toEqual([
        { number: 1, selected: true },
        { number: 2, selected: true }
      ]);
    }));

    it('should set "unusableTranslateSourceBooks" and "unusableTrainingSourceBooks" correctly', fakeAsync(() => {
      expect(component.unusableTranslateSourceBooks).toEqual([6]);
      expect(component.unusableTrainingSourceBooks).toEqual([6]);
      // warn when translated book has no source
      expect(fixture.nativeElement.querySelector('.warn-source-books-missing')).not.toBeNull();
    }));

    it('should set "unusableTranslateTargetBooks" and "unusableTrainingTargetBooks" correctly', fakeAsync(() => {
      expect(component.unusableTranslateTargetBooks).toEqual([7]);
      expect(component.unusableTrainingTargetBooks).toEqual([7]);
    }));

    it('should not advance steps if user is offline', fakeAsync(() => {
      when(mockOnlineStatusService.isOnline).thenReturn(false);
      expect(component.stepper.selectedIndex).toBe(0);
      component['languagesVerified'] = true;
      fixture.detectChanges();
      // Go to translation books
      component.tryAdvanceStep();
      fixture.detectChanges();
      component.onTranslateBookSelect([1], config.draftingSources[0]);
      fixture.detectChanges();
      // Go to training books
      component.tryAdvanceStep();
      tick();
      fixture.detectChanges();
      verify(mockNoticeService.show(anything())).never();
      expect(component.stepper.selectedIndex).toBe(2);
      component.onTranslatedBookSelect([2, 3]);
      tick();
      fixture.detectChanges();
      component.tryAdvanceStep();
      fixture.detectChanges();
      // Attempt to generate draft
      component.tryAdvanceStep();
      fixture.detectChanges();
      verify(mockNoticeService.show(anything())).once();
      expect(component.stepper.selectedIndex).toBe(3);
    }));

    it('should allow selecting books from the training source project', () => {
      component.onSourceTrainingBookSelect([2, 3], config.trainingSources[0]);
      fixture.detectChanges();

      expect(component.selectedTrainingBooksByProj('sourceProject')).toEqual([
        { number: 2, selected: true },
        { number: 3, selected: true }
      ]);
    });

    it('does not select deselected reference book when selecting translated book', () => {
      component.onTranslatedBookSelect([1, 2]);
      fixture.detectChanges();
      component.onSourceTrainingBookSelect([1], config.trainingSources[0]);
      fixture.detectChanges();

      expect(component.selectedTrainingBooksByProj('project01')).toEqual([
        { number: 1, selected: true },
        { number: 2, selected: true }
      ]);
      expect(component.selectedTrainingBooksByProj('sourceProject')).toEqual([{ number: 1, selected: true }]);

      // deselect translated book 1
      component.onTranslatedBookSelect([2]);
      fixture.detectChanges();
      expect(component.selectedTrainingBooksByProj('project01')).toEqual([{ number: 2, selected: true }]);
      // ensure that book 2 in the reference text is not re-selected
      expect(component.selectedTrainingBooksByProj('sourceProject')).toEqual([]);
    });

    it('does not allow selecting not selectable source training books', () => {
      component.onSourceTrainingBookSelect([6, 7], config.trainingSources[0]);
      fixture.detectChanges();

      expect(component.selectedTrainingBooksByProj('sourceProject')).toEqual([]);
    });

    it('clears selected reference books when translated book is unselected', () => {
      component.onTranslatedBookSelect([2, 3]);
      expect(component.selectedTrainingBooksByProj('project01')).toEqual([
        { number: 2, selected: true },
        { number: 3, selected: true }
      ]);
      expect(component.selectedTrainingBooksByProj('sourceProject')).toEqual([
        { number: 2, selected: true },
        { number: 3, selected: true }
      ]);
      component.onTranslatedBookSelect([2]);
      expect(component.selectedTrainingBooksByProj('sourceProject')).toEqual([{ number: 2, selected: true }]);

      component.onTranslatedBookSelect([]);
      expect(component.selectedTrainingBooksByProj('sourceProject')).toEqual([]);
    });

    it('clears selected translated and reference books in training when translate book selected', () => {
      component.tryAdvanceStep();
      fixture.detectChanges();
      component.onTranslateBookSelect([3], config.draftingSources[0]);
      component.tryAdvanceStep();
      fixture.detectChanges();
      component.onTranslatedBookSelect([1, 2]);
      expect(component.selectedTrainingBooksByProj('project01')).toEqual([
        { number: 1, selected: true },
        { number: 2, selected: true }
      ]);
      expect(component.selectedTrainingBooksByProj('sourceProject')).toEqual([
        { number: 1, selected: true },
        { number: 2, selected: true }
      ]);
      component.stepper.selectedIndex = 1;
      fixture.detectChanges();
      component.onTranslateBookSelect([2, 3], config.draftingSources[0]);
      component.tryAdvanceStep();
      fixture.detectChanges();
      expect(component.selectedTrainingBooksByProj('sourceProject')).toEqual([{ number: 1, selected: true }]);
      expect(component.selectedTrainingBooksByProj('project01')).toEqual([{ number: 1, selected: true }]);
    });

    it('shows unselected translate book on training page', () => {
      component.tryAdvanceStep();
      fixture.detectChanges();
      // select Exodus and Leviticus
      component.onTranslateBookSelect([2, 3], config.draftingSources[0]);
      component.tryAdvanceStep();
      fixture.detectChanges();
      component.onTranslatedBookSelect([1]);
      expect(component.selectableTrainingBooksByProj('project01')).toEqual([{ number: 1, selected: true }]);
      expect(component.selectedTrainingBooksByProj('project01')).toEqual([{ number: 1, selected: true }]);
      expect(component.selectedTrainingBooksByProj('sourceProject')).toEqual([{ number: 1, selected: true }]);
      component.stepper.selectedIndex = 1;
      fixture.detectChanges();
      // deselect Exodus and keep Leviticus
      component.onTranslateBookSelect([3], config.draftingSources[0]);
      component.tryAdvanceStep();
      fixture.detectChanges();
      // Exodus becomes a selectable training book
      expect(component.selectableTrainingBooksByProj('project01')).toEqual([
        { number: 1, selected: true },
        { number: 2, selected: false }
      ]);
      expect(component.selectedTrainingBooksByProj('sourceProject')).toEqual([{ number: 1, selected: true }]);
      expect(component.selectedTrainingBooksByProj('project01')).toEqual([{ number: 1, selected: true }]);
    });

    it('shows error when project has no translated books', () => {
      component.tryAdvanceStep();
      fixture.detectChanges();
      // all books
      component.onTranslateBookSelect([1, 2, 3], config.draftingSources[0]);
      fixture.detectChanges();
      component.tryAdvanceStep();
      fixture.detectChanges();
      expect(component.selectedTrainingBooksByProj('project01').length).toBe(0);
      expect(fixture.nativeElement.querySelector('.error-no-translated-books')).not.toBeNull();
      component.tryAdvanceStep();
      fixture.detectChanges();
      expect(component.showBookSelectionError).toBe(true);
      component.stepper.selectedIndex = 1;
      fixture.detectChanges();
      // deselect Genesis and Exodus
      component.onTranslateBookSelect([3], config.draftingSources[0]);
      component.tryAdvanceStep();
      fixture.detectChanges();
      // Genesis and Exodus becomes a selectable training book
      expect(component.selectableTrainingBooksByProj('project01')).toEqual([
        { number: 1, selected: false },
        { number: 2, selected: false }
      ]);
      expect(fixture.nativeElement.querySelector('.error-no-translated-books')).toBeNull();
      expect(component.showBookSelectionError).toBe(false);
    });
  });

  describe('additional training source', () => {
    const availableBooks = [{ bookNum: 2 }, { bookNum: 3 }];
    const allBooks = [{ bookNum: 1 }, ...availableBooks, { bookNum: 6 }, { bookNum: 7 }, { bookNum: 8 }];
    const config = {
      trainingSources: [
        {
          projectRef: 'source1',
          paratextId: 'PT_SP1',
          shortName: 'sP1',
          writingSystem: { tag: 'eng' },
          texts: availableBooks.concat({ bookNum: 1 })
        },
        {
          projectRef: 'source2',
          paratextId: 'PT_SP2',
          shortName: 'sP2',
          writingSystem: { tag: 'eng' },
          texts: availableBooks.concat({ bookNum: 6 })
        }
      ] as [DraftSource, DraftSource],
      trainingTargets: [
        {
          projectRef: mockActivatedProjectService.projectId,
          shortName: 'tT',
          writingSystem: { tag: 'xyz' },
          texts: allBooks
        }
      ] as [DraftSource],
      draftingSources: [
        {
          projectRef: 'draftingSource',
          shortName: 'dS',
          writingSystem: { tag: 'eng' },
          texts: availableBooks.concat({ bookNum: 7 })
        }
      ] as [DraftSource]
    };

    beforeEach(fakeAsync(() => {
      when(mockDraftSourceService.getDraftProjectSources()).thenReturn(of(config));
      when(mockActivatedProjectService.projectDoc$).thenReturn(of({} as any));
      when(mockActivatedProjectService.changes$).thenReturn(of({} as any));
      when(mockActivatedProjectService.projectDoc).thenReturn({} as any);
      when(mockFeatureFlagService.showDeveloperTools).thenReturn(createTestFeatureFlag(false));
      when(mockNllbLanguageService.isNllbLanguageAsync(anything())).thenResolve(true);
      when(mockNllbLanguageService.isNllbLanguageAsync('xyz')).thenResolve(false);

      fixture = TestBed.createComponent(DraftGenerationStepsComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      tick();
    }));

    it('should set "allAvailableTranslateBooks" correctly and with canonical book order', fakeAsync(() => {
      expect(component.allAvailableTranslateBooks).toEqual([
        { number: 2, selected: false },
        { number: 3, selected: false },
        { number: 7, selected: false }
      ]);
    }));

    it('should set "availableTranslateBooks" correctly and with canonical book order', fakeAsync(() => {
      expect(component.availableTranslateBooks).toEqual({
        draftingSource: [
          { number: 2, selected: false },
          { number: 3, selected: false },
          { number: 7, selected: false }
        ]
      });
    }));

    it('should set "availableTrainingBooks" correctly and with canonical book order', fakeAsync(() => {
      expect(component.availableTrainingBooks).toEqual({
        source1: [
          { number: 1, selected: false },
          { number: 2, selected: false },
          { number: 3, selected: false }
        ],
        source2: [
          { number: 2, selected: false },
          { number: 3, selected: false },
          { number: 6, selected: false }
        ],
        project01: [
          { number: 1, selected: false },
          { number: 2, selected: false },
          { number: 3, selected: false },
          { number: 6, selected: false }
        ]
      });
    }));

    it('should set "unusableTranslateSourceBooks" and "unusableTrainingSourceBooks" correctly', fakeAsync(() => {
      tick();
      fixture.detectChanges();
      expect(component.unusableTranslateSourceBooks).toEqual([1, 6, 8]);
      expect(component.unusableTrainingSourceBooks).toEqual([6, 7, 8]);

      // interact with unusable books notice
      const unusableTranslateBooks = fixture.nativeElement.querySelector('.unusable-translate-books');
      expect(unusableTranslateBooks).not.toBeNull();
      expect(unusableTranslateBooks.querySelector('.explanation')).toBeNull();
      unusableTranslateBooks.querySelector('.books-hidden-message').click();
      tick();
      fixture.detectChanges();
      expect(unusableTranslateBooks.querySelector('.explanation')).not.toBeNull();
      const unusableTrainingBooks = fixture.nativeElement.querySelector('.unusable-training-books');
      expect(unusableTrainingBooks).not.toBeNull();
      expect(unusableTrainingBooks.querySelector('.explanation')).toBeNull();
      unusableTrainingBooks.querySelector('.books-hidden-message').click();
      tick();
      fixture.detectChanges();
      expect(unusableTrainingBooks.querySelector('.explanation')).not.toBeNull();
    }));

    it('should show and hide selectable training source books when training books selected', fakeAsync(() => {
      component.onTranslatedBookSelect([2, 6]);
      fixture.detectChanges();

      expect(component.selectedTrainingBooksByProj('source1')).toEqual([{ number: 2, selected: true }]);
      expect(component.selectedTrainingBooksByProj('source2')).toEqual([
        { number: 2, selected: true },
        { number: 6, selected: true }
      ]);
    }));

    it('should correctly emit the selected books when done', fakeAsync(() => {
      component.onTranslateBookSelect([7], config.draftingSources[0]);
      component.onTranslatedBookSelect([2, 3, 6]);
      component.onSourceTrainingBookSelect([2, 3], config.trainingSources[0]);
      component.onSourceTrainingBookSelect([2, 6], config.trainingSources[1]);
      fixture.detectChanges();

      spyOn(component.done, 'emit');
      fixture.detectChanges();
      expect(component.isStepsCompleted).toBe(false);
      // Advance to the next step when at last step should emit books result
      fixture.detectChanges();
      component.tryAdvanceStep();
      fixture.detectChanges();
      component.tryAdvanceStep();
      fixture.detectChanges();
      component.tryAdvanceStep();
      fixture.detectChanges();
      component.tryAdvanceStep();
      fixture.detectChanges();

      expect(component.done.emit).toHaveBeenCalledWith({
        trainingDataFiles: [],
        trainingScriptureRanges: [
          { projectId: 'source1', scriptureRange: 'EXO;LEV' },
          { projectId: 'source2', scriptureRange: 'EXO;JOS' }
        ],
        translationScriptureRanges: [{ projectId: 'draftingSource', scriptureRange: 'JDG' }],
        fastTraining: false,
        useEcho: false
      } as DraftGenerationStepsResult);
      expect(component.isStepsCompleted).toBe(true);
    }));

    it('does not allow selecting not selectable training books', () => {
      component.onTranslatedBookSelect([6, 7, 8]);
      component.onSourceTrainingBookSelect([6, 7, 8], config.trainingSources[0]);
      component.onSourceTrainingBookSelect([1], config.trainingSources[1]);

      expect(component.selectedTrainingBooksByProj('project01')).toEqual([{ number: 6, selected: true }]);
      expect(component.selectedTrainingBooksByProj('source1')).toEqual([]);
      expect(component.selectedTrainingBooksByProj('source2')).toEqual([]);
    });

    it('should allow one source to have no books selected', () => {
      component.onTranslateBookSelect([7], config.draftingSources[0]);
      component.onTranslatedBookSelect([2, 6]);
      component.onSourceTrainingBookSelect([], config.trainingSources[0]);
      component.onSourceTrainingBookSelect([2, 6], config.trainingSources[1]);
      fixture.detectChanges();

      spyOn(component.done, 'emit');
      fixture.detectChanges();
      // Advance to the next step when at last step should emit books result
      fixture.detectChanges();
      component.tryAdvanceStep();
      fixture.detectChanges();
      component.tryAdvanceStep();
      fixture.detectChanges();

      fixture.detectChanges();
      component.tryAdvanceStep();
      fixture.detectChanges();
      component.tryAdvanceStep();
      fixture.detectChanges();

      expect(component.done.emit).toHaveBeenCalledWith({
        trainingDataFiles: [],
        trainingScriptureRanges: [{ projectId: 'source2', scriptureRange: 'EXO;JOS' }],
        translationScriptureRanges: [{ projectId: 'draftingSource', scriptureRange: 'JDG' }],
        fastTraining: false,
        useEcho: false
      } as DraftGenerationStepsResult);
      expect(component.isStepsCompleted).toBe(true);
    });

    it('show warning when both source books missing translated books', () => {
      component.onTranslateBookSelect([7], config.draftingSources[0]);
      component.onTranslatedBookSelect([2, 6]);
      component.onSourceTrainingBookSelect([2, 6], config.trainingSources[0]);
      component.onSourceTrainingBookSelect([], config.trainingSources[1]);
      fixture.detectChanges();

      spyOn(component.done, 'emit');
      fixture.detectChanges();
      // Advance to the next step when at last step should emit books result
      fixture.detectChanges();
      component.tryAdvanceStep();
      fixture.detectChanges();
      component.tryAdvanceStep();
      fixture.detectChanges();

      expect(component.stepper.selectedIndex).toBe(2);
      component.onSourceTrainingBookSelect([2], config.trainingSources[0]);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.error-translated-books-unselected')).not.toBeNull();
      component.tryAdvanceStep();
      fixture.detectChanges();
      // The user cannot advance if reference books are not provided for training
      expect(component.stepper.selectedIndex).toBe(2);
      expect(fixture.nativeElement.querySelector('.error-choose-training-books')).toBeNull();
    });

    it('clears selected reference books when translated book is unselected', () => {
      component.onTranslatedBookSelect([2, 3]);
      expect(component.selectedTrainingBooksByProj('project01')).toEqual([
        { number: 2, selected: true },
        { number: 3, selected: true }
      ]);
      expect(component.selectedTrainingBooksByProj('source1')).toEqual([
        { number: 2, selected: true },
        { number: 3, selected: true }
      ]);
      expect(component.selectedTrainingBooksByProj('source2')).toEqual([
        { number: 2, selected: true },
        { number: 3, selected: true }
      ]);

      component.onTranslatedBookSelect([2]);
      expect(component.selectedTrainingBooksByProj('source1')).toEqual([{ number: 2, selected: true }]);
      expect(component.selectedTrainingBooksByProj('source2')).toEqual([{ number: 2, selected: true }]);

      component.onTranslatedBookSelect([]);
      expect(component.selectedTrainingBooksByProj('source1')).toEqual([]);
      expect(component.selectedTrainingBooksByProj('source2')).toEqual([]);
    });
  });

  describe('show developer tools feature flag is enabled', () => {
    const availableBooks = [{ bookNum: 2 }, { bookNum: 3 }, { bookNum: 9 }, { bookNum: 10 }];
    const allBooks = [{ bookNum: 1 }, ...availableBooks, { bookNum: 6 }, { bookNum: 7 }, { bookNum: 8 }];
    const config: DraftSourcesAsArrays = {
      trainingSources: [
        {
          projectRef: 'source1',
          paratextId: 'PT_SP1',
          name: 'Source Project 1',
          shortName: 'sP1',
          writingSystem: { tag: 'eng' },
          texts: availableBooks.concat({ bookNum: 1 })
        }
      ],
      trainingTargets: [
        {
          projectRef: mockActivatedProjectService.projectId!,
          paratextId: 'PT_TT',
          name: 'Target Project',
          shortName: 'tT',
          writingSystem: { tag: 'nllb' },
          texts: allBooks.filter(b => b.bookNum !== 1 && b.bookNum !== 7)
        }
      ],
      draftingSources: [
        {
          projectRef: 'draftingSource',
          paratextId: 'PT_DS',
          name: 'Drafting Source',
          shortName: 'dS',
          writingSystem: { tag: 'eng' },
          texts: availableBooks.concat({ bookNum: 7 })
        }
      ]
    };

    beforeEach(fakeAsync(() => {
      const mockTargetProjectDoc = {
        id: 'project01',
        data: createTestProjectProfile({
          ...config.trainingTargets[0],
          translateConfig: {
            draftConfig: {
              fastTraining: true,
              useEcho: true
            }
          }
        })
      } as SFProjectProfileDoc;
      when(mockDraftSourceService.getDraftProjectSources()).thenReturn(of(config));
      when(mockActivatedProjectService.projectDoc$).thenReturn(of(mockTargetProjectDoc));
      when(mockActivatedProjectService.changes$).thenReturn(of(mockTargetProjectDoc));
      when(mockActivatedProjectService.projectDoc).thenReturn(mockTargetProjectDoc);
      when(mockFeatureFlagService.showDeveloperTools).thenReturn(createTestFeatureFlag(true));

      fixture = TestBed.createComponent(DraftGenerationStepsComponent);
      loader = TestbedHarnessEnvironment.loader(fixture);
      component = fixture.componentInstance;
      fixture.detectChanges();
      tick();
    }));

    it('should set fast training and echo engine correctly', fakeAsync(() => {
      expect(component.fastTraining).toBe(true);
      expect(component.useEcho).toBe(true);
    }));

    it('should emit the fast training value if checked', async () => {
      component.onTranslateBookSelect([2], config.draftingSources[0]);
      component.onTranslatedBookSelect([3, 9, 10]);
      component.onSourceTrainingBookSelect([3, 9, 10], config.trainingSources[0]);

      spyOn(component.done, 'emit');

      fixture.detectChanges();
      const step = fixture.debugElement.queryAll(By.css('mat-step-header'));
      step[3].nativeElement.click(); //click the next step
      fixture.detectChanges();
      component.tryAdvanceStep();

      // Tick the fast training checkbox
      const fastTrainingHarness = await loader.getHarness(MatCheckboxHarness.with({ selector: '.fast-training' }));
      await fastTrainingHarness.check();

      const echoHarness = await loader.getHarness(MatCheckboxHarness.with({ selector: '.use-echo' }));
      await echoHarness.uncheck();

      // Click next on the final step to generate the draft
      fixture.detectChanges();
      const generateDraftButton: HTMLElement = fixture.nativeElement.querySelector('.advance-button');
      expect(generateDraftButton['disabled']).toBe(false);
      component.tryAdvanceStep();
      fixture.detectChanges();

      expect(component.done.emit).toHaveBeenCalledWith({
        trainingDataFiles: [],
        trainingScriptureRanges: [{ projectId: 'source1', scriptureRange: 'LEV;1SA;2SA' }],
        translationScriptureRanges: [{ projectId: 'draftingSource', scriptureRange: 'EXO' }],
        fastTraining: true,
        useEcho: false
      } as DraftGenerationStepsResult);
      expect(generateDraftButton['disabled']).toBe(true);
    });

    it('should emit the use echo value if checked', async () => {
      component.onTranslateBookSelect([2], config.draftingSources[0]);
      component.onTranslatedBookSelect([3, 9, 10]);
      component.onSourceTrainingBookSelect([3, 9, 10], config.trainingSources[0]);

      spyOn(component.done, 'emit');

      fixture.detectChanges();
      const step = fixture.debugElement.queryAll(By.css('mat-step-header'));
      step[3].nativeElement.click(); //click the next step
      fixture.detectChanges();
      component.tryAdvanceStep();

      // Tick the echo checkbox
      const fastTrainingHarness = await loader.getHarness(MatCheckboxHarness.with({ selector: '.fast-training' }));
      await fastTrainingHarness.uncheck();

      const echoHarness = await loader.getHarness(MatCheckboxHarness.with({ selector: '.use-echo' }));
      await echoHarness.check();

      // Click next on the final step to generate the draft
      fixture.detectChanges();
      const generateDraftButton: HTMLElement = fixture.nativeElement.querySelector('.advance-button');
      expect(generateDraftButton['disabled']).toBe(false);
      component.tryAdvanceStep();
      fixture.detectChanges();

      expect(component.done.emit).toHaveBeenCalledWith({
        trainingDataFiles: [],
        trainingScriptureRanges: [{ projectId: 'source1', scriptureRange: 'LEV;1SA;2SA' }],
        translationScriptureRanges: [{ projectId: 'draftingSource', scriptureRange: 'EXO' }],
        fastTraining: false,
        useEcho: true
      } as DraftGenerationStepsResult);
      expect(generateDraftButton['disabled']).toBe(true);
    });
  });

  describe('target contains previously selected books', () => {
    const availableBooks = [{ bookNum: 2 }, { bookNum: 3 }, { bookNum: 9 }, { bookNum: 10 }];
    const allBooks = [{ bookNum: 1 }, ...availableBooks, { bookNum: 7 }, { bookNum: 8 }];
    const config = {
      trainingSources: [
        {
          projectRef: 'source1',
          shortName: 'sP1',
          writingSystem: { tag: 'eng' },
          texts: availableBooks.concat({ bookNum: 1 })
        },
        {
          projectRef: 'source2',
          shortName: 'sP2',
          writingSystem: { tag: 'eng' },
          texts: availableBooks
        }
      ] as [DraftSource, DraftSource],
      trainingTargets: [
        {
          projectRef: mockActivatedProjectService.projectId,
          shortName: 'tT',
          writingSystem: { tag: 'nllb' },
          texts: allBooks.filter(b => b.bookNum !== 1 && b.bookNum !== 7)
        }
      ] as [DraftSource],
      draftingSources: [
        {
          projectRef: 'draftingSource',
          shortName: 'dS',
          writingSystem: { tag: 'eng' },
          texts: availableBooks.concat({ bookNum: 7 })
        }
      ] as [DraftSource]
    };

    const mockTargetProjectDoc = {
      id: 'project01',
      data: createTestProjectProfile({
        texts: [{ bookNum: 1 }, { bookNum: 2 }, { bookNum: 3 }],
        translateConfig: {
          draftConfig: {
            lastSelectedTrainingDataFiles: [],
            lastSelectedTrainingScriptureRanges: [
              { projectId: 'source1', scriptureRange: 'GEN;1SA' },
              { projectId: 'source2', scriptureRange: '1SA;2SA' }
            ],
            lastSelectedTranslationScriptureRanges: [{ projectId: 'draftingSource', scriptureRange: 'EXO;LEV' }]
          }
        }
      })
    } as SFProjectProfileDoc;

    beforeEach(fakeAsync(() => {
      when(mockDraftSourceService.getDraftProjectSources()).thenReturn(of(config));
      when(mockActivatedProjectService.projectDoc).thenReturn(mockTargetProjectDoc);
      when(mockActivatedProjectService.projectDoc$).thenReturn(of(mockTargetProjectDoc));
      when(mockFeatureFlagService.showDeveloperTools).thenReturn(createTestFeatureFlag(false));

      fixture = TestBed.createComponent(DraftGenerationStepsComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      tick();
    }));

    it('should restore previously selected ranges', () => {
      expect(component.selectedTranslateBooksAsString()).toEqual('Exodus and Leviticus');
      expect(component.booksToTranslate()).toEqual([
        { number: 2, selected: true },
        { number: 3, selected: true }
      ]);
      expect(component.selectedTrainingBooksByProj('project01')).toEqual([
        { number: 9, selected: true },
        { number: 10, selected: true }
      ]);
      //for source1, Genesis was previously selected, but it's no longer present on both source and target
      expect(component.selectedTrainingBooksByProj('source1')).toEqual([{ number: 9, selected: true }]);
      expect(component.selectedTrainingBooksByProj('source2')).toEqual([
        { number: 9, selected: true },
        { number: 10, selected: true }
      ]);
    });
  });

  describe('can add additional training data', () => {
    const availableBooks = [{ bookNum: 2 }, { bookNum: 3 }];
    const config: DraftSourcesAsArrays = {
      trainingSources: [
        {
          projectRef: 'source1',
          paratextId: 'PT_SP1',
          name: 'Source Project 1',
          shortName: 'sP1',
          writingSystem: { tag: 'eng' },
          texts: availableBooks
        }
      ],
      trainingTargets: [
        {
          projectRef: mockActivatedProjectService.projectId!,
          paratextId: 'PT_TP',
          name: 'Target Project',
          shortName: 'tT',
          writingSystem: { tag: 'nllb' },
          texts: availableBooks
        }
      ],
      draftingSources: [
        {
          projectRef: 'draftingSource',
          paratextId: 'PT_DS',
          name: 'Drafting Source',
          shortName: 'dS',
          writingSystem: { tag: 'eng' },
          texts: availableBooks
        }
      ]
    };

    const mockTargetProjectDoc: SFProjectProfileDoc = {
      id: mockActivatedProjectService.projectId,
      data: createTestProjectProfile({
        texts: availableBooks,
        translateConfig: {
          source: { projectRef: 'sourceProject', shortName: 'sP1', writingSystem: { tag: 'eng' } },
          draftConfig: { lastSelectedTrainingDataFiles: ['file1'] }
        },
        writingSystem: { tag: 'nllb' }
      })
    } as SFProjectProfileDoc;
    const targetProjectDoc$ = new BehaviorSubject<SFProjectProfileDoc>(mockTargetProjectDoc);

    beforeEach(fakeAsync(() => {
      when(mockDraftSourceService.getDraftProjectSources()).thenReturn(of(config));
      when(mockActivatedProjectService.projectDoc$).thenReturn(targetProjectDoc$);
      when(mockActivatedProjectService.changes$).thenReturn(targetProjectDoc$);
      when(mockActivatedProjectService.projectDoc).thenReturn(mockTargetProjectDoc);
      when(mockFeatureFlagService.showDeveloperTools).thenReturn(createTestFeatureFlag(false));

      fixture = TestBed.createComponent(DraftGenerationStepsComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      tick();
    }));

    it('generates draft with training data file', () => {
      fixture.detectChanges();
      component.tryAdvanceStep();
      fixture.detectChanges();
      component.onTranslateBookSelect([3], config.draftingSources[0]);
      fixture.detectChanges();
      component.tryAdvanceStep();
      component.onTranslatedBookSelect([2]);
      fixture.detectChanges();
      component.tryAdvanceStep();

      spyOn(component.done, 'emit');
      component.tryAdvanceStep();
      fixture.detectChanges();
      component.tryAdvanceStep();
      fixture.detectChanges();
      expect(component.done.emit).toHaveBeenCalledWith({
        trainingScriptureRanges: [{ projectId: 'source1', scriptureRange: 'EXO' }],
        translationScriptureRanges: [{ projectId: 'draftingSource', scriptureRange: 'LEV' }],
        trainingDataFiles: ['file1'],
        fastTraining: false,
        useEcho: false
      });
    });
  });

  describe('confirm step', () => {
    const availableBooks = [
      { bookNum: 1 },
      { bookNum: 2 },
      { bookNum: 3 },
      { bookNum: 4 },
      { bookNum: 5 },
      { bookNum: 9 }
    ];
    const allBooks = [...availableBooks, { bookNum: 7 }, { bookNum: 8 }];
    const config = {
      trainingSources: [
        {
          projectRef: 'source1',
          shortName: 'sP1',
          writingSystem: { tag: 'eng' },
          texts: availableBooks
        },
        {
          projectRef: 'source2',
          shortName: 'sP2',
          writingSystem: { tag: 'eng' },
          texts: availableBooks
        }
      ] as [DraftSource, DraftSource],
      trainingTargets: [
        {
          projectRef: mockActivatedProjectService.projectId,
          shortName: 'tT',
          writingSystem: { tag: 'nllb' },
          texts: allBooks.filter(b => b.bookNum !== 7)
        }
      ] as [DraftSource],
      draftingSources: [
        {
          projectRef: 'draftingSource',
          shortName: 'dS',
          writingSystem: { tag: 'eng' },
          texts: availableBooks.concat({ bookNum: 7 })
        }
      ] as [DraftSource]
    };

    const mockTargetProjectDoc = {
      data: createTestProjectProfile({
        translateConfig: {
          draftConfig: {
            lastSelectedTrainingDataFiles: [],
            lastSelectedTrainingScriptureRanges: [
              { projectId: 'source1', scriptureRange: 'LEV;NUM;DEU;JOS' },
              { projectId: 'source2', scriptureRange: 'DEU;JOS;1SA' }
            ],
            lastSelectedTranslationScriptureRanges: [{ projectId: 'draftingSource', scriptureRange: 'GEN;EXO' }]
          }
        }
      })
    } as SFProjectProfileDoc;

    beforeEach(fakeAsync(() => {
      when(mockDraftSourceService.getDraftProjectSources()).thenReturn(of(config));
      when(mockActivatedProjectService.projectDoc).thenReturn(mockTargetProjectDoc);
      when(mockActivatedProjectService.projectDoc$).thenReturn(
        new BehaviorSubject<SFProjectProfileDoc>(mockTargetProjectDoc)
      );
      when(mockFeatureFlagService.showDeveloperTools).thenReturn(createTestFeatureFlag(false));

      fixture = TestBed.createComponent(DraftGenerationStepsComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      tick();
    }));

    it('should localize and concatenate the books to translate', () => {
      expect(component.selectedTranslateBooksAsString()).toEqual('Genesis and Exodus');
    });

    it('should localize, group, and collapse the books to use in training', () => {
      const trainingGroups = component.selectedTrainingBooksCollapsed();
      expect(trainingGroups.length).toEqual(2);

      expect(trainingGroups[0].ranges.length).toEqual(1);
      expect(trainingGroups[0].ranges[0]).toEqual('Leviticus - Deuteronomy');

      expect(trainingGroups[1].ranges.length).toEqual(2);
      expect(trainingGroups[1].ranges[0]).toEqual('Deuteronomy');
      expect(trainingGroups[1].ranges[1]).toEqual('1 Samuel');
    });
  });
});
