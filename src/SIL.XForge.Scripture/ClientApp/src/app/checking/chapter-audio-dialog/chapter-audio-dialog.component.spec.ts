import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChapterAudioDialogComponent } from './chapter-audio-dialog.component';

describe('ChapterAudioDialogComponent', () => {
  let component: ChapterAudioDialogComponent;
  let fixture: ComponentFixture<ChapterAudioDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ChapterAudioDialogComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ChapterAudioDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
