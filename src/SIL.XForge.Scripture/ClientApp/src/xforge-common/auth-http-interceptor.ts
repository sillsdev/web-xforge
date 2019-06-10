import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

const AUTH_APIS = ['paratext-api', 'machine-api', 'json-api'];

@Injectable()
export class AuthHttpInterceptor implements HttpInterceptor {
  constructor(private readonly authService: AuthService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (AUTH_APIS.every(api => !req.url.startsWith(api))) {
      return next.handle(req);
    }
    const authReq = req.clone({
      headers: req.headers.set('Authorization', 'Bearer ' + this.authService.accessToken)
    });
    return next.handle(authReq);
  }
}
