import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DraftHistoryEntryComponent } from './draft-history-entry.component';

describe('DraftHistoryEntryComponent', () => {
  let component: DraftHistoryEntryComponent;
  let fixture: ComponentFixture<DraftHistoryEntryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DraftHistoryEntryComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DraftHistoryEntryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
