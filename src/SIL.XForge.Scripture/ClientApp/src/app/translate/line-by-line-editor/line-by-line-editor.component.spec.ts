import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LineByLineEditorComponent } from './line-by-line-editor.component';

describe('LineByLineEditorComponent', () => {
  let component: LineByLineEditorComponent;
  let fixture: ComponentFixture<LineByLineEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [LineByLineEditorComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(LineByLineEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
