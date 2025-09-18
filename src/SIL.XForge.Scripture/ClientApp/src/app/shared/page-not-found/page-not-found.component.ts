import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { lastValueFrom, timer } from 'rxjs';
import { map, takeWhile } from 'rxjs/operators';

// All times in milliseconds
const redirectDelay = 10_000;
const progressUpdateInterval = 100;
const totalProgressUpdates = redirectDelay / progressUpdateInterval;

@Component({
  selector: 'app-page-not-found',
  templateUrl: './page-not-found.component.html',
  styleUrls: ['./page-not-found.component.scss'],
  standalone: false
})
export class PageNotFoundComponent {
  progress = timer(0, progressUpdateInterval).pipe(
    takeWhile(val => val < totalProgressUpdates),
    map(val => (val / totalProgressUpdates) * 100)
  );

  constructor(readonly router: Router) {
    lastValueFrom(this.progress).then(() => {
      this.router.navigateByUrl('/projects');
    });
  }
}
