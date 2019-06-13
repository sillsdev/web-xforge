import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';

@Component({
  selector: 'app-error',
  templateUrl: './error.component.html',
  styleUrls: ['./error.component.scss']
})
export class ErrorComponent implements OnInit {
  stack: string;
  errorCode: string = 'Error: No error code';
  showDetails: boolean = false;

  constructor(private readonly activatedRoute: ActivatedRoute) {}

  ngOnInit() {
    this.activatedRoute.queryParams.pipe(first()).subscribe(params => {
      this.stack = params['stack'];
      if (params['errorCode']) {
        this.errorCode = params['errorCode'];
      }
    });
  }
}
