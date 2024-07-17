import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { firstValueFrom, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from 'xforge-common/auth.service';
import { Snapshot } from 'xforge-common/models/snapshot';
import { PARATEXT_API_NAMESPACE } from 'xforge-common/url-constants';
import { ParatextProject } from './models/paratext-project';
import { TextDocSource } from './models/text-doc';

/** Length of paratext ids for DBL resources. */
export const RESOURCE_IDENTIFIER_LENGTH = 16;

/**
 * A point-in-time revision of a document.
 */
export interface Revision {
  /**
   * The source of the revision.
   */
  source?: TextDocSource;

  /** The date and time of the revision in UTC. */
  timestamp: string;

  /**
   * The user who created the revision.
   * This will null if the user is unknown.
   */
  userId?: string;
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
  /**
   * Determines if a Paratext id refers to a resource.
   * @param paratextId The Paratext identifier.
   * @returns True if the Paratext identifier is a resource identifier.
   */
  static isResource(paratextId: string): boolean {
    return paratextId.length === RESOURCE_IDENTIFIER_LENGTH;
  }

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
    return firstValueFrom(
      this.http.get<ParatextProject[] | undefined>(`${PARATEXT_API_NAMESPACE}/projects`, { headers: this.headers })
    );
  }

  getResources(): Promise<SelectableProject[] | undefined> {
    return firstValueFrom(
      this.http.get<{ [id: string]: [shortName: string, name: string] }>(`${PARATEXT_API_NAMESPACE}/resources`, {
        headers: this.headers
      })
    ).then(result =>
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
    return await firstValueFrom(
      this.http.get<Revision[] | undefined>(
        `${PARATEXT_API_NAMESPACE}/history/revisions/${projectId}_${book}_${chapter}_target`,
        {
          headers: this.headers
        }
      )
    );
  }

  async getSnapshot(
    projectId: string,
    book: string,
    chapter: number,
    timestamp: string
  ): Promise<Snapshot<TextData> | undefined> {
    return await firstValueFrom(
      this.http.get<Snapshot<TextData>>(
        `${PARATEXT_API_NAMESPACE}/history/snapshot/${projectId}_${book}_${chapter}_target?timestamp=${timestamp}`,
        {
          headers: this.headers
        }
      )
    );
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
