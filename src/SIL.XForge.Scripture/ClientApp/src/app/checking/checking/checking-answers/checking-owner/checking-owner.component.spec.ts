import { Component, DebugElement, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AvatarService } from 'ngx-avatar';
import * as OTJson0 from 'ot-json0';
import { instance, mock, when } from 'ts-mockito';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { MemoryRealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';
import { CheckingOwnerComponent } from './checking-owner.component';

describe('CheckingOwnerComponent', () => {
  let env: TestEnvironment;
  beforeEach(() => {
    env = new TestEnvironment();
  });

  it('should create', () => {
    const template = '<app-checking-owner ownerRef="user01"></app-checking-owner>';
    env.createHostComponent(template);
    expect(env.fixture.componentInstance).toBeTruthy();
  });

  it('displays owner name', fakeAsync(() => {
    const template = '<app-checking-owner ownerRef="user01"></app-checking-owner>';
    env.createHostComponent(template);
    tick();
    env.fixture.detectChanges();
    expect(env.userName).toBe('User 01');
  }));

  it('displays avatar', () => {
    const template =
      '<app-checking-owner #checkingOwner ownerRef="user01" [includeAvatar]="true"></app-checking-owner>';
    env.createHostComponent(template);
    expect(env.avatar).toBeTruthy();
    expect(env.avatar.query(By.css('app-avatar'))).toBeTruthy();
    env.fixture.componentInstance.checkingOwner.includeAvatar = false;
    env.fixture.detectChanges();
    expect(env.avatar).toBeFalsy();
  });

  it('displays date/time ', () => {
    const template = '<app-checking-owner #checkingOwner ownerRef="user01"></app-checking-owner>';
    env.createHostComponent(template);
    env.fixture.componentInstance.checkingOwner.dateTime = null;
    env.fixture.detectChanges();
    expect(env.fixture.debugElement.query(By.css('.layout .date-time'))).toBe(null);
    env.fixture.componentInstance.checkingOwner.dateTime = '2019-04-25T12:30:00';
    env.fixture.detectChanges();
    expect(env.dateTime).toBe(' 25 Apr 19 at 12:30PM');
  });

  it('layout set correctly', () => {
    const template =
      '<app-checking-owner #checkingOwner ownerRef="user01" [layoutStacked]="true"></app-checking-owner>';
    env.createHostComponent(template);
    expect(env.layout.classes['layout-stacked']).toBeTruthy();
    expect(env.layout.classes['layout-inline']).toBeFalsy();
    env.fixture.componentInstance.checkingOwner.layoutStacked = false;
    env.fixture.detectChanges();
    expect(env.layout.classes['layout-stacked']).toBeFalsy();
    expect(env.layout.classes['layout-inline']).toBeTruthy();
  });
});

@Component({ selector: 'app-host', template: '' })
class HostComponent {
  @ViewChild(CheckingOwnerComponent) checkingOwner: CheckingOwnerComponent;
}

class TestEnvironment {
  fixture: ComponentFixture<HostComponent>;

  readonly mockedUserService = mock(UserService);
  readonly mockedAvatarService = mock(AvatarService);
  readonly mockedRealtimeOfflineStore = mock(RealtimeOfflineStore);

  constructor() {
    when(this.mockedUserService.getProfile('user01')).thenResolve(
      new UserProfileDoc(
        new MemoryRealtimeDocAdapter('user01', OTJson0.type, { name: 'User 01', role: 'user' }),
        instance(this.mockedRealtimeOfflineStore)
      )
    );
    TestBed.configureTestingModule({
      declarations: [HostComponent, CheckingOwnerComponent],
      imports: [UICommonModule, XForgeCommonModule],
      providers: [
        { provide: UserService, useFactory: () => instance(this.mockedUserService) },
        { provide: AvatarService, useFactory: () => instance(this.mockedAvatarService) }
      ]
    });
  }

  createHostComponent(template: string): void {
    TestBed.overrideComponent(HostComponent, { set: { template: template } });
    this.fixture = TestBed.createComponent(HostComponent);
    this.fixture.detectChanges();
  }

  get userName(): string {
    return this.fixture.debugElement.query(By.css('.layout .name')).nativeElement.textContent;
  }

  get dateTime(): string {
    return this.fixture.debugElement.query(By.css('.layout .date-time')).nativeElement.textContent;
  }

  get layout(): DebugElement {
    return this.fixture.debugElement.query(By.css('.layout'));
  }

  get avatar(): DebugElement {
    return this.fixture.debugElement.query(By.css('.avatar'));
  }
}
