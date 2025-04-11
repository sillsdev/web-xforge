import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LynxInsightEditorObjectsComponent } from './lynx-insight-editor-objects.component';

describe('LynxInsightEditorObjectsComponent', () => {
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
});
