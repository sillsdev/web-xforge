import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditorInsightStatusIndicatorComponent } from './editor-insight-status-indicator.component';

describe('EditorInsightStatusIndicatorComponent', () => {
  let component: EditorInsightStatusIndicatorComponent;
  let fixture: ComponentFixture<EditorInsightStatusIndicatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorInsightStatusIndicatorComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(EditorInsightStatusIndicatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
