import { AvatarComponent } from './avatar.component';

describe('AvatarComponent', () => {
  it('should return values when user is null', () => {
    const component = new AvatarComponent();
    component.user = null;
    expect(component.avatarUrl).toBeDefined();
    expect(component.name).toBeDefined();
  });
});
