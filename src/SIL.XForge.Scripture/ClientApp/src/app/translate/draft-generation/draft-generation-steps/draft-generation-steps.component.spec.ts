import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { BehaviorSubject, of } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { environment } from '../../../../environments/environment';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { TrainingDataDoc } from '../../../core/models/training-data-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { ProgressService, TextProgress } from '../../../shared/progress-service/progress.service';
import { NllbLanguageService } from '../../nllb-language.service';
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
  const mockUserService = mock(UserService);
  const mockProgressService = mock(ProgressService);
  const mockOnlineStatusService = mock(OnlineStatusService);
  const mockNoticeService = mock(NoticeService);
  const mockI18nService = mock(I18nService);

  const mockTargetProjectDoc = {
    data: createTestProjectProfile({
      // Include an 'extra material' book (100) that should be excluded
      texts: [{ bookNum: 2 }, { bookNum: 1 }, { bookNum: 3 }, { bookNum: 6 }, { bookNum: 7 }, { bookNum: 100 }],
      writingSystem: { tag: 'eng' },
      translateConfig: {
        source: {
          projectRef: 'test',
          shortName: 'TEST',
          writingSystem: { tag: 'eng' }
        }
      }
    })
  } as SFProjectProfileDoc;

  const mockSourceNonNllbProjectDoc = {
    data: createTestProjectProfile({
      texts: [{ bookNum: 1 }, { bookNum: 2 }, { bookNum: 3 }, { bookNum: 4 }, { bookNum: 5 }, { bookNum: 100 }],
      writingSystem: { tag: 'xyz' }
    })
  } as SFProjectProfileDoc;

  const mockSourceNllbProjectDoc = {
    data: {
      ...mockSourceNonNllbProjectDoc.data,
      writingSystem: { tag: 'spa' }
    }
  } as SFProjectProfileDoc;

  const mockAlternateTrainingSourceProjectDoc = {
    data: createTestProjectProfile({
      texts: [{ bookNum: 2 }, { bookNum: 3 }, { bookNum: 4 }, { bookNum: 5 }, { bookNum: 8 }, { bookNum: 100 }],
      writingSystem: { tag: 'xyz' }
    })
  } as SFProjectProfileDoc;

  const mockUserDoc = {
    data: createTestUser({
      sites: { [environment.siteId]: { projects: ['alternateTrainingProject', 'sourceProject', 'test'] } }
    })
  } as UserDoc;

  const mockTrainingDataQuery: RealtimeQuery<TrainingDataDoc> = mock(RealtimeQuery);
  when(mockTrainingDataQuery.localChanges$).thenReturn(of());
  when(mockTrainingDataQuery.ready$).thenReturn(of(true));
  when(mockTrainingDataQuery.remoteChanges$).thenReturn(of());
  when(mockTrainingDataQuery.remoteDocChanges$).thenReturn(of());

  const targetProjectDoc$ = new BehaviorSubject<SFProjectProfileDoc>(mockTargetProjectDoc);

  configureTestingModule(() => ({
    imports: [UICommonModule, TestTranslocoModule, NoopAnimationsModule],
    providers: [
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: FeatureFlagService, useMock: mockFeatureFlagService },
      { provide: NllbLanguageService, useMock: mockNllbLanguageService },
      { provide: SFProjectService, useMock: mockProjectService },
      { provide: TrainingDataService, useMock: mockTrainingDataService },
      { provide: UserService, useMock: mockUserService },
      { provide: ProgressService, useMock: mockProgressService },
      { provide: ActivatedRoute, useMock: mockActivatedRoute },
      { provide: OnlineStatusService, useMock: mockOnlineStatusService },
      { provide: NoticeService, useMock: mockNoticeService },
      { provide: I18nService, useMock: mockI18nService }
    ]
  }));

  beforeEach(fakeAsync(() => {
    when(mockUserService.getCurrentUser()).thenResolve(mockUserDoc);
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
    when(mockI18nService.localeCode).thenReturn('en');
  }));

  describe('alternate training source project', async () => {
    beforeEach(fakeAsync(() => {
      const mockTargetProjectDoc = {
        data: createTestProjectProfile({
          texts: [{ bookNum: 1 }, { bookNum: 2 }, { bookNum: 3 }, { bookNum: 6 }, { bookNum: 7 }],
          translateConfig: {
            source: { projectRef: 'sourceProject', writingSystem: { tag: 'xyz' } },
            draftConfig: {
              alternateTrainingSourceEnabled: true,
              alternateTrainingSource: { projectRef: 'alternateTrainingProject', writingSystem: { tag: 'xyz' } }
            }
          },
          writingSystem: { tag: 'eng' }
        })
      } as SFProjectProfileDoc;
      const targetProjectDoc$ = new BehaviorSubject<SFProjectProfileDoc>(mockTargetProjectDoc);

      when(mockActivatedProjectService.projectDoc).thenReturn(mockTargetProjectDoc);
      when(mockActivatedProjectService.projectDoc$).thenReturn(targetProjectDoc$);
      when(mockProjectService.getProfile('sourceProject')).thenResolve(mockSourceNonNllbProjectDoc);
      when(mockProjectService.getProfile('alternateTrainingProject')).thenResolve(
        mockAlternateTrainingSourceProjectDoc
      );
      when(mockTrainingDataService.queryTrainingDataAsync(anything())).thenResolve(instance(mockTrainingDataQuery));
      when(mockTrainingDataQuery.docs).thenReturn([]);
      when(mockFeatureFlagService.allowFastTraining).thenReturn(createTestFeatureFlag(true));

      fixture = TestBed.createComponent(DraftGenerationStepsComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      tick();
      fixture.detectChanges();
    }));

    it('should set "availableTranslateBooks" correctly', fakeAsync(() => {
      expect(component.availableTranslateBooks).toEqual([1, 2, 3]);
    }));

    it('should set "availableTrainingBooks" correctly', fakeAsync(() => {
      expect(component.availableTrainingBooks).toEqual([2, 3]);
    }));

    it('should set "unusableTranslateSourceBooks" and "unusableTrainingSourceBooks" correctly', fakeAsync(() => {
      expect(component.unusableTranslateSourceBooks).toEqual([6, 7]);
      expect(component.unusableTrainingSourceBooks).toEqual([1, 6, 7]);
    }));

    it('should set "unusableTranslateTargetBooks" and "unusableTrainingTargetBooks" correctly', fakeAsync(() => {
      expect(component.unusableTranslateTargetBooks).toEqual([4, 5]);
      expect(component.unusableTrainingTargetBooks).toEqual([4, 5, 8]);
    }));

    it('should not advance steps if user is offline', fakeAsync(() => {
      expect(component.stepper.selectedIndex).toBe(0);
      when(mockOnlineStatusService.isOnline).thenReturn(false);
      component.tryAdvanceStep();
      tick();
      fixture.detectChanges();
      verify(mockNoticeService.show(anything())).once();
      expect(component.stepper.selectedIndex).toBe(0);
    }));
  });

  describe('NO alternate training source project', () => {
    beforeEach(fakeAsync(() => {
      when(mockActivatedProjectService.projectDoc).thenReturn(mockTargetProjectDoc);
      when(mockActivatedProjectService.projectDoc$).thenReturn(targetProjectDoc$);
      when(mockFeatureFlagService.allowFastTraining).thenReturn(createTestFeatureFlag(false));
      when(mockProjectService.getProfile(anything())).thenResolve(mockSourceNonNllbProjectDoc);
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
      expect(component.availableTranslateBooks).toEqual([1, 2, 3]);
    }));

    it('should set "availableTrainingBooks" correctly and with canonical book order', fakeAsync(() => {
      expect(component.availableTrainingBooks).toEqual([1, 2, 3]);
    }));

    it('should set "unusableTranslateSourceBooks" and "unusableTrainingSourceBooks" correctly', fakeAsync(() => {
      tick();
      fixture.detectChanges();
      expect(component.unusableTranslateSourceBooks).toEqual([6, 7]);
      expect(component.unusableTrainingSourceBooks).toEqual([6, 7]);

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

    it('should set "unusableTranslateTargetBooks" and "unusableTrainingTargetBooks" correctly', fakeAsync(() => {
      expect(component.unusableTranslateTargetBooks).toEqual([4, 5]);
      expect(component.unusableTrainingTargetBooks).toEqual([4, 5]);
    }));

    it('should select no books initially', () => {
      expect(component.initialSelectedTrainingBooks).toEqual([]);
      expect(component.userSelectedTrainingBooks).toEqual([]);
      expect(component.initialSelectedTranslateBooks).toEqual([]);
      expect(component.userSelectedTranslateBooks).toEqual([]);
    });

    it('should emit the correct selected books when done', () => {
      const trainingBooks = [2, 3];
      const trainingDataFiles: string[] = [];
      const translationBooks = [1, 2];

      component.userSelectedTrainingBooks = trainingBooks;
      component.userSelectedTranslateBooks = translationBooks;
      component.selectedTrainingDataIds = trainingDataFiles;

      spyOn(component.done, 'emit');
      expect(component.isStepsCompleted).toBe(false);
      fixture.detectChanges();

      clickConfirmLanguages(fixture);
      const test = fixture.debugElement.queryAll(By.css('mat-step-header'));
      test[2].nativeElement.click(); //click the last step
      fixture.detectChanges();

      const generateDraftButton: HTMLElement = fixture.nativeElement.querySelector('.advance-button');
      expect(generateDraftButton['disabled']).toBe(false);
      component.tryAdvanceStep();
      fixture.detectChanges();

      expect(component.done.emit).toHaveBeenCalledWith({
        translationBooks,
        trainingDataFiles,
        trainingBooks: trainingBooks.filter(book => !translationBooks.includes(book)),
        fastTraining: false
      } as DraftGenerationStepsResult);
      expect(component.isStepsCompleted).toBe(true);
      expect(generateDraftButton['disabled']).toBe(true);
    });

    it('should emit the correct selected books when bookSelect is called', fakeAsync(() => {
      const mockSelectedBooks = [1, 2, 3];

      spyOn(component, 'onTrainingBookSelect');
      spyOn(component, 'onTranslateBookSelect');

      fixture.detectChanges();
      const translateBooks = fixture.debugElement.query(
        By.css('app-book-multi-select[data-test-id="draft-stepper-translate-books"]')
      );
      const trainingBooks = fixture.debugElement.query(
        By.css('app-book-multi-select[data-test-id="draft-stepper-training-books"]')
      );

      translateBooks.triggerEventHandler('bookSelect', mockSelectedBooks);
      expect(component.onTranslateBookSelect).toHaveBeenCalledWith(mockSelectedBooks);

      trainingBooks.triggerEventHandler('bookSelect', mockSelectedBooks);
      expect(component.onTrainingBookSelect).toHaveBeenCalledWith(mockSelectedBooks);
    }));

    it('should set "isTrainingOptional == false" when either target or source are not in NLLB', fakeAsync(() => {
      expect(component.isTrainingOptional).toBe(false);
    }));

    it('should set "isTrainingOptional == true" when target and source are both in NLLB', fakeAsync(() => {
      when(mockProjectService.getProfile(anything())).thenResolve(mockSourceNllbProjectDoc);
      targetProjectDoc$.next(mockTargetProjectDoc); // Trigger re-init on project changes
      tick();
      expect(component.isTrainingOptional).toBe(true);
    }));

    it('should update training books when a step changes', fakeAsync(() => {
      component.userSelectedTranslateBooks = [3, 4]; //complete the first step
      fixture.detectChanges();
      spyOn(component, 'updateTrainingBooks');

      clickConfirmLanguages(fixture);
      const test = fixture.debugElement.queryAll(By.css('mat-step-header'));
      test[2].nativeElement.click(); //click the next step
      fixture.detectChanges();

      expect(component.updateTrainingBooks).toHaveBeenCalledTimes(1);
    }));

    it('should only navigate to next step if language codes are verified', fakeAsync(() => {
      fixture.detectChanges();
      expect(component.stepper.selectedIndex).toBe(0);

      component.tryAdvanceStep();
      fixture.detectChanges();
      expect(component.stepper.selectedIndex).toBe(0);

      clickConfirmLanguages(fixture);
      component.tryAdvanceStep();
      fixture.detectChanges();
      expect(component.stepper.selectedIndex).toBe(1);
    }));
  });

  describe('allow fast training feature flag is enabled', () => {
    beforeEach(fakeAsync(() => {
      when(mockActivatedProjectService.projectDoc).thenReturn(mockTargetProjectDoc);
      when(mockActivatedProjectService.projectDoc$).thenReturn(targetProjectDoc$);
      when(mockFeatureFlagService.allowFastTraining).thenReturn(createTestFeatureFlag(true));
      when(mockProjectService.getProfile(anything())).thenResolve(mockSourceNonNllbProjectDoc);
      when(mockTrainingDataService.queryTrainingDataAsync(anything())).thenResolve(instance(mockTrainingDataQuery));
      when(mockTrainingDataQuery.docs).thenReturn([]);

      fixture = TestBed.createComponent(DraftGenerationStepsComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      tick();
    }));

    it('should emit the fast training value if checked', () => {
      const trainingBooks = [1, 2];
      const trainingDataFiles: string[] = [];
      const translationBooks = [3, 4];

      component.userSelectedTrainingBooks = trainingBooks;
      component.userSelectedTranslateBooks = translationBooks;
      component.selectedTrainingDataIds = trainingDataFiles;

      spyOn(component.done, 'emit');

      fixture.detectChanges();
      clickConfirmLanguages(fixture);
      const test = fixture.debugElement.queryAll(By.css('mat-step-header'));
      test[3].nativeElement.click(); //click the next step
      fixture.detectChanges();

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
        trainingBooks,
        trainingDataFiles,
        translationBooks,
        fastTraining: true
      } as DraftGenerationStepsResult);
      expect(generateDraftButton['disabled']).toBe(true);
    });
  });

  describe('target contains previously selected books', () => {
    const mockTargetProjectDoc = {
      data: createTestProjectProfile({
        texts: [{ bookNum: 1 }, { bookNum: 2 }, { bookNum: 3 }],
        translateConfig: {
          source: { projectRef: 'test' },
          draftConfig: {
            lastSelectedTrainingBooks: [2, 3, 4],
            lastSelectedTrainingDataFiles: [],
            lastSelectedTranslationBooks: [2, 3, 4]
          }
        }
      })
    } as SFProjectProfileDoc;

    beforeEach(fakeAsync(() => {
      when(mockActivatedProjectService.projectDoc).thenReturn(mockTargetProjectDoc);
      when(mockActivatedProjectService.projectDoc$).thenReturn(targetProjectDoc$);
      when(mockProjectService.getProfile(anything())).thenResolve(mockSourceNonNllbProjectDoc);
      when(mockTrainingDataService.queryTrainingDataAsync(anything())).thenResolve(instance(mockTrainingDataQuery));
      when(mockTrainingDataQuery.docs).thenReturn([]);

      fixture = TestBed.createComponent(DraftGenerationStepsComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      tick();
    }));

    it('should restore previously selected books', () => {
      expect(component.initialSelectedTrainingBooks).toEqual([2, 3]);
      expect(component.initialSelectedTranslateBooks).toEqual([2, 3]);
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
