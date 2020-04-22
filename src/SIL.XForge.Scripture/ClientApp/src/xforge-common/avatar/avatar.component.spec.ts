import { PwaService } from 'xforge-common/pwa.service';
import { AvatarComponent } from './avatar.component';

describe('AvatarComponent', () => {
  it('should return values when user is undefined', () => {
    const component = new AvatarComponent(new PwaService());
    component.user = undefined;
    expect(component.avatarUrl).toBeDefined();
    expect(component.name).toBeDefined();
  });
});
