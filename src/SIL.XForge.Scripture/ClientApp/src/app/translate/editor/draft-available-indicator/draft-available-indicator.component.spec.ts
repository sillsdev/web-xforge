import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DraftAvailableIndicatorComponent } from './draft-available-indicator.component';

describe('DraftAvailableIndicatorComponent', () => {
  let component: DraftAvailableIndicatorComponent;
  let fixture: ComponentFixture<DraftAvailableIndicatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DraftAvailableIndicatorComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DraftAvailableIndicatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
