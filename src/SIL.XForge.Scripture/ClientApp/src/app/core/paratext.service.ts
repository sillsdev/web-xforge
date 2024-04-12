import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from 'xforge-common/auth.service';
import { Snapshot } from 'xforge-common/models/snapshot';
import { PARATEXT_API_NAMESPACE } from 'xforge-common/url-constants';
import { ParatextProject } from './models/paratext-project';

/** Length of paratext ids for DBL resources. */
export const RESOURCE_IDENTIFIER_LENGTH = 16;

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
      .get<string | null>(`${PARATEXT_API_NAMESPACE}/username`, { headers: this.headers })
      .pipe(map(r => r ?? undefined));
  }

  getProjects(): Promise<ParatextProject[] | undefined> {
    return this.http
      .get<ParatextProject[] | undefined>(`${PARATEXT_API_NAMESPACE}/projects`, { headers: this.headers })
      .toPromise();
  }

  getResources(): Promise<SelectableProject[] | undefined> {
    return this.http
      .get<{ [id: string]: [shortName: string, name: string] }>(`${PARATEXT_API_NAMESPACE}/resources`, {
        headers: this.headers
      })
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
      .get<Revision[] | undefined>(
        `${PARATEXT_API_NAMESPACE}/history/revisions/${projectId}_${book}_${chapter}_target`,
        {
          headers: this.headers
        }
      )
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
        `${PARATEXT_API_NAMESPACE}/history/snapshot/${projectId}_${book}_${chapter}_target?timestamp=${timestamp}`,
        {
          headers: this.headers
        }
      )
      .toPromise();
  }

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json'
    });
  }

  /**
   * Determines if a Paratext id refers to a resource.
   * @param paratextId The Paratext identifier.
   * @returns True if the Paratext identifier is a resource identifier.
   */
  static isResource(paratextId: string): boolean {
    return paratextId.length === RESOURCE_IDENTIFIER_LENGTH;
  }
}
