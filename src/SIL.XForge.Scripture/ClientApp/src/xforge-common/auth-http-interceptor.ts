import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpResponse,
  HttpStatusCode
} from '@angular/common/http';
import { Injectable, Injector } from '@angular/core';
import { from, lastValueFrom, Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { CommandErrorCode } from 'xforge-common/command.service';
import { AuthService } from './auth.service';

export const AUTH_APIS = ['paratext-api', 'machine-api', 'command-api'];

@Injectable()
export class AuthHttpInterceptor implements HttpInterceptor {
  private authService?: AuthService;

  constructor(private readonly injector: Injector) {}

  async handle(req: HttpRequest<any>, next: HttpHandler): Promise<HttpEvent<any>> {
    this.authService ??= this.injector.get<AuthService>(AuthService);
    // Make sure the user is authenticated with a valid access token
    if (!(await this.authService.isAuthenticated())) {
      // When authentication fails auth0 is already in the process of redirecting to the login screen
      // Using NEVER is a graceful way of waiting for the browser to complete the redirection
      // without triggering any other errors from an incomplete http request
      return new Promise<never>(() => {});
    }
    // Add access token to the request header
    const authReq = req.clone({
      headers: req.headers.set('Authorization', 'Bearer ' + (await this.authService.getAccessToken()))
    });
    return await lastValueFrom(next.handle(authReq));
  }

  async handleResponseError(error: any, req: HttpRequest<any>, next: HttpHandler): Promise<HttpEvent<any>> {
    switch (error.status) {
      // JSON RPC responds with this status code for 401 unauthorized
      case CommandErrorCode.InvalidRequest:
      case 401:
        await this.authService!.expireToken();
        return await this.handle(req, next);
    }
    // HTTP/2 Requests do not carry the status text from the HTTP/1.1 Request
    // See: https://datatracker.ietf.org/doc/html/rfc7540#section-8.1.2.4
    // Angular then will substitute OK for the empty status text
    // See: https://angular.dev/api/common/http/HttpErrorResponse
    if (error.status >= 400 && error.status < 600 && error.statusText === 'OK') {
      error.statusText =
        Object.keys(HttpStatusCode)
          .find(key => HttpStatusCode[key] === error.status)
          ?.replace(/([a-z])([A-Z])/g, '$1 $2') ?? 'Unknown Error';
      error.message = error.message?.replace(/ OK$/, ' ' + error.statusText);
    }
    return await Promise.reject(error);
  }

  handleResponseEvent(evt: HttpEvent<any>): HttpEvent<any> {
    if (evt instanceof HttpResponse) {
      // Throw any JSON RPC errors that are contained in the body even though they actually return a 200 status
      if (evt.body != null && evt.body.error != null) {
        throw new HttpErrorResponse({
          status: evt.body.error.code,
          statusText: evt.body.error.message,
          url: evt.url!
        });
      }
    }
    return evt;
  }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (AUTH_APIS.every(api => !req.url.startsWith(api))) {
      return next.handle(req);
    }
    return from(this.handle(req, next)).pipe(
      map((evt: HttpEvent<any>) => this.handleResponseEvent(evt)),
      catchError(error => from(this.handleResponseError(error, req, next)))
    );
  }
}
