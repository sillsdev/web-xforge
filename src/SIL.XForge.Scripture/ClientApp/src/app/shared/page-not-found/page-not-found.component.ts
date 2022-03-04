import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { timer } from 'rxjs';
import { takeWhile } from 'rxjs/operators';

@Component({
  selector: 'app-page-not-found',
  templateUrl: './page-not-found.component.html',
  styleUrls: ['./page-not-found.component.scss']
})
export class PageNotFoundComponent {
  // Timer fires every 100ms until 100 instances have occurred (10s)
  progress = timer(0, 100).pipe(
    takeWhile(val => (val <= 100 ? true : this.router.navigateByUrl('/projects') && false))
  );

  constructor(readonly router: Router) {}
}
