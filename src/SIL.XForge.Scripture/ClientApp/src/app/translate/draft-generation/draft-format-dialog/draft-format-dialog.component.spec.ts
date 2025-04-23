import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DraftFormatDialogComponent } from './draft-format-dialog.component';

describe('DraftFormatDialogComponent', () => {
  let component: DraftFormatDialogComponent;
  let fixture: ComponentFixture<DraftFormatDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DraftFormatDialogComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DraftFormatDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
