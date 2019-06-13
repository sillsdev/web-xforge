import { ErrorHandler, Injectable, Injector } from '@angular/core';
import { Router } from '@angular/router';

@Injectable()
export class ExceptionHandlingService implements ErrorHandler {
  ERROR_CODE_REGEXP = /(error:\s+\d+:\s+[a-z\s]+)/i;
  constructor(private readonly injector: Injector) {}

  handleError(error: Error) {
    const router: Router = this.injector.get(Router);
    let url = '/error?stack=' + error.stack;
    const code = this.ERROR_CODE_REGEXP.exec(error.stack);
    if (code) {
      url = url + '&errorCode=' + code[1];
    }
    router.navigateByUrl(url);
    throw error;
  }
}
