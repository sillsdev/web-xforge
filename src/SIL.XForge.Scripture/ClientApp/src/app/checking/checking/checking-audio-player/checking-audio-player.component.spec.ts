import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Component, DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { AudioTimePipe, CheckingAudioPlayerComponent } from './checking-audio-player.component';

describe('CheckingAudioPlayerComponent', () => {
  let env: TestEnvironment;

  beforeEach(() => {
    env = new TestEnvironment();
  });

  it('should be created', () => {
    const template = '<app-checking-audio-player></app-checking-audio-player>';
    env.createHostComponent(template);
    expect(env.fixture.componentInstance).toBeTruthy();
  });
});

@Component({ selector: 'app-host', template: '' })
class HostComponent {}

class TestEnvironment {
  fixture: ComponentFixture<HostComponent>;

  constructor() {
    TestBed.configureTestingModule({
      declarations: [HostComponent, CheckingAudioPlayerComponent, AudioTimePipe],
      imports: [UICommonModule]
    });
  }

  createHostComponent(template: string): void {
    TestBed.overrideComponent(HostComponent, { set: { template: template } });
    this.fixture = TestBed.createComponent(HostComponent);
    this.fixture.detectChanges();
  }

  clickButton(button: DebugElement): void {
    button.nativeElement.click();
    this.fixture.detectChanges();
  }

  get toggleSelectorButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#font-size-toggle'));
  }

  get increaseButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('mdc-menu-surface button:last-child'));
  }

  get decreaseButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('mdc-menu-surface button:first-child'));
  }
}
