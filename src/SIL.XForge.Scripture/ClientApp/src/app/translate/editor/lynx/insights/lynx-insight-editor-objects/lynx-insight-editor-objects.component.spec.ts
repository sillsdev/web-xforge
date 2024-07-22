import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LynxInsightEditorObjectsComponent } from './editor-insight-editor-objects.component';

describe('EditorInsightEditorObjectsComponent', () => {
  let component: LynxInsightEditorObjectsComponent;
  let fixture: ComponentFixture<LynxInsightEditorObjectsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LynxInsightEditorObjectsComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(LynxInsightEditorObjectsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
