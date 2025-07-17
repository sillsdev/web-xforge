import { Component, DoCheck, Input, OnChanges } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { UserProfile } from 'realtime-server/lib/esm/common/models/user';

type AvatarMode = 'image' | 'initials' | 'user_icon';

@Component({
  selector: 'app-avatar',
  templateUrl: './avatar.component.html',
  styleUrls: ['./avatar.component.scss'],
  imports: [MatIconModule],
  standalone: true
})
export class AvatarComponent implements DoCheck, OnChanges {
  @Input() size: number = 32;
  @Input() user?: UserProfile;
  @Input() borderColor: string = 'transparent';

  name?: string;
  avatarUrl?: string;
  avatarColorFromDisplayName?: string;
  initials?: string;
  mode: AvatarMode = 'user_icon';
  imageLoadFailed: boolean = false;

  ngDoCheck(): void {
    if (this.name !== this.user?.displayName || this.avatarUrl !== this.user?.avatarUrl) {
      this.ngOnChanges();
    }
  }

  ngOnChanges(): void {
    this.name = this.user?.displayName;
    this.avatarUrl = this.user?.avatarUrl;
    this.mode = this.getMode();
  }

  getMode(): AvatarMode {
    if (this.avatarUrl && !this.imageLoadFailed) {
      return 'image';
    }

    this.avatarColorFromDisplayName = this.getAvatarColorFromDisplayName();
    this.initials = this.getInitials();

    if (this.initials != null) {
      return 'initials';
    }

    return 'user_icon';
  }

  getInitials(): string | undefined {
    if (this.name == null) {
      return undefined;
    }

    const characters = this.name
      .split(/\s+/) // Split on whitespace
      .filter(s => s.length > 0)
      .map(s => s[0])
      // filter out non-latin characters
      .filter(c => c.toUpperCase() !== c.toLowerCase());

    if (characters.length === 0) {
      return undefined;
    } else if (characters.length === 1) {
      return characters[0].toUpperCase();
    } else {
      return characters[0].toUpperCase() + characters[characters.length - 1].toUpperCase();
    }
  }

  /** Generates a hue (0 to 360) based on a hash of the user display name */
  getAvatarHueFromDisplayName(): number {
    if (this.name == null) {
      return 200; // Blue
    }

    let hash = 0;
    for (let i = 0; i < this.name.length; i++) {
      hash = (hash << 5) - hash + this.name.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }

    return Math.abs(hash) % 360;
  }

  getAvatarColorFromDisplayName(): string {
    return `hsl(${this.getAvatarHueFromDisplayName()}, 60%, 50%)`;
  }

  onImageError(): void {
    this.imageLoadFailed = true;
    this.mode = this.getMode();
  }
}
