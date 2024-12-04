import { EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-notification',
  template: `
    <ng-container *transloco="let t">
      <div class="notification" [class.obtrusive]="notification.type === 'Obtrusive'">
        <app-notice [type]="noticeType" [mode]="noticeMode" [icon]="'notifications'">
          <h3>{{ notification.title }}</h3>
          <div [innerHTML]="notification.content"></div>
          <button mat-button *ngIf="!isViewed" (click)="markAsViewed()">{{ t('dismiss') }}</button>
        </app-notice>
      </div>
    </ng-container>
  `,
  styles: [
    `
      .notification {
        margin-bottom: 1rem;
      }
      .obtrusive {
        position: sticky;
        top: 0;
        z-index: 100;
      }
    `
  ],
  standalone: true,
  imports: [CommonModule, MatButtonModule, NoticeComponent, TranslocoModule]
})
export class NotificationComponent {
  @Input() notification!: Notification;
  @Input() isViewed: boolean = false;
  @Output() viewed = new EventEmitter<void>();

  get noticeType(): 'primary' | 'warning' | 'info' {
    return this.notification.type === 'Obtrusive' ? 'warning' : 'info';
  }

  get noticeMode(): NoticeMode {
    return this.notification.type === 'Obtrusive' ? 'fill-dark' : 'fill-light';
  }

  markAsViewed(): void {
    this.viewed.emit();
  }
}
