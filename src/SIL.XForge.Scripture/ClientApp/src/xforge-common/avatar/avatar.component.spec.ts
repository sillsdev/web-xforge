import { instance, mock } from 'ts-mockito';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { AvatarComponent } from './avatar.component';

describe('AvatarComponent', () => {
  it('should return values when user is undefined', () => {
    const mockedOnlineStatusService = mock(OnlineStatusService);
    const component = new AvatarComponent(instance(mockedOnlineStatusService));
    component.user = undefined;
    expect(component.avatarUrl).toBeDefined();
    expect(component.name).toBeDefined();
  });
});
