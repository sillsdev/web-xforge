import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditorInsightOverlayComponent } from './editor-insight-overlay.component';

describe('EditorInsightOverlayComponent', () => {
  let component: EditorInsightOverlayComponent;
  let fixture: ComponentFixture<EditorInsightOverlayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorInsightOverlayComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(EditorInsightOverlayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
