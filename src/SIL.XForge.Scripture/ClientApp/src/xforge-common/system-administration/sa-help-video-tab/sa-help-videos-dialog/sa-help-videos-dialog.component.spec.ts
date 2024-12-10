import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SaHelpVideosDialogComponent } from './sa-help-videos-dialog.component';

describe('SaHelpVideosDialogComponent', () => {
  let component: SaHelpVideosDialogComponent;
  let fixture: ComponentFixture<SaHelpVideosDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaHelpVideosDialogComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(SaHelpVideosDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
