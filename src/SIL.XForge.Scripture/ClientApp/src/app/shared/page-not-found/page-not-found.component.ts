import { AsyncPipe } from '@angular/common';
import { Component } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { lastValueFrom, timer } from 'rxjs';
import { map, takeWhile } from 'rxjs/operators';
import { RouterLinkDirective } from 'xforge-common/router-link.directive';

// All times in milliseconds
const redirectDelay = 10_000;
const progressUpdateInterval = 100;
const totalProgressUpdates = redirectDelay / progressUpdateInterval;

@Component({
  selector: 'app-page-not-found',
  templateUrl: './page-not-found.component.html',
  styleUrls: ['./page-not-found.component.scss'],
  imports: [TranslocoModule, MatIcon, MatProgressBar, RouterLinkDirective, AsyncPipe]
})
export class PageNotFoundComponent {
  progress = timer(0, progressUpdateInterval).pipe(
    takeWhile(val => val < totalProgressUpdates),
    map(val => (val / totalProgressUpdates) * 100)
  );

  constructor(readonly router: Router) {
    void lastValueFrom(this.progress).then(() => {
      void this.router.navigateByUrl('/projects');
    });
  }
}
