import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable, Injector } from '@angular/core';
import { Observable } from 'rxjs';
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

    if (this.authService == null) {
      this.authService = this.injector.get<AuthService>(AuthService);
    }

    const authReq = req.clone({
      headers: req.headers.set('Authorization', 'Bearer ' + this.authService.accessToken)
    });
    return next.handle(authReq);
  }
}
