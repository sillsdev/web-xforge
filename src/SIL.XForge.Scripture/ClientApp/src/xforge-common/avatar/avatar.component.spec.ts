import { TestBed } from '@angular/core/testing';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { AvatarComponent } from './avatar.component';

describe('AvatarComponent', () => {
  configureTestingModule(() => ({
    imports: [TestOnlineStatusModule.forRoot()],
    providers: [{ provide: OnlineStatusService, useClass: TestOnlineStatusService }]
  }));

  it('should return values when user is undefined', () => {
    const testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
      OnlineStatusService
    ) as TestOnlineStatusService;
    const component = new AvatarComponent(testOnlineStatusService);
    component.user = undefined;
    expect(component.avatarUrl).toBeDefined();
    expect(component.name).toBeDefined();
  });
});
