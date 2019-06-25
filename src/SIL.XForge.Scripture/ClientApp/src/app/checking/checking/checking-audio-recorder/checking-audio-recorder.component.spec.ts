import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { CheckingAudioRecorderComponent } from './checking-audio-recorder.component';

describe('CheckingAudioRecorderComponent', () => {
  let component: CheckingAudioRecorderComponent;
  let fixture: ComponentFixture<CheckingAudioRecorderComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [CheckingAudioRecorderComponent]
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(CheckingAudioRecorderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
