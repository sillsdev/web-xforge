import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditorInsightsPanelComponent } from './editor-insights-panel.component';

describe('EditorInsightsPanelComponent', () => {
  let component: EditorInsightsPanelComponent;
  let fixture: ComponentFixture<EditorInsightsPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorInsightsPanelComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(EditorInsightsPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
