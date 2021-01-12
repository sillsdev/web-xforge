import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from 'xforge-common/auth.service';
import { ParatextProject } from './models/paratext-project';

export interface SelectableProject {
  name: string;
  paratextId: string;
}

@Injectable({
  providedIn: 'root'
})
export class ParatextService {
  constructor(private readonly http: HttpClient, private readonly authService: AuthService) {}

  linkParatext(returnUrl: string): void {
    this.authService.linkParatext(returnUrl);
  }

  /** Fetch projects and resources in parallel */
  getProjectsAndResources(): Promise<[ParatextProject[] | undefined, SelectableProject[] | undefined]> {
    return Promise.all<ParatextProject[] | undefined, SelectableProject[] | undefined>([
      this.getProjects(),
      this.getResources()
    ]);
  }

  getParatextUsername(): Observable<string | undefined> {
    return this.http
      .get<string | null>('paratext-api/username', { headers: this.getHeaders() })
      .pipe(map(r => r ?? undefined));
  }

  private getProjects(): Promise<ParatextProject[] | undefined> {
    return this.http
      .get<ParatextProject[] | undefined>('paratext-api/projects', { headers: this.getHeaders() })
      .toPromise();
  }

  private getResources(): Promise<SelectableProject[] | undefined> {
    return this.http
      .get<{ [key: string]: string }[]>('paratext-api/resources', { headers: this.getHeaders() })
      .pipe(map(r => (r ? Object.keys(r).map(key => ({ paratextId: key, name: r[key] })) : undefined)))
      .toPromise();
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json'
    });
  }
}
