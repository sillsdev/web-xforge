import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditorInsightScrollPositionIndicatorComponent } from './editor-insight-scroll-position-indicator.component';

describe('EditorInsightScrollPositionIndicatorComponent', () => {
  let component: EditorInsightScrollPositionIndicatorComponent;
  let fixture: ComponentFixture<EditorInsightScrollPositionIndicatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorInsightScrollPositionIndicatorComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(EditorInsightScrollPositionIndicatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
