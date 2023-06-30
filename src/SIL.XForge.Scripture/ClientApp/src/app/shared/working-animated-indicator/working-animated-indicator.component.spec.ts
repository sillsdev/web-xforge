import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkingAnimatedIndicatorComponent } from './working-animated-indicator.component';

describe('WorkingAnimatedIndicatorComponent', () => {
  let component: WorkingAnimatedIndicatorComponent;
  let fixture: ComponentFixture<WorkingAnimatedIndicatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [WorkingAnimatedIndicatorComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(WorkingAnimatedIndicatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
