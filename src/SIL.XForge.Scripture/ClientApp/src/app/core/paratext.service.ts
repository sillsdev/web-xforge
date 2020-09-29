import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from 'xforge-common/auth.service';
import { ParatextProject } from './models/paratext-project';

@Injectable({
  providedIn: 'root'
})
export class ParatextService {
  constructor(private readonly http: HttpClient, private readonly authService: AuthService) {}

  linkParatext(returnUrl: string): void {
    this.authService.linkParatext(returnUrl);
  }

  /** Get projects the user has access to. */
  getProjects(): Observable<ParatextProject[] | undefined> {
    return this.http
      .get<ParatextProject[]>('paratext-api/projects', { headers: this.getHeaders() })
      .pipe(map(r => (r == null ? undefined : r)));
  }

  getParatextUsername(): Observable<string | undefined> {
    return this.http
      .get<string>('paratext-api/username', { headers: this.getHeaders() })
      .pipe(map(r => (r == null ? undefined : r)));
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json'
    });
  }
}
