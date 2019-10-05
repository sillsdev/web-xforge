import { AvatarComponent } from './avatar.component';

describe('AvatarComponent', () => {
  it('should return values when user is undefined', () => {
    const component = new AvatarComponent();
    component.user = undefined;
    expect(component.avatarUrl).toBeDefined();
    expect(component.name).toBeDefined();
  });
});
