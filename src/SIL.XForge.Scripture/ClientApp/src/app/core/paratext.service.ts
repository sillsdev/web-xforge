import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from 'xforge-common/auth.service';
import { ParatextProject } from './models/paratext-project';

export interface SelectableProject {
  name: string;
  shortName: string;
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

  getParatextUsername(): Observable<string | undefined> {
    return this.http
      .get<string | null>('paratext-api/username', { headers: this.headers })
      .pipe(map(r => r ?? undefined));
  }

  getProjects(): Promise<ParatextProject[] | undefined> {
    return this.http.get<ParatextProject[] | undefined>('paratext-api/projects', { headers: this.headers }).toPromise();
  }

  getResources(): Promise<SelectableProject[] | undefined> {
    return this.http
      .get<{ [id: string]: [shortName: string, name: string] }>('paratext-api/resources', { headers: this.headers })
      .toPromise()
      .then(result =>
        result == null
          ? undefined
          : Object.entries(result).map(([paratextId, [shortName, projectName]]) => ({
              paratextId,
              shortName,
              name: projectName
            }))
      );
  }

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json'
    });
  }
}
