import { Component, EventEmitter } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { interval } from 'rxjs';
import { takeWhile } from 'rxjs/operators';
import { BetaMigrationMessage } from 'xforge-common/beta-migration/beta-migration.component';
import { I18nService, TextAroundTemplate } from 'xforge-common/i18n.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-beta-migration-dialog',
  templateUrl: './beta-migration-dialog.component.html',
  styleUrls: ['./beta-migration-dialog.scss']
})
export class BetaMigrationDialogComponent {
  attempts: number = 0;
  betaUrl: SafeResourceUrl;
  onProgress: EventEmitter<number> = new EventEmitter<number>();

  private hasLoaded: boolean = false;
  private message: BetaMigrationMessage = { message: 'loading', progress: 0 };

  constructor(private sanitizer: DomSanitizer, private readonly i18n: I18nService) {
    this.betaUrl = this.migrationUrl;
    window.addEventListener('message', event => {
      if (event.origin !== environment.betaUrl) {
        return;
      }
      this.hasLoaded = true;
      this.message = <BetaMigrationMessage>event.data;
      this.onProgress.emit(this.progress);
      // Check if login is required
      if (this.label === 'login_required') {
        window.location.href = environment.betaUrl + window.location.pathname;
      }
    });

    interval(10000)
      .pipe(takeWhile(() => !this.hasLoaded))
      .subscribe(() => {
        this.message.message = 'loading_retry';
        this.attempts++;
        this.betaUrl = this.migrationUrl;
      });
  }

  get label(): string {
    return this.message.message;
  }

  get progress(): number {
    return this.message.progress;
  }

  get recourseMessage(): TextAroundTemplate | undefined {
    return this.i18n.translateTextAroundTemplateTags('beta_migration.recourse');
  }

  private get migrationUrl(): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(environment.betaUrl + '/migration');
  }
}
