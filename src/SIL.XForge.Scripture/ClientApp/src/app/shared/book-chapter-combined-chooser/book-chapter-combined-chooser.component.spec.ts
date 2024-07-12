import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BookChapterCombinedChooserComponent } from './book-chapter-combined-chooser.component';

describe('BookChapterCombinedChooserComponent', () => {
  let component: BookChapterCombinedChooserComponent;
  let fixture: ComponentFixture<BookChapterCombinedChooserComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookChapterCombinedChooserComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(BookChapterCombinedChooserComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
