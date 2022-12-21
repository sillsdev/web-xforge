import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { Component, DebugElement, ElementRef, ViewChild } from '@angular/core';
import { By } from '@angular/platform-browser';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { NoticeComponent } from './notice.component';

describe('NoticeComponent', () => {
  it('should create', () => {
    const template = '<app-notice text="app.online"></app-notice>';
    const env = new TestEnvironment(template);
    expect(env.fixture.componentInstance).toBeTruthy();
    expect(env.noticeText).toEqual('app.online');
    expect(env.icon).toBeFalsy();
    expect(env.container.classes['normal']).toBeTrue();
  });

  it('should show icon', () => {
    const template = '<app-notice text="app.online" icon="info"></app-notice>';
    const env = new TestEnvironment(template);
    expect(env.icon).toBeTruthy();
  });

  it('should set error class', () => {
    const template = '<app-notice text="app.online" type="error"></app-notice>';
    const env = new TestEnvironment(template);
    expect(env.container.classes['error']).toBeTrue();
  });

  it('should set warning class', () => {
    const template = '<app-notice text="app.online" type="warning"></app-notice>';
    const env = new TestEnvironment(template);
    expect(env.container.classes['warning']).toBeTrue();
  });
});

@Component({ selector: 'app-host', template: '' })
class HostComponent {
  @ViewChild('container', { static: true }) container!: ElementRef;
}

class TestEnvironment {
  readonly fixture: ComponentFixture<HostComponent>;

  constructor(template: string) {
    TestBed.configureTestingModule({
      declarations: [HostComponent, NoticeComponent],
      imports: [TestTranslocoModule, UICommonModule]
    });

    TestBed.overrideComponent(HostComponent, { set: { template } });
    this.fixture = TestBed.createComponent(HostComponent);
    this.fixture.detectChanges();
  }

  get container(): DebugElement {
    return this.fetchElement('div');
  }

  get icon(): DebugElement {
    return this.fetchElement('mat-icon');
  }

  get noticeText(): string {
    return this.fetchElement('span').nativeElement.textContent;
  }

  private fetchElement(query: string): DebugElement {
    return this.fixture.debugElement.query(By.css(query));
  }
}
