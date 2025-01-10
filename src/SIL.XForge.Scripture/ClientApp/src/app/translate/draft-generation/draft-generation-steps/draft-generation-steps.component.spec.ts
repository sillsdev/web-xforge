import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { BehaviorSubject, of } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { TrainingDataDoc } from '../../../core/models/training-data-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { ProgressService, TextProgress } from '../../../shared/progress-service/progress.service';
import { NllbLanguageService } from '../../nllb-language.service';
import { DraftSource, DraftSourcesService } from '../draft-sources.service';
import { TrainingDataService } from '../training-data/training-data.service';
import { DraftGenerationStepsComponent, DraftGenerationStepsResult } from './draft-generation-steps.component';

describe('DraftGenerationStepsComponent', () => {
  let component: DraftGenerationStepsComponent;
  let fixture: ComponentFixture<DraftGenerationStepsComponent>;

  const mockActivatedProjectService = mock(ActivatedProjectService);
  const mockActivatedRoute = mock(ActivatedRoute);
  const mockFeatureFlagService = mock(FeatureFlagService);
  const mockProjectService = mock(SFProjectService);
  const mockNllbLanguageService = mock(NllbLanguageService);
  const mockTrainingDataService = mock(TrainingDataService);
  const mockProgressService = mock(ProgressService);
  const mockOnlineStatusService = mock(OnlineStatusService);
  const mockNoticeService = mock(NoticeService);
  const mockDraftSourceService = mock(DraftSourcesService);

  const mockTrainingDataQuery: RealtimeQuery<TrainingDataDoc> = mock(RealtimeQuery);
  when(mockTrainingDataQuery.localChanges$).thenReturn(of());
  when(mockTrainingDataQuery.ready$).thenReturn(of(true));
  when(mockTrainingDataQuery.remoteChanges$).thenReturn(of());
  when(mockTrainingDataQuery.remoteDocChanges$).thenReturn(of());
  when(mockActivatedProjectService.projectId).thenReturn('project01');

  configureTestingModule(() => ({
    imports: [UICommonModule, TestTranslocoModule, NoopAnimationsModule],
    providers: [
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: DraftSourcesService, useMock: mockDraftSourceService },
      { provide: FeatureFlagService, useMock: mockFeatureFlagService },
      { provide: NllbLanguageService, useMock: mockNllbLanguageService },
      { provide: SFProjectService, useMock: mockProjectService },
      { provide: TrainingDataService, useMock: mockTrainingDataService },
      { provide: ProgressService, useMock: mockProgressService },
      { provide: ActivatedRoute, useMock: mockActivatedRoute },
      { provide: OnlineStatusService, useMock: mockOnlineStatusService },
      { provide: NoticeService, useMock: mockNoticeService }
    ]
  }));

  beforeEach(fakeAsync(() => {
    when(mockActivatedProjectService.projectId).thenReturn('project01');
    when(mockActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    when(mockProgressService.isLoaded$).thenReturn(of(true));
    when(mockProgressService.texts).thenReturn([
      { text: { bookNum: 1 } } as TextProgress,
      { text: { bookNum: 2 } } as TextProgress,
      { text: { bookNum: 3 } } as TextProgress,
      { text: { bookNum: 6 } } as TextProgress,
      { text: { bookNum: 7 } } as TextProgress
    ]);
    when(mockOnlineStatusService.isOnline).thenReturn(true);
  }));

  describe('one training source', async () => {
    const availableBooks = [{ bookNum: 1 }, { bookNum: 2 }, { bookNum: 3 }];
    const allBooks = [...availableBooks, { bookNum: 6 }, { bookNum: 7 }];
    const config = {
      trainingSources: [
        {
          projectRef: 'sourceProject',
          shortName: 'sP',
          writingSystem: { tag: 'eng' },
          texts: allBooks.filter(b => b.bookNum !== 6)
        },
        undefined
      ] as [DraftSource, DraftSource],
      trainingTargets: [
        {
          projectRef: mockActivatedProjectService.projectId,
          shortName: 'tT',
          writingSystem: { tag: 'xyz' },
          texts: allBooks.filter(b => b.bookNum !== 7)
        }
      ] as [DraftSource],
      draftingSources: [
        {
          projectRef: 'sourceProject',
          shortName: 'sP',
          writingSystem: { tag: 'eng' },
          texts: allBooks.filter(b => b.bookNum !== 6)
        }
      ] as [DraftSource]
    };
    beforeEach(fakeAsync(() => {
      when(mockDraftSourceService.getDraftProjectSources()).thenReturn(of(config));
      const mockTargetProjectDoc = {
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
      when(mockTrainingDataService.queryTrainingDataAsync(anything())).thenResolve(instance(mockTrainingDataQuery));
      when(mockTrainingDataQuery.docs).thenReturn([]);
      when(mockFeatureFlagService.allowFastTraining).thenReturn(createTestFeatureFlag(false));

      fixture = TestBed.createComponent(DraftGenerationStepsComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      tick();
      fixture.detectChanges();
    }));

    it('should set "availableTranslateBooks" correctly', fakeAsync(() => {
      expect(component.availableTranslateBooks).toEqual([
        { number: 1, selected: false },
        { number: 2, selected: false },
        { number: 3, selected: false }
      ]);
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
      component.onTranslateBookSelect([1]);
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

    it('does not allow selecting not selectable source training books', () => {
      component.onSourceTrainingBookSelect([6, 7], config.trainingSources[0]);
      fixture.detectChanges();

      expect(component.selectedTrainingBooksByProj('sourceProject')).toEqual([]);
    });
  });

  describe('additional training source', () => {
    const availableBooks = [{ bookNum: 2 }, { bookNum: 3 }];
    const allBooks = [{ bookNum: 1 }, ...availableBooks, { bookNum: 6 }, { bookNum: 7 }, { bookNum: 8 }];
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
          texts: availableBooks.concat({ bookNum: 6 })
        }
      ] as [DraftSource, DraftSource],
      trainingTargets: [
        {
          projectRef: mockActivatedProjectService.projectId,
          shortName: 'tT',
          writingSystem: { tag: 'nllb' },
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
      when(mockFeatureFlagService.allowFastTraining).thenReturn(createTestFeatureFlag(false));
      when(mockNllbLanguageService.isNllbLanguageAsync(anything())).thenResolve(true);
      when(mockNllbLanguageService.isNllbLanguageAsync('xyz')).thenResolve(false);
      when(mockTrainingDataService.queryTrainingDataAsync(anything())).thenResolve(instance(mockTrainingDataQuery));
      when(mockTrainingDataQuery.docs).thenReturn([]);

      fixture = TestBed.createComponent(DraftGenerationStepsComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      tick();
    }));

    it('should set "availableTranslateBooks" correctly and with canonical book order', fakeAsync(() => {
      expect(component.availableTranslateBooks).toEqual([
        { number: 2, selected: false },
        { number: 3, selected: false },
        { number: 7, selected: false }
      ]);
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
      unusableTranslateBooks.querySelector('.books-hidden-message')!.click();
      tick();
      fixture.detectChanges();
      expect(unusableTranslateBooks.querySelector('.explanation')).not.toBeNull();
      const unusableTrainingBooks = fixture.nativeElement.querySelector('.unusable-training-books');
      expect(unusableTrainingBooks).not.toBeNull();
      expect(unusableTrainingBooks.querySelector('.explanation')).toBeNull();
      unusableTrainingBooks.querySelector('.books-hidden-message')!.click();
      tick();
      fixture.detectChanges();
      expect(unusableTrainingBooks.querySelector('.explanation')).not.toBeNull();
    }));

    it('should show and hide selectable training source books when training books selected', fakeAsync(() => {
      component.onTranslatedBookSelect([2, 6]);
      fixture.detectChanges();

      expect(component.selectedTrainingBooksByProj('source1')).toEqual([{ number: 2, selected: true }]);
      expect(component.selectedTrainingBooksByProj('source2')).toEqual([{ number: 6, selected: true }]);
    }));

    it('should correctly emit the selected books when done', fakeAsync(() => {
      component.onTranslateBookSelect([7]);
      component.onTranslatedBookSelect([2, 3, 6]);
      component.onSourceTrainingBookSelect([2, 3], config.trainingSources[0]);
      component.onSourceTrainingBookSelect([2, 6], config.trainingSources[1]);
      fixture.detectChanges();

      spyOn(component.done, 'emit');
      fixture.detectChanges();
      clickConfirmLanguages(fixture);
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
        translationScriptureRange: 'JDG',
        fastTraining: false
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
      component.onTranslateBookSelect([7]);
      component.onTranslatedBookSelect([2, 6]);
      component.onSourceTrainingBookSelect([], config.trainingSources[0]);
      component.onSourceTrainingBookSelect([2, 6], config.trainingSources[1]);
      fixture.detectChanges();

      spyOn(component.done, 'emit');
      fixture.detectChanges();
      clickConfirmLanguages(fixture);
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
        translationScriptureRange: 'JDG',
        fastTraining: false
      } as DraftGenerationStepsResult);
      expect(component.isStepsCompleted).toBe(true);
    });
  });

  describe('allow fast training feature flag is enabled', () => {
    const availableBooks = [{ bookNum: 2 }, { bookNum: 3 }, { bookNum: 9 }, { bookNum: 10 }];
    const allBooks = [{ bookNum: 1 }, ...availableBooks, { bookNum: 6 }, { bookNum: 7 }, { bookNum: 8 }];
    const config = {
      trainingSources: [
        {
          projectRef: 'source1',
          shortName: 'sP1',
          writingSystem: { tag: 'eng' },
          texts: availableBooks.concat({ bookNum: 1 })
        },
        undefined
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

    beforeEach(fakeAsync(() => {
      when(mockDraftSourceService.getDraftProjectSources()).thenReturn(of(config));
      when(mockActivatedProjectService.projectDoc$).thenReturn(of({} as any));
      when(mockFeatureFlagService.allowFastTraining).thenReturn(createTestFeatureFlag(true));
      when(mockTrainingDataService.queryTrainingDataAsync(anything())).thenResolve(instance(mockTrainingDataQuery));
      when(mockTrainingDataQuery.docs).thenReturn([]);

      fixture = TestBed.createComponent(DraftGenerationStepsComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      tick();
    }));

    it('should emit the fast training value if checked', () => {
      component.onTranslateBookSelect([2]);
      component.onTranslatedBookSelect([3, 9, 10]);
      component.onSourceTrainingBookSelect([3, 9, 10], config.trainingSources[0]);

      spyOn(component.done, 'emit');

      fixture.detectChanges();
      clickConfirmLanguages(fixture);
      const step = fixture.debugElement.queryAll(By.css('mat-step-header'));
      step[3].nativeElement.click(); //click the next step
      fixture.detectChanges();
      component.tryAdvanceStep();

      // Tick the checkbox
      const fastTrainingCheckbox = fixture.nativeElement.querySelector('mat-checkbox.fast-training input');
      fastTrainingCheckbox.click();

      // Click next on the final step to generate the draft
      fixture.detectChanges();
      const generateDraftButton: HTMLElement = fixture.nativeElement.querySelector('.advance-button');
      expect(generateDraftButton['disabled']).toBe(false);
      component.tryAdvanceStep();
      fixture.detectChanges();

      expect(component.done.emit).toHaveBeenCalledWith({
        trainingDataFiles: [],
        trainingScriptureRanges: [{ projectId: 'source1', scriptureRange: 'LEV;1SA;2SA' }],
        translationScriptureRange: 'EXO',
        fastTraining: true
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
      data: createTestProjectProfile({
        texts: [{ bookNum: 1 }, { bookNum: 2 }, { bookNum: 3 }],
        translateConfig: {
          draftConfig: {
            lastSelectedTrainingDataFiles: [],
            lastSelectedTranslationScriptureRange: 'EXO;LEV',
            lastSelectedTrainingScriptureRanges: [
              { projectId: 'source1', scriptureRange: 'GEN;1SA' },
              { projectId: 'source2', scriptureRange: '1SA;2SA' }
            ]
          }
        }
      })
    } as SFProjectProfileDoc;

    beforeEach(fakeAsync(() => {
      when(mockDraftSourceService.getDraftProjectSources()).thenReturn(of(config));
      when(mockActivatedProjectService.projectDoc).thenReturn(mockTargetProjectDoc);
      when(mockActivatedProjectService.projectDoc$).thenReturn(of(mockTargetProjectDoc));
      when(mockTrainingDataService.queryTrainingDataAsync(anything())).thenResolve(instance(mockTrainingDataQuery));
      when(mockTrainingDataQuery.docs).thenReturn([]);

      fixture = TestBed.createComponent(DraftGenerationStepsComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      tick();
    }));

    it('should restore previously selected ranges', () => {
      expect(component.selectedTranslateBooks()).toEqual('Exodus and Leviticus');
      expect(component.booksToTranslate()).toEqual([
        { number: 2, selected: true },
        { number: 3, selected: true }
      ]);
      expect(component.selectedTrainingBooksByProj('project01')).toEqual([
        { number: 9, selected: true },
        { number: 10, selected: true }
      ]);
      expect(component.selectedTrainingBooksByProj('source1')).toEqual([{ number: 9, selected: true }]);
      expect(component.selectedTrainingBooksByProj('source2')).toEqual([
        { number: 9, selected: true },
        { number: 10, selected: true }
      ]);
    });
  });

  fdescribe('confirm step', () => {
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
            lastSelectedTranslationScriptureRange: 'GEN;EXO',
            lastSelectedTrainingScriptureRanges: [
              { projectId: 'source1', scriptureRange: 'LEV;NUM;DEU;JOS' },
              { projectId: 'source2', scriptureRange: 'DEU;JOS;1SA' }
            ]
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
      when(mockTrainingDataService.queryTrainingDataAsync(anything())).thenResolve(instance(mockTrainingDataQuery));
      when(mockTrainingDataQuery.docs).thenReturn([]);
      when(mockFeatureFlagService.allowFastTraining).thenReturn(createTestFeatureFlag(false));

      fixture = TestBed.createComponent(DraftGenerationStepsComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      tick();
    }));

    it('should localize and concatenate the books to translate', () => {
      expect(component.selectedTranslateBooks()).toEqual('Genesis and Exodus');
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

  function clickConfirmLanguages(fixture: ComponentFixture<DraftGenerationStepsComponent>): void {
    const notice: DebugElement = fixture.debugElement.query(By.css('app-notice'));
    const checkboxDebug = notice.query(By.css('input[type="checkbox"]'));
    const checkbox = checkboxDebug.nativeElement as HTMLInputElement;
    checkbox.click();
    fixture.detectChanges();
  }
});
