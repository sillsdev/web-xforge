import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LynxInsightScrollPositionIndicatorComponent } from './lynx-insight-scroll-position-indicator.component';

describe('LynxInsightScrollPositionIndicatorComponent', () => {
  let component: LynxInsightScrollPositionIndicatorComponent;
  let fixture: ComponentFixture<LynxInsightScrollPositionIndicatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LynxInsightScrollPositionIndicatorComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(LynxInsightScrollPositionIndicatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
});
