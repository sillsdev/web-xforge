import { Component, Input } from '@angular/core';
import { User } from 'realtime-server/lib/common/models/user';

@Component({
  selector: 'app-avatar',
  templateUrl: './avatar.component.html'
})
export class AvatarComponent {
  @Input() round: boolean = false;
  @Input() size: number = 32;
  @Input() user: Partial<User>;

  get avatarUrl(): string {
    return this.user ? this.user.avatarUrl : '';
  }

  get name(): string {
    return this.user ? this.user.displayName : '';
  }
}
