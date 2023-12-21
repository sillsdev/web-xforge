import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { DraftGenerationStepsComponent, DraftGenerationStepsResult } from './draft-generation-steps.component';

describe('DraftGenerationStepsComponent', () => {
  let component: DraftGenerationStepsComponent;
  let fixture: ComponentFixture<DraftGenerationStepsComponent>;

  const mockActivatedProjectService = mock(ActivatedProjectService);
  const mockProjectService = mock(SFProjectService);

  const mockTargetProjectDoc = {
    data: createTestProjectProfile({
      texts: [{ bookNum: 2 }, { bookNum: 1 }, { bookNum: 3 }, { bookNum: 6 }, { bookNum: 7 }],
      translateConfig: {
        source: { projectRef: 'test' },
        draftConfig: {}
      }
    })
  } as SFProjectProfileDoc;

  const mockSourceProjectDoc = {
    data: createTestProjectProfile({
      texts: [{ bookNum: 1 }, { bookNum: 2 }, { bookNum: 3 }, { bookNum: 4 }, { bookNum: 5 }]
    })
  } as SFProjectProfileDoc;

  const mockAlternateTrainingSourceProjectDoc = {
    data: createTestProjectProfile({
      texts: [{ bookNum: 2 }, { bookNum: 3 }, { bookNum: 4 }, { bookNum: 5 }, { bookNum: 8 }]
    })
  } as SFProjectProfileDoc;

  configureTestingModule(() => ({
    imports: [UICommonModule, TestTranslocoModule, NoopAnimationsModule],
    providers: [
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: SFProjectService, useMock: mockProjectService }
    ]
  }));

  describe('alternate training source project', () => {
    beforeEach(fakeAsync(() => {
      const mockTargetProjectDoc = {
        data: createTestProjectProfile({
          texts: [{ bookNum: 1 }, { bookNum: 2 }, { bookNum: 3 }, { bookNum: 6 }, { bookNum: 7 }],
          translateConfig: {
            source: { projectRef: 'sourceProject' },
            draftConfig: {
              alternateTrainingSourceEnabled: true,
              alternateTrainingSource: { projectRef: 'alternateTrainingProject' }
            }
          }
        })
      } as SFProjectProfileDoc;

      when(mockActivatedProjectService.projectDoc).thenReturn(mockTargetProjectDoc);
      when(mockActivatedProjectService.projectDoc$).thenReturn(of(mockTargetProjectDoc));
      when(mockProjectService.getProfile('sourceProject')).thenResolve(mockSourceProjectDoc);
      when(mockProjectService.getProfile('alternateTrainingProject')).thenResolve(
        mockAlternateTrainingSourceProjectDoc
      );

      fixture = TestBed.createComponent(DraftGenerationStepsComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      tick();
    }));

    it('should set "availableTranslateBooks" correctly', fakeAsync(() => {
      expect(component.availableTranslateBooks).toEqual([1, 2, 3]);
    }));

    it('should set "availableTrainingBooks" correctly', fakeAsync(() => {
      expect(component.availableTrainingBooks).toEqual([2, 3]);
    }));

    it('should set "unusableTranslateBooks" and "unusableTrainingBooks" correctly', fakeAsync(() => {
      expect(component.unusableTranslateBooks).toEqual([6, 7]);
      expect(component.unusableTrainingBooks).toEqual([1, 6, 7]);
    }));
  });

  describe('NO alternate training source project', () => {
    beforeEach(fakeAsync(() => {
      when(mockActivatedProjectService.projectDoc).thenReturn(mockTargetProjectDoc);
      when(mockActivatedProjectService.projectDoc$).thenReturn(of(mockTargetProjectDoc));
      when(mockProjectService.getProfile(anything())).thenResolve(mockSourceProjectDoc);

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

    it('should set "unusableTranslateBooks" and "unusableTrainingBooks" correctly', fakeAsync(() => {
      expect(component.unusableTranslateBooks).toEqual([6, 7]);
      expect(component.unusableTrainingBooks).toEqual([6, 7]);
    }));

    it('should select no books initially', () => {
      expect(component.initialSelectedTrainingBooks).toEqual([]);
      expect(component.userSelectedTrainingBooks).toEqual([]);
      expect(component.initialSelectedTranslateBooks).toEqual([]);
      expect(component.userSelectedTranslateBooks).toEqual([]);
    });

    it('should emit the correct selected books when done', () => {
      const trainingBooks = [2, 3];
      const translationBooks = [1, 2];

      component.userSelectedTrainingBooks = trainingBooks;
      component.userSelectedTranslateBooks = translationBooks;

      spyOn(component.done, 'emit');

      // Advance to the next step when at last step should emit books result
      fixture.detectChanges();
      component.tryAdvanceStep();
      fixture.detectChanges();
      component.tryAdvanceStep();

      expect(component.done.emit).toHaveBeenCalledWith({
        translationBooks,
        trainingBooks: trainingBooks.filter(book => !translationBooks.includes(book))
      } as DraftGenerationStepsResult);
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
  });

  describe('target contains previously selected books', () => {
    const mockTargetProjectDoc = {
      data: createTestProjectProfile({
        texts: [{ bookNum: 1 }, { bookNum: 2 }, { bookNum: 3 }],
        translateConfig: {
          source: { projectRef: 'test' },
          draftConfig: {
            lastSelectedTrainingBooks: [2, 3, 4],
            lastSelectedTranslationBooks: [2, 3, 4]
          }
        }
      })
    } as SFProjectProfileDoc;

    beforeEach(fakeAsync(() => {
      when(mockActivatedProjectService.projectDoc).thenReturn(mockTargetProjectDoc);
      when(mockActivatedProjectService.projectDoc$).thenReturn(of(mockTargetProjectDoc));
      when(mockProjectService.getProfile(anything())).thenResolve(mockSourceProjectDoc);

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
});
