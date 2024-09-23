import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DiagnosticDialogComponent } from './diagnostic-overlay.component';

describe('DiagnosticDialogComponent', () => {
  let component: DiagnosticDialogComponent;
  let fixture: ComponentFixture<DiagnosticDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DiagnosticDialogComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DiagnosticDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
