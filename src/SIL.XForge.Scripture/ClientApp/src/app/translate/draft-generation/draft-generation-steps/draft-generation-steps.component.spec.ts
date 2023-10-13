import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatMenuModule } from '@angular/material/menu';
import { MatStepperModule } from '@angular/material/stepper';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { DraftGenerationStepsComponent, DraftGenerationStepsResult } from './draft-generation-steps.component';

describe('DraftGenerationStepsComponent', () => {
  let component: DraftGenerationStepsComponent;
  let fixture: ComponentFixture<DraftGenerationStepsComponent>;

  const mockActivatedProjectService = mock(ActivatedProjectService);
  const mockProjectDoc = { data: { texts: [{ bookNum: 1 }, { bookNum: 2 }, { bookNum: 3 }] } } as SFProjectProfileDoc;

  configureTestingModule(() => ({
    imports: [MatStepperModule, MatMenuModule, NoopAnimationsModule],
    declarations: [DraftGenerationStepsComponent],
    providers: [{ provide: ActivatedProjectService, useMock: mockActivatedProjectService }]
  }));

  beforeEach(() => {
    when(mockActivatedProjectService.projectDoc$).thenReturn(of(mockProjectDoc));

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
