import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DraftSuggestionsComponent } from './draft-suggestions.component';

describe('DraftSuggestionsComponent', () => {
  let component: DraftSuggestionsComponent;
  let fixture: ComponentFixture<DraftSuggestionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DraftSuggestionsComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DraftSuggestionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
