import { Component, Input, OnInit } from '@angular/core';
import { TranslocoService } from '@ngneat/transloco';
import { UserProfile } from 'realtime-server/lib/cjs/common/models/user';
import { I18nService } from 'xforge-common/i18n.service';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { UserService } from 'xforge-common/user.service';

@Component({
  selector: 'app-checking-owner',
  templateUrl: './checking-owner.component.html',
  styleUrls: ['./checking-owner.component.scss']
})
export class CheckingOwnerComponent implements OnInit {
  @Input() ownerRef?: string;
  @Input() includeAvatar: boolean = false;
  @Input() dateTime: string = '';
  @Input() layoutStacked: boolean = false;
  private ownerDoc?: UserProfileDoc;

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
    if (this.ownerRef != null) {
      this.ownerDoc = await this.userService.getProfile(this.ownerRef);
    }
  }
}
