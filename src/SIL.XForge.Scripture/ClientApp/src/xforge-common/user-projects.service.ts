import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { CheckingQuestionsService } from '../app/checking/checking/checking-questions.service';
import { NoteThreadDoc } from '../app/core/models/note-thread-doc';
import { QuestionDoc } from '../app/core/models/question-doc';
import { SFProjectDoc } from '../app/core/models/sf-project-doc';
import { SFProjectProfileDoc } from '../app/core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../app/core/models/sf-project-user-config-doc';
import { TextDoc, TextDocId } from '../app/core/models/text-doc';
import { PermissionsService } from '../app/core/permissions.service';
import { SFProjectService } from '../app/core/sf-project.service';
import { compareProjectsForSorting } from '../app/shared/utils';
import { environment } from '../environments/environment';
import { AuthService, LoginResult } from './auth.service';
import { RealtimeQuery } from './models/realtime-query';
import { UserDoc } from './models/user-doc';
import { SubscriptionDisposable } from './subscription-disposable';
import { UserService } from './user.service';

/** Service that maintains an up-to-date set of SF project docs that the current user has access to. */
@Injectable({
  providedIn: 'root'
})
export class SFUserProjectsService extends SubscriptionDisposable {
  private projectDocs: Map<string, SFProjectProfileDoc> = new Map();
  private _projectDocs$ = new BehaviorSubject<SFProjectProfileDoc[] | undefined>(undefined);
  private sfProjectDocs: Map<string, SFProjectDoc> = new Map();
  private _sfProjectDocs$ = new BehaviorSubject<SFProjectDoc[] | undefined>(undefined);
  private userConfigDocs: Map<string, SFProjectUserConfigDoc> = new Map();
  private _userConfigDocs$ = new BehaviorSubject<SFProjectUserConfigDoc[] | undefined>(undefined);
  private projectTexts: Map<string, TextDoc> = new Map();
  private _projectTexts$ = new BehaviorSubject<TextDoc[] | undefined>(undefined);
  private projectQuestions: Map<string, RealtimeQuery<QuestionDoc>> = new Map();
  private _projectQuestions$ = new BehaviorSubject<RealtimeQuery<QuestionDoc>[] | undefined>(undefined);
  private projectNotes: Map<string, RealtimeQuery<NoteThreadDoc>> = new Map();
  private _projectNotes$ = new BehaviorSubject<RealtimeQuery<NoteThreadDoc>[] | undefined>(undefined);

  constructor(
    private readonly userService: UserService,
    private readonly projectService: SFProjectService,
    private readonly authService: AuthService,
    private readonly permissionsService: PermissionsService,
    private readonly checkingQuestionsService: CheckingQuestionsService
  ) {
    super();
    this.setup();
  }

  /** List of SF project docs the user is on. Or undefined if the information is not yet available. */
  get projectDocs$(): Observable<SFProjectProfileDoc[] | undefined> {
    return this._projectDocs$;
  }

  get sfProjectDocs$(): Observable<SFProjectDoc[] | undefined> {
    return this._sfProjectDocs$;
  }

  get projectTexts$(): Observable<TextDoc[] | undefined> {
    return this._projectTexts$;
  }

  get userConfigDocs$(): Observable<SFProjectUserConfigDoc[] | undefined> {
    return this._userConfigDocs$;
  }

  get projectQuestions$(): Observable<RealtimeQuery<QuestionDoc>[] | undefined> {
    return this._projectQuestions$;
  }

  get projectNotes$(): Observable<RealtimeQuery<NoteThreadDoc>[] | undefined> {
    return this._projectNotes$;
  }

  private async setup(): Promise<void> {
    this.subscribe(this.authService.loggedInState$, async (state: LoginResult) => {
      if (!state.loggedIn) {
        return;
      }
      const userDoc = await this.userService.getCurrentUser();
      this.updateProjectList(userDoc);
      this.subscribe(userDoc.remoteChanges$, () => this.updateProjectList(userDoc));
    });
  }

  /** Updates our provided set of SF project docs for the current user based on the userdoc's list of SF projects the
   * user is on. */
  private async updateProjectList(userDoc: UserDoc): Promise<void> {
    const currentProjectIds = userDoc.data!.sites[environment.siteId].projects;
    let removedProjectsCount = 0;
    for (const [id, projectDoc] of this.projectDocs) {
      if (!currentProjectIds.includes(id)) {
        removedProjectsCount++;
        projectDoc.dispose();
        this.projectDocs.delete(id);
      }
    }

    for (const [id, configDoc] of this.userConfigDocs) {
      if (!currentProjectIds.includes(id)) {
        configDoc.dispose();
        this.userConfigDocs.delete(id);
      }
    }

    const docFetchPromises: Promise<SFProjectProfileDoc>[] = [];
    const projectFetchPromises: Promise<SFProjectDoc>[] = [];
    const configFetchPromises: Promise<SFProjectUserConfigDoc>[] = [];
    for (const id of currentProjectIds) {
      if (!this.projectDocs.has(id)) {
        docFetchPromises.push(this.projectService.getProfile(id));
      }
      if (!this.sfProjectDocs.has(id)) {
        projectFetchPromises.push(this.projectService.get(id));
      }
      if (!this.projectDocs.has(id)) {
        configFetchPromises.push(this.projectService.getUserConfig(id, this.userService.currentUserId));
      }
    }

    if (removedProjectsCount === 0 && docFetchPromises.length === 0) {
      if (currentProjectIds.length === 0) {
        // Provide an initial empty set of projects if the user has no projects.
        this._projectDocs$.next([]);
        this._sfProjectDocs$.next([]);
        this._userConfigDocs$.next([]);
        this._projectTexts$.next([]);
        this._projectNotes$.next([]);
        this._projectQuestions$.next([]);
      }
      return;
    }

    for (const newProjectDoc of await Promise.all(docFetchPromises)) {
      this.projectDocs.set(newProjectDoc.id, newProjectDoc);
    }
    const projects = Array.from(this.projectDocs.values()).sort((a, b) =>
      a.data == null || b.data == null ? 0 : compareProjectsForSorting(a.data, b.data)
    );

    this._projectDocs$.next(projects);

    for (const newSFProjectDoc of await Promise.all(projectFetchPromises)) {
      this.projectDocs.set(newSFProjectDoc.id, newSFProjectDoc);
    }
    const sfProjects = Array.from(this.sfProjectDocs.values()).sort((a, b) =>
      a.data == null || b.data == null ? 0 : compareProjectsForSorting(a.data, b.data)
    );

    this._sfProjectDocs$.next(sfProjects);

    for (const newProjectConfig of await Promise.all(configFetchPromises)) {
      this.userConfigDocs.set(newProjectConfig.id, newProjectConfig);
    }
    const projectConfigs = Array.from(this.userConfigDocs.values());
    this._userConfigDocs$.next(projectConfigs);

    for (const project of projects) {
      if (project?.data == null) continue;
      await this.loadProjectTextsNotesAndQuestions(project);
    }

    const textDocs = Array.from(this.projectTexts.values());
    this._projectTexts$.next(textDocs);
    const questions = Array.from(this.projectQuestions.values());
    this._projectQuestions$.next(questions);
    const notes = Array.from(this.projectNotes.values());
    this._projectNotes$.next(notes);
  }

  private async loadProjectTextsNotesAndQuestions(project: SFProjectProfileDoc): Promise<void> {
    const books = project.data?.texts;
    if (books != null) {
      for (const book of books) {
        for (const chapter of book.chapters) {
          const textDocId = new TextDocId(project.id, book.bookNum, chapter.number);
          if (await this.permissionsService.canAccessText(textDocId)) {
            const textDoc = await this.projectService.getText(textDocId);
            this.projectTexts.set(textDocId.projectId, textDoc);
          }

          const projectProfile = this.projectDocs.get(project.id);

          if (projectProfile != null && (await this.permissionsService.canAccessTranslate(project))) {
            const noteThreads = await this.projectService.queryNoteThreads(project.id, book.bookNum, chapter.number);
            this.projectNotes.set(project.id, noteThreads);
          }

          if (project != null && (await this.permissionsService.canAccessCommunityChecking(project))) {
            const questions = await this.checkingQuestionsService.queryQuestions(project.id, {
              bookNum: book.bookNum,
              chapterNum: chapter.number
            });
            this.projectQuestions.set(project.id, questions);
          }
        }
      }
    }
  }
}
