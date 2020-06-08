import { instance, mock } from 'ts-mockito';
import { PwaService } from 'xforge-common/pwa.service';
import { AvatarComponent } from './avatar.component';

describe('AvatarComponent', () => {
  it('should return values when user is undefined', () => {
    const mockedPwaService = mock(PwaService);
    const component = new AvatarComponent(instance(mockedPwaService));
    component.user = undefined;
    expect(component.avatarUrl).toBeDefined();
    expect(component.name).toBeDefined();
  });
});
