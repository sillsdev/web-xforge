import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
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
    data: {
      texts: [{ bookNum: 1 }, { bookNum: 2 }, { bookNum: 3 }],
      translateConfig: {
        source: { projectRef: 'test' },
        draftConfig: {}
      }
    }
  } as SFProjectProfileDoc;
  const mockSourceProjectDoc = {
    data: {
      texts: [{ bookNum: 1 }, { bookNum: 2 }, { bookNum: 3 }, { bookNum: 4 }]
    }
  } as SFProjectProfileDoc;

  configureTestingModule(() => ({
    imports: [UICommonModule, TestTranslocoModule, NoopAnimationsModule],
    providers: [
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: SFProjectService, useMock: mockProjectService }
    ]
  }));

  describe('no previously selected books', () => {
    beforeEach(fakeAsync(() => {
      when(mockActivatedProjectService.projectDoc).thenReturn(mockTargetProjectDoc);
      when(mockActivatedProjectService.projectDoc$).thenReturn(of(mockTargetProjectDoc));
      when(mockProjectService.getProfile(anything())).thenResolve(mockSourceProjectDoc);

      fixture = TestBed.createComponent(DraftGenerationStepsComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      tick();
    }));

    it('should set availableBooks$ correctly', fakeAsync(() => {
      component.availableBooks$?.subscribe(books => {
        expect(books).toEqual([1, 2, 3]);
      });
    }));

    it('should select all books initially', () => {
      expect(component.initialSelectedBooks).toEqual([1, 2, 3]);
      expect(component.finalSelectedBooks).toEqual([1, 2, 3]);
    });

    it('should emit the correct selected books when onDone is called', () => {
      const mockSelectedBooks = [1, 2, 3];
      component.finalSelectedBooks = mockSelectedBooks;

      spyOn(component.done, 'emit');

      component.onDone();

      expect(component.done.emit).toHaveBeenCalledWith({ books: mockSelectedBooks } as DraftGenerationStepsResult);
    });

    it('should emit the correct selected books when onBookSelect is called', () => {
      const mockSelectedBooks = [1, 2, 3];

      spyOn(component, 'onBookSelect');

      const bookMultiSelect = fixture.debugElement.query(By.css('app-book-multi-select'));
      bookMultiSelect.triggerEventHandler('bookSelect', mockSelectedBooks);

      expect(component.onBookSelect).toHaveBeenCalledWith(mockSelectedBooks);
    });
  });

  describe('target contains previously selected books', () => {
    const mockTargetProjectDoc = {
      data: {
        texts: [{ bookNum: 1 }, { bookNum: 2 }, { bookNum: 3 }],
        translateConfig: {
          source: { projectRef: 'test' },
          draftConfig: { lastSelectedBooks: [2, 3, 4] }
        }
      }
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
      expect(component.initialSelectedBooks).toEqual([2, 3]);
    });
  });
});
