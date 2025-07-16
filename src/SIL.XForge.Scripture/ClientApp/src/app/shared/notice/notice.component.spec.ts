import { Component, DebugElement, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoticeComponent } from './notice.component';
import { noticeModes, noticeTypes } from './notice.types';

describe('NoticeComponent', () => {
  it('should create', () => {
    const template = '<app-notice>This is a notice</app-notice>';
    const env = new TestEnvironment(template);
    expect(env.fixture.componentInstance).toBeTruthy();
    expect(env.noticeText).toEqual('This is a notice');
    expect(env.icon).toBeFalsy();
    expect(env.container.classes['primary']).toBeTrue();
  });

  it('should show icon', () => {
    const template = '<app-notice icon="info">This is a notice</app-notice>';
    const env = new TestEnvironment(template);
    expect(env.icon).toBeTruthy();
  });

  for (const type of noticeTypes) {
    it(`should set type "${type}" class`, () => {
      const template = `<app-notice type="${type}">This is a ${type}</app-notice>`;
      const env = new TestEnvironment(template);
      expect(env.container.classes[type]).toBeTrue();
    });
  }

  for (const mode of noticeModes) {
    it(`should set mode "mode-${mode}" class`, () => {
      const template = `<app-notice mode="${mode}">This is a ${mode}</app-notice>`;
      const env = new TestEnvironment(template);
      expect(env.container.classes[`mode-${mode}`]).toBeTrue();
    });
  }

  it('should set "primary" class if no type specified', () => {
    const template = '<app-notice>This is a notice</app-notice>';
    const env = new TestEnvironment(template);
    expect(env.container.classes['primary']).toBeTrue();
  });

  it('should set "mode-fill-light" class if no mode specified', () => {
    const template = '<app-notice>This is a notice</app-notice>';
    const env = new TestEnvironment(template);
    expect(env.container.classes['mode-fill-light']).toBeTrue();
  });
});

@Component({
    selector: 'app-host', template: '',
    standalone: false
})
class HostComponent {
  @ViewChild(NoticeComponent, { static: true }) component!: NoticeComponent;
}

class TestEnvironment {
  readonly fixture: ComponentFixture<HostComponent>;

  constructor(template: string) {
    TestBed.configureTestingModule({
      declarations: [HostComponent],
      imports: [NoticeComponent]
    });

    TestBed.overrideComponent(HostComponent, { set: { template } });
    this.fixture = TestBed.createComponent(HostComponent);
    this.fixture.componentInstance.component.ngOnChanges();
    this.fixture.detectChanges();
  }

  get container(): DebugElement {
    return this.fetchElement('app-notice');
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
