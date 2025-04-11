import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LynxInsightStatusIndicatorComponent } from './lynx-insight-status-indicator.component';

describe('LynxInsightStatusIndicatorComponent', () => {
  let component: LynxInsightStatusIndicatorComponent;
  let fixture: ComponentFixture<LynxInsightStatusIndicatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LynxInsightStatusIndicatorComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(LynxInsightStatusIndicatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
});
