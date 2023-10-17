import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatMenuModule } from '@angular/material/menu';
import { MatStepperModule } from '@angular/material/stepper';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
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
      translateConfig: {
        source: { projectRef: 'test' }
      }
    }
  } as SFProjectProfileDoc;
  const mockSourceProjectDoc = {
    data: {
      texts: [{ bookNum: 1 }, { bookNum: 2 }, { bookNum: 3 }]
    }
  } as SFProjectProfileDoc;

  configureTestingModule(() => ({
    imports: [MatStepperModule, MatMenuModule, TestTranslocoModule, NoopAnimationsModule],
    declarations: [DraftGenerationStepsComponent],
    providers: [
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: SFProjectService, useMock: mockProjectService }
    ]
  }));

  beforeEach(() => {
    when(mockActivatedProjectService.projectDoc$).thenReturn(of(mockTargetProjectDoc));
    when(mockProjectService.getProfile(anything())).thenResolve(mockSourceProjectDoc);

    fixture = TestBed.createComponent(DraftGenerationStepsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should set availableBooks$ correctly', () => {
    component.availableBooks$?.subscribe(books => {
      expect(books).toEqual([1, 2, 3]);
    });
  });

  it('should select all books initially', () => {
    component.availableBooks$?.subscribe(() => {
      expect(component.selectedBooks).toEqual([1, 2, 3]);
    });
  });

  it('should emit the correct selected books when onDone is called', () => {
    const mockSelectedBooks = [1, 2, 3];
    component.selectedBooks = mockSelectedBooks;

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
