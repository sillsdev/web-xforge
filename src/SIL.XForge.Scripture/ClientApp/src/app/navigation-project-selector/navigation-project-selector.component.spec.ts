import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Component, DebugElement } from '@angular/core';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { By } from '@angular/platform-browser';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { mock, when } from 'ts-mockito';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { NavigationProjectSelectorComponent } from './navigation-project-selector.component';

const mockOnlineStatusService = mock(OnlineStatusService);
const mockFeatureFlagService = mock(FeatureFlagService);

describe('NavigationProjectSelectorComponent', () => {
  configureTestingModule(() => ({
    declarations: [NavigationProjectSelectorComponent],
    providers: [
      { provide: OnlineStatusService, useMock: mockOnlineStatusService },
      { provide: FeatureFlagService, useMock: mockFeatureFlagService }
    ],
    imports: [UICommonModule, NoopAnimationsModule, TestTranslocoModule]
  }));

  it('emits event when project changes', fakeAsync(() => {
    const template = `<app-navigation-project-selector [projectDocs]="projectDocs" (changed)="changed = $event"></app-navigation-project-selector>`;
    const env = new TestEnvironment(template);

    env.click(env.select);
    const options = env.options;
    expect(options.length).toEqual(3);
    env.click(options[0]);
    expect(env.component.changed).toEqual('project01');
    env.click(options[2]);
    expect(env.component.changed).toEqual('*connect-project*');
    env.wait();
  }));
});

@Component({ selector: 'app-host', template: '' })
class HostComponent {
  changed?: string;
  projectDocs: Partial<SFProjectProfileDoc>[] = [
    {
      id: 'project01',
      data: createTestProjectProfile({
        name: 'Project 01',
        shortName: 'PR1',
        paratextId: ''
      })
    },
    {
      id: 'project02',
      data: createTestProjectProfile({
        name: 'Project 02',
        shortName: 'PR2',
        paratextId: ''
      })
    }
  ];
}

class TestEnvironment {
  readonly component: HostComponent;
  readonly fixture: ComponentFixture<HostComponent>;

  constructor(template: string) {
    when(mockOnlineStatusService.isOnline).thenReturn(true);
    TestBed.configureTestingModule({
      declarations: [NavigationProjectSelectorComponent, HostComponent],
      imports: [UICommonModule, NoopAnimationsModule, TestTranslocoModule]
    });
    TestBed.overrideComponent(HostComponent, { set: { template: template } });
    this.fixture = TestBed.createComponent(HostComponent);
    this.component = this.fixture.componentInstance;
    this.wait();
  }

  get select(): DebugElement {
    return this.fixture.debugElement.query(By.css('mat-select'));
  }

  get options(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('mat-option'));
  }

  click(element: DebugElement): void {
    element.nativeElement.click();
    this.fixture.detectChanges();
  }

  wait(): void {
    tick();
    this.fixture.detectChanges();
  }
}
