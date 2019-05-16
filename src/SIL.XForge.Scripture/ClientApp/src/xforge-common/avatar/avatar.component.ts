import { Component, Input } from '@angular/core';

import { User } from '../models/user';

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

  get googleId(): string {
    return this.user && this.user.avatarUrl == null ? this.user.googleId : '';
  }

  get emailMd5(): string {
    return this.user && this.user.avatarUrl == null ? this.user.emailMd5 : '';
  }

  get name(): string {
    return this.user ? this.user.name : '';
  }
}
