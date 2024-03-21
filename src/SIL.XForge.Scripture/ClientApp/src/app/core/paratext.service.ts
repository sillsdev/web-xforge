import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from 'xforge-common/auth.service';
import { Snapshot } from 'xforge-common/models/snapshot';
import { ParatextProject } from './models/paratext-project';

/**
 * A point-in-time revision of a document.
 */
export interface Revision {
  /** The date and time of the revision in UTC. */
  key: string;
  /** A brief summary of the revision. */
  value: string;
}

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

  async getRevisions(projectId: string, book: string, chapter: number): Promise<Revision[] | undefined> {
    return await this.http
      .get<Revision[] | undefined>(`paratext-api/history/revisions/${projectId}_${book}_${chapter}_target`, {
        headers: this.headers
      })
      .toPromise();
  }

  async getSnapshot(
    projectId: string,
    book: string,
    chapter: number,
    timestamp: string
  ): Promise<Snapshot<TextData> | undefined> {
    return await this.http
      .get<Snapshot<TextData>>(
        `paratext-api/history/snapshot/${projectId}_${book}_${chapter}_target?timestamp=${timestamp}`,
        {
          headers: this.headers
        }
      )
      .toPromise();
  }

  /** True if a Paratext project has a corresponding project in SF, whether or not any SF user is connected to the
   * project. */
  isParatextProjectInSF(project: ParatextProject): boolean {
    return project.projectId != null;
  }

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json'
    });
  }
}
