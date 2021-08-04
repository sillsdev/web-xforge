import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NoteDialogComponent } from './note-dialog.component';

describe('NoteDialogComponent', () => {
  let component: NoteDialogComponent;
  let fixture: ComponentFixture<NoteDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NoteDialogComponent]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(NoteDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should highlight selected word', () => {});

  it('should show words either side of selected word', () => {});
});
