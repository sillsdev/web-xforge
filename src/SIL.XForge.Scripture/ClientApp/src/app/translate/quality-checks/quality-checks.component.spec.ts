import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QualityChecksComponent } from './quality-checks.component';

describe('QualityChecksComponent', () => {
  let component: QualityChecksComponent;
  let fixture: ComponentFixture<QualityChecksComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [QualityChecksComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(QualityChecksComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
