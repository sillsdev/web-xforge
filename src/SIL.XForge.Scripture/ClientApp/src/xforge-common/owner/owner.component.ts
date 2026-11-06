import { NgClass } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { TranslocoService } from '@ngneat/transloco';
import { UserProfile } from 'realtime-server/lib/esm/common/models/user';
import { AvatarComponent } from '../avatar/avatar.component';
import { I18nService } from '../i18n.service';
import { UserDoc } from '../models/user-doc';
import { UserProfileDoc } from '../models/user-profile-doc';
import { UserService } from '../user.service';

@Component({
  selector: 'app-owner',
  templateUrl: './owner.component.html',
  styleUrls: ['./owner.component.scss'],
  imports: [AvatarComponent, NgClass]
})
export class OwnerComponent implements OnInit {
  @Input() ownerRef?: string;
  @Input() includeAvatar: boolean = false;
  @Input() dateTime: string = '';
  @Input() layoutStacked: boolean = false;
  @Input() showTimeZone: boolean = false;
  private ownerDoc?: UserProfileDoc | UserDoc;

  constructor(
    private readonly userService: UserService,
    readonly i18n: I18nService,
    private readonly translocoService: TranslocoService
  ) {}

  get date(): Date {
    return new Date(this.dateTime);
  }

  get name(): string {
    if (this.ownerDoc == null || this.ownerDoc.data == null) {
      return this.translocoService.translate('checking.unknown_author');
    }
    return this.userService.currentUserId === this.ownerDoc.id
      ? this.translocoService.translate('checking.me')
      : this.ownerDoc.data.displayName;
  }

  get owner(): UserProfile | undefined {
    return this.ownerDoc == null ? undefined : this.ownerDoc.data;
  }

  async ngOnInit(): Promise<void> {
    if (this.ownerRef == null) return;
    // The current user's profile doc may never have been fetched before this point, and if we're offline it would not
    // be available. Their user doc is always loaded, so use it instead, regardless of whether we're offline.
    this.ownerDoc =
      this.ownerRef === this.userService.currentUserId
        ? await this.userService.getCurrentUser()
        : await this.userService.getProfile(this.ownerRef);
  }
}
