import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DraftHistoryListComponent } from './draft-history.component';

describe('DraftHistoryComponent', () => {
  let component: DraftHistoryListComponent;
  let fixture: ComponentFixture<DraftHistoryListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DraftHistoryListComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DraftHistoryListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
