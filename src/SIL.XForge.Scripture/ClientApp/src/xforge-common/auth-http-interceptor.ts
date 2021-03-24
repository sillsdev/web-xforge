import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable, Injector } from '@angular/core';
import { from, Observable } from 'rxjs';
import { AuthService } from './auth.service';

const AUTH_APIS = ['paratext-api', 'machine-api', 'command-api'];

@Injectable()
export class AuthHttpInterceptor implements HttpInterceptor {
  private authService?: AuthService;

  constructor(private readonly injector: Injector) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (AUTH_APIS.every(api => !req.url.startsWith(api))) {
      return next.handle(req);
    }
    return from(this.handle(req, next));
  }

  async handle(req: HttpRequest<any>, next: HttpHandler): Promise<HttpEvent<any>> {
    if (this.authService == null) {
      this.authService = this.injector.get<AuthService>(AuthService);
    }
    // Make sure the user is authenticated with a valid access token
    await this.authService.isAuthenticated();
    // Add access token to the request header
    const authReq = req.clone({
      headers: req.headers.set('Authorization', 'Bearer ' + this.authService.accessToken)
    });
    return next.handle(authReq).toPromise();
  }
}
