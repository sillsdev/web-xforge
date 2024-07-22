import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditorInsightsPanelHeaderComponent } from './editor-insights-panel-header.component';

describe('EditorInsightsPanelHeaderComponent', () => {
  let component: EditorInsightsPanelHeaderComponent;
  let fixture: ComponentFixture<EditorInsightsPanelHeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorInsightsPanelHeaderComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(EditorInsightsPanelHeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
