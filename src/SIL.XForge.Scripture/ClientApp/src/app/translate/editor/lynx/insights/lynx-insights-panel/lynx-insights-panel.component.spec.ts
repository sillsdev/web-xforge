import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LynxInsightsPanelComponent } from './lynx-insights-panel.component';

describe('LynxInsightsPanelComponent', () => {
  let component: LynxInsightsPanelComponent;
  let fixture: ComponentFixture<LynxInsightsPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LynxInsightsPanelComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(LynxInsightsPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
});
