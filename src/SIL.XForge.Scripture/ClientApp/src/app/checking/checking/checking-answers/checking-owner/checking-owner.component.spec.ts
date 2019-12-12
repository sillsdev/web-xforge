import { Component, DebugElement, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoService } from '@ngneat/transloco';
import { AvatarService } from 'ngx-avatar';
import { UserProfile } from 'realtime-server/lib/common/models/user';
import { instance, mock, when } from 'ts-mockito';
import { AvatarTestingModule } from 'xforge-common/avatar/avatar-testing.module';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SF_REALTIME_DOC_TYPES } from '../../../../core/models/sf-realtime-doc-types';
import { CheckingOwnerComponent } from './checking-owner.component';

describe('CheckingOwnerComponent', () => {
  it('should create', () => {
    const template = '<app-checking-owner ownerRef="user01"></app-checking-owner>';
    const env = new TestEnvironment(template);
    expect(env.fixture.componentInstance).toBeTruthy();
  });

  it('displays owner name', fakeAsync(() => {
    const template = '<app-checking-owner ownerRef="user01"></app-checking-owner>';
    const env = new TestEnvironment(template);
    tick();
    env.fixture.detectChanges();
    expect(env.userName).toBe('User 01');
  }));

  it('displays avatar', () => {
    const template =
      '<app-checking-owner #checkingOwner ownerRef="user01" [includeAvatar]="true"></app-checking-owner>';
    const env = new TestEnvironment(template);
    expect(env.avatar).toBeTruthy();
    expect(env.avatar.query(By.css('app-avatar'))).toBeTruthy();
    env.fixture.componentInstance.checkingOwner.includeAvatar = false;
    env.fixture.detectChanges();
    expect(env.avatar).toBeFalsy();
  });

  it('displays date/time ', () => {
    const template = '<app-checking-owner #checkingOwner ownerRef="user01"></app-checking-owner>';
    const env = new TestEnvironment(template);
    env.fixture.componentInstance.checkingOwner.dateTime = '';
    env.fixture.detectChanges();
    expect(env.fixture.debugElement.query(By.css('.layout .date-time'))).toBeNull();
    env.fixture.componentInstance.checkingOwner.dateTime = '2019-04-25T12:30:00';
    env.fixture.detectChanges();
    expect(env.dateTime).toBe('Apr 25, 2019, 12:30 PM');
  });

  it('layout set correctly', () => {
    const template =
      '<app-checking-owner #checkingOwner ownerRef="user01" [layoutStacked]="true"></app-checking-owner>';
    const env = new TestEnvironment(template);
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
  @ViewChild(CheckingOwnerComponent, { static: false }) checkingOwner!: CheckingOwnerComponent;
}

class TestEnvironment {
  readonly fixture: ComponentFixture<HostComponent>;

  readonly mockedUserService = mock(UserService);
  readonly mockedAvatarService = mock(AvatarService);
  readonly mockedTransloco = mock(TranslocoService);

  private readonly realtimeService = new TestRealtimeService(SF_REALTIME_DOC_TYPES);

  constructor(template: string) {
    this.realtimeService.addSnapshot<UserProfile>(UserProfileDoc.COLLECTION, {
      id: 'user01',
      data: {
        displayName: 'User 01',
        avatarUrl: ''
      }
    });
    when(this.mockedUserService.getProfile('user01')).thenCall(() =>
      this.realtimeService.subscribe(UserProfileDoc.COLLECTION, 'user01')
    );
    TestBed.configureTestingModule({
      declarations: [HostComponent, CheckingOwnerComponent],
      imports: [AvatarTestingModule, UICommonModule],
      providers: [
        { provide: UserService, useFactory: () => instance(this.mockedUserService) },
        { provide: AvatarService, useFactory: () => instance(this.mockedAvatarService) },
        { provide: TranslocoService, useFactory: () => instance(this.mockedTransloco) }
      ]
    });

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
