import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LynxInsightsPanelHeaderComponent } from './lynx-insights-panel-header.component';

describe('LynxInsightsPanelHeaderComponent', () => {
  let component: LynxInsightsPanelHeaderComponent;
  let fixture: ComponentFixture<LynxInsightsPanelHeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LynxInsightsPanelHeaderComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(LynxInsightsPanelHeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
});
