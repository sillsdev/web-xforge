import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { CheckingAudioPlayerComponent } from './checking-audio-player.component';

describe('CheckingAudioPlayerComponent', () => {
  let component: CheckingAudioPlayerComponent;
  let fixture: ComponentFixture<CheckingAudioPlayerComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [CheckingAudioPlayerComponent]
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(CheckingAudioPlayerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
