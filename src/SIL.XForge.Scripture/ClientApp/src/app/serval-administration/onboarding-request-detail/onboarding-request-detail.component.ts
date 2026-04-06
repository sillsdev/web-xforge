import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import {
  MatAccordion,
  MatExpansionPanel,
  MatExpansionPanelHeader,
  MatExpansionPanelTitle
} from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { saveAs } from 'file-saver';
import Papa from 'papaparse';
import { ProjectType } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { catchError, lastValueFrom, of, throwError } from 'rxjs';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OwnerComponent } from 'xforge-common/owner/owner.component';
import { RouterLinkDirective } from 'xforge-common/router-link.directive';
import { UserService } from 'xforge-common/user.service';
import { isPopulatedString } from '../../../type-utils';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { ParatextService } from '../../core/paratext.service';
import { DevOnlyComponent } from '../../shared/dev-only/dev-only.component';
import { JsonViewerComponent } from '../../shared/json-viewer/json-viewer.component';
import { MobileNotSupportedComponent } from '../../shared/mobile-not-supported/mobile-not-supported.component';
import { NoticeComponent } from '../../shared/notice/notice.component';
import { projectLabel } from '../../shared/utils';
import { normalizeLanguageCodeToISO639_3 } from '../../translate/draft-generation/draft-utils';
import {
  DraftingSignupFormData,
  ONBOARDING_REQUEST_RESOLUTION_OPTIONS,
  OnboardingRequest,
  OnboardingRequestResolutionKey,
  OnboardingRequestResolutionMetadata,
  OnboardingRequestService
} from '../../translate/draft-generation/onboarding-request.service';
import { OnboardingRequestAssigneeSelectComponent } from '../onboarding-request-assignee-select/onboarding-request-assignee-select.component';
import { ServalAdministrationService } from '../serval-administration.service';
import { formatBookListForSILNLP } from './draft-request-detail-utils';

/**
 * Component for displaying a single onboarding request's full details.
 * Accessible from the Serval Administration interface.
 */
@Component({
  selector: 'app-onboarding-request-detail',
  templateUrl: './onboarding-request-detail.component.html',
  styleUrls: ['./onboarding-request-detail.component.scss'],
  imports: [
    OnboardingRequestAssigneeSelectComponent,
    CommonModule,
    FormsModule,
    OwnerComponent,
    JsonViewerComponent,
    MatCardContent,
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatAccordion,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
    MatExpansionPanel,
    MatIconModule,
    MatProgressSpinner,
    RouterLinkDirective,
    MatButtonModule,
    DevOnlyComponent,
    MatFormFieldModule,
    MatInputModule,
    MobileNotSupportedComponent,
    NoticeComponent,
    MatTooltipModule,
    MatSelectModule
  ]
})
export class OnboardingRequestDetailComponent extends DataLoadingComponent implements OnInit {
  request?: OnboardingRequest;
  mainProjectDoc?: SFProjectProfileDoc;
  projectName?: string;
  projectDocs: Map<string, SFProjectProfileDoc> = new Map();
  projectNames: Map<string, string> = new Map();
  projectIds: Map<string, string> = new Map(); // Maps Paratext ID to SF project ID
  projectShortNames: Map<string, string> = new Map(); // Maps Paratext ID to project short name
  newCommentText: string = '';
  isAddingComment: boolean = false;
  resolutionOptions = ONBOARDING_REQUEST_RESOLUTION_OPTIONS;
  existingAssigneeIds: string[] = [];

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly servalAdministrationService: ServalAdministrationService,
    readonly onboardingRequestService: OnboardingRequestService,
    private readonly dialogService: DialogService,
    protected readonly userService: UserService,
    noticeService: NoticeService
  ) {
    super(noticeService, 'OnboardingRequestDetailComponent');
  }

  ngOnInit(): void {
    const requestId = this.route.snapshot.paramMap.get('id');
    if (requestId != null) {
      void this.loadRequest(requestId);
    } else {
      this.noticeService.showError('No request ID provided');
      void this.router.navigate(['/serval-administration'], { queryParams: { tab: 'onboarding-requests' } });
    }
  }

  private async loadRequest(requestId: string): Promise<void> {
    this.loadingStarted();
    try {
      void this.loadExistingAssignees();
      this.request = await this.onboardingRequestService.getRequestById(requestId);
      await this.loadProjectNames();
    } finally {
      this.loadingFinished();
    }
  }

  async loadExistingAssignees(): Promise<void> {
    this.existingAssigneeIds = await this.onboardingRequestService.getCurrentlyAssignedUserIds();
  }

  getStatus = this.onboardingRequestService.getStatus;

  async onAssigneeChange(newAssigneeId: string): Promise<void> {
    if (this.request == null) return;
    this.request = await this.onboardingRequestService.setAssignee(this.request.id, newAssigneeId);
  }

  async onResolutionChange(newResolution: OnboardingRequestResolutionKey | null): Promise<void> {
    if (this.request == null) return;
    this.request = await this.onboardingRequestService.setResolution(this.request.id, newResolution);
  }

  private async loadProjectNames(): Promise<void> {
    if (this.request == null) {
      return;
    }

    // Load the main project (submission.projectId is an SF project ID)
    this.mainProjectDoc = await this.servalAdministrationService.get(this.request.submission.projectId);
    if (this.mainProjectDoc?.data != null) {
      this.projectDocs.set(this.request.submission.projectId, this.mainProjectDoc);
      this.projectNames.set(this.request.submission.projectId, projectLabel(this.mainProjectDoc.data));
      this.projectIds.set(this.request.submission.projectId, this.mainProjectDoc.id);
      this.projectShortNames.set(this.request.submission.projectId, this.mainProjectDoc.data.shortName);
      this.projectName = projectLabel(this.mainProjectDoc.data);
    } else {
      this.projectNames.set(this.request.submission.projectId, this.request.submission.projectId);
      this.projectName = this.request.submission.projectId;
    }

    // Collect Paratext project IDs from form data (these are different from the main projectId)
    const paratextIds = new Set<string>();
    const formData = this.request.submission.formData;
    if (formData.sourceProjectA) paratextIds.add(formData.sourceProjectA);
    if (formData.sourceProjectB) paratextIds.add(formData.sourceProjectB);
    if (formData.sourceProjectC) paratextIds.add(formData.sourceProjectC);
    if (formData.draftingSourceProject) paratextIds.add(formData.draftingSourceProject);
    if (formData.backTranslationProject) paratextIds.add(formData.backTranslationProject);

    // Load each form data project's name and ID by querying by paratextId
    for (const paratextId of paratextIds) {
      const projectDoc = await this.servalAdministrationService.getByParatextId(paratextId);
      if (projectDoc?.data != null) {
        this.projectDocs.set(paratextId, projectDoc);
        this.projectNames.set(paratextId, projectLabel(projectDoc.data));
        this.projectIds.set(paratextId, projectDoc.id);
        this.projectShortNames.set(paratextId, projectDoc.data.shortName);
      } else {
        this.projectNames.set(paratextId, paratextId);
        // If we can't find the project, we can't create a valid link
      }
    }
  }

  /** Gets the project name for display, or falls back to Paratext ID if not loaded. */
  getProjectName(paratextId: string | undefined): string {
    if (paratextId == null) {
      return '';
    }
    return this.projectNames.get(paratextId) ?? paratextId;
  }

  /** Gets the SF project ID for a Paratext ID, for use in links. */
  getProjectId(paratextId: string | undefined): string | undefined {
    if (paratextId == null) {
      return undefined;
    }
    return this.projectIds.get(paratextId);
  }

  goBack(): void {
    void this.router.navigate(['/serval-administration'], { queryParams: { tab: 'onboarding-requests' } });
  }

  async downloadProject(id: string): Promise<void> {
    this.loadingStarted();

    // Get the project to retrieve its shortName
    const projectDoc = await this.servalAdministrationService.get(id);
    if (projectDoc?.data?.shortName == null) {
      this.noticeService.showError('Unable to retrieve project information.');
      this.loadingFinished();
      return;
    }

    // Download the zip file as a blob - this ensures we set the authorization header.
    const blob: Blob | undefined = await lastValueFrom(
      this.servalAdministrationService.downloadProject(id).pipe(
        catchError(err => {
          // Stop the loading, and throw the error
          this.loadingFinished();
          if (err.status === 404) {
            return of(undefined);
          } else {
            return throwError(() => err);
          }
        })
      )
    );

    // If the blob is undefined, display an error
    if (blob == null) {
      this.noticeService.showError('The project was never synced successfully and does not exist on disk.');
      return;
    }

    // Use the FileSaver API to download the file with the project's shortName
    saveAs(blob, projectDoc.data.shortName + '.zip');

    this.loadingFinished();
  }

  /** Gets the download button text based on whether the project is a resource or not. */
  getDownloadButtonText(paratextId: string | undefined): string {
    if (paratextId == null) {
      return 'Download';
    }
    return ParatextService.isResource(paratextId) ? 'Download DBL resource' : 'Download Paratext project';
  }

  getResolution(resolution: OnboardingRequestResolutionKey): OnboardingRequestResolutionMetadata {
    return this.onboardingRequestService.getResolution(resolution);
  }

  get isResolved(): boolean {
    return this.request?.resolution != null && this.request.resolution !== 'unresolved';
  }

  get formData(): DraftingSignupFormData {
    return this.request!.submission.formData;
  }

  /** Gets the title for the page showing the project short name and full name. */
  get pageTitle(): string {
    if (this.request == null) {
      return 'Onboarding Request';
    }
    const fullName = this.projectName;
    if (fullName != null) {
      return `Onboarding request for ${fullName}`;
    }
    return 'Onboarding Request';
  }

  formatBookList(value: number[] | undefined): string {
    return value == null ? '' : formatBookListForSILNLP(value);
  }

  getZipFileNames(): { projects: string[]; resources: string[] } {
    if (this.request == null) return { projects: [], resources: [] };

    const projectFilesNameSet = new Set<string>();
    const resourceFilesNamesSet = new Set<string>();
    const formData = this.request.submission.formData;

    // Helper function to add a zip file name if the project exists (for Paratext IDs)
    const addZipFileName = (paratextId: string | null | undefined): void => {
      if (paratextId == null) {
        return;
      }
      const sfProjectId = this.projectIds.get(paratextId);
      if (sfProjectId != null) {
        const shortName = this.projectShortNames.get(paratextId);
        if (shortName != null) {
          if (ParatextService.isResource(paratextId)) {
            resourceFilesNamesSet.add(`${shortName}.zip`);
          } else {
            projectFilesNameSet.add(`${shortName}.zip`);
          }
        }
      }
    };

    // Add the main project (submission.projectId is already an SF project ID)
    const mainProjectShortName = this.projectShortNames.get(this.request.submission.projectId);
    if (mainProjectShortName != null) {
      projectFilesNameSet.add(`${mainProjectShortName}.zip`);
    }

    // Add all source project zip file names
    addZipFileName(formData.sourceProjectA);
    addZipFileName(formData.sourceProjectB);
    addZipFileName(formData.sourceProjectC);
    addZipFileName(formData.draftingSourceProject);
    addZipFileName(formData.backTranslationProject);

    return { projects: Array.from(projectFilesNameSet), resources: Array.from(resourceFilesNamesSet) };
  }

  getAllProjectSFIds(options = { includeResources: true }): string[] {
    const mainProject = this.request?.submission.projectId;
    const sourceIds = [
      this.formData.sourceProjectA,
      this.formData.sourceProjectB,
      this.formData.sourceProjectC,
      this.formData.draftingSourceProject,
      this.formData.backTranslationProject
    ]
      .filter(s => s != null)
      .filter(s => options.includeResources || !ParatextService.isResource(s))
      .map(s => this.projectIds.get(s));
    return [...new Set([mainProject, ...sourceIds].filter(id => id != null))];
  }

  getSuggestedProjectOnboardingCommand(): string {
    const projects = this.getZipFileNames().projects;
    if (projects.length === 0) return '';
    return `poetry run python -m silnlp.common.onboard_project --copy-from $DOWNLOAD_FOLDER --extract-corpora --collect-verse-counts --wildebeest --datestamp ${projects.join(' ')}`;
  }

  getSuggestedResourceOnboardingCommand(): string {
    const resources = this.getZipFileNames().resources;
    if (resources.length === 0) return '';
    return `poetry run python -m silnlp.common.onboard_project --copy-from $DOWNLOAD_FOLDER --extract-corpora --collect-verse-counts --wildebeest ${resources.join(' ')}`;
  }

  /** Adds a comment to the current onboarding request. */
  async addComment(): Promise<void> {
    if (this.request == null || this.newCommentText == null || this.newCommentText.trim() === '') {
      return;
    }

    this.isAddingComment = true;
    try {
      const updatedRequest = await this.onboardingRequestService.addComment(
        this.request.id,
        this.newCommentText.trim()
      );

      // Update the local request object with the server response
      this.request = updatedRequest;

      // Clear the input
      this.newCommentText = '';

      this.noticeService.show('Comment added successfully');
    } catch (error) {
      console.error('Error adding comment:', error);
      this.noticeService.showError('Failed to add comment');
    } finally {
      this.isAddingComment = false;
    }
  }

  /** Deletes the current onboarding request after confirmation, then returns to the list. */
  async deleteRequest(): Promise<void> {
    if (this.request == null) {
      return;
    }

    const result = await this.dialogService.confirm(
      of('Are you sure you want to delete this onboarding request? This action cannot be undone.'),
      of('Delete')
    );

    if (!result) {
      return;
    }

    this.loadingStarted();
    try {
      await this.onboardingRequestService.deleteRequest(this.request.id);
      this.noticeService.show('Onboarding request deleted');
      void this.router.navigate(['/serval-administration'], { queryParams: { tab: 'onboarding-requests' } });
    } catch (error) {
      console.error('Error deleting onboarding request:', error);
      this.noticeService.showError('Failed to delete onboarding request');
    } finally {
      this.loadingFinished();
    }
  }

  async approveRequest(): Promise<void> {
    const shortName = this.projectShortNames.get(this.request?.submission.projectId ?? '');
    const result = await this.dialogService.confirm(
      of(`Mark request as approved and enable drafting on the ${shortName} project?`),
      of('Approve')
    );
    if (result && this.request != null) {
      this.loadingStarted();
      try {
        const request = await this.onboardingRequestService.approveRequest({
          requestId: this.request.id,
          sfProjectId: this.request.submission.projectId
        });
        this.request = request;
        this.noticeService.show('Onboarding request approved successfully');
      } finally {
        this.loadingFinished();
      }
    }
  }

  downloadProjects(): void {
    const projectIds = this.getAllProjectSFIds({ includeResources: false });
    for (const id of projectIds) {
      void this.downloadProject(id);
    }
  }

  downloadProjectsAndResources(): void {
    const projectIds = this.getAllProjectSFIds({ includeResources: true });
    for (const id of projectIds) {
      void this.downloadProject(id);
    }
  }

  exportData(): void {
    const tsvData = this.getDataForExport();
    const blob = new Blob([tsvData], { type: 'text/tab-separated-values;charset=utf-8;' });
    const shortName = this.projectShortNames.get(this.request?.submission.projectId ?? '') ?? 'onboarding_request';
    const fileName = `onboarding-request-${shortName ?? this.request?.id ?? 'unknown'}.tsv`;
    saveAs(blob, fileName);
  }

  get warnings(): string[] {
    const warnings: string[] = [];

    if (this.request?.resolution === 'approved' && this.mainProjectDoc?.data?.translateConfig.preTranslate !== true) {
      warnings.push('This request is marked as approved but drafting is not enabled on the project.');
    }

    const partnerOrg = this.request?.submission.formData.partnerOrganization;
    if (isPopulatedString(partnerOrg) && partnerOrg !== 'none' && this.request?.resolution !== 'outsourced') {
      warnings.push('This request has a partner organization specified but is not marked as outsourced.');
    }

    const projectIsoCode: string | undefined = this.mainProjectDoc?.data?.writingSystem.tag;
    const userSpecifiedIsoCode: string | undefined = this.normalizeUserInputIsoCode(
      this.request?.submission.formData.translationLanguageIsoCode ?? ''
    );
    if (this.doLanguageCodesExistAndDiffer(projectIsoCode, userSpecifiedIsoCode)) {
      warnings.push(
        `The project language code (${projectIsoCode}) is not identical to the code specified in the form (${userSpecifiedIsoCode}).`
      );
    }

    // Check if back translation is specified, but isn't marked as a back translation, and isn't enabled for drafting
    const backTranslationProjectId = this.request?.submission.formData.backTranslationProject;
    const backTranslationProject =
      backTranslationProjectId == null ? null : this.projectDocs.get(backTranslationProjectId);
    const backTranslationTranslateConfig = backTranslationProject?.data?.translateConfig;
    if (
      backTranslationTranslateConfig != null &&
      backTranslationTranslateConfig.projectType !== ProjectType.BackTranslation &&
      backTranslationTranslateConfig.preTranslate !== true
    ) {
      warnings.push(
        'The back translation project specified is not marked as a back translation project in Paratext, and does not have draft generation enabled. You will need to enable it if you want the user to be able to generate back translation drafts.'
      );
    }

    // Verify language code the user specified for the back translation is the same as the back translation's language code
    const userSpecifiedBackTranslationIsoCode = this.normalizeUserInputIsoCode(
      this.request?.submission.formData.backTranslationLanguageIsoCode ?? ''
    );
    const backTranslationProjectIsoCode = backTranslationProject?.data?.writingSystem.tag;
    if (this.doLanguageCodesExistAndDiffer(userSpecifiedBackTranslationIsoCode, backTranslationProjectIsoCode)) {
      warnings.push(
        `The language code specified in the form for the back translation (${userSpecifiedBackTranslationIsoCode}) is not identical to the back translation project's language code (${backTranslationProjectIsoCode}).`
      );
    }

    if (this.doLanguageCodesExistAndAreEquivalent(backTranslationProjectIsoCode, projectIsoCode)) {
      warnings.push(
        `The language code specified in the back translation project (${backTranslationProjectIsoCode}) is equivalent to the project language code (${projectIsoCode}).`
      );
    }

    // Find projects that failed their last sync
    for (const [id, projectDoc] of this.projectDocs.entries()) {
      if (projectDoc.data?.sync.lastSyncSuccessful === false) {
        const projectName = this.projectNames.get(id) ?? id;
        warnings.push(`The project "${projectName}" failed to sync successfully the last time it was synced.`);
      }
    }

    return warnings;
  }

  /** Returns true if both arguments are non-empty strings that normalize to different ISO 639-3 codes */
  private doLanguageCodesExistAndDiffer(code1: string | undefined, code2: string | undefined): boolean {
    if (!isPopulatedString(code1) || !isPopulatedString(code2)) return false;
    return normalizeLanguageCodeToISO639_3(code1) !== normalizeLanguageCodeToISO639_3(code2);
  }

  /** Returns true if both arguments are non-empty strings that normalize to the same ISO 639-3 code */
  private doLanguageCodesExistAndAreEquivalent(code1: string | undefined, code2: string | undefined): boolean {
    if (!isPopulatedString(code1) || !isPopulatedString(code2)) return false;
    return normalizeLanguageCodeToISO639_3(code1) === normalizeLanguageCodeToISO639_3(code2);
  }

  /**
   * Normalizes user input by trimming and converting to lowercase. It has been observed in production that users often
   * input the code in all caps.
   */
  private normalizeUserInputIsoCode(code: string): string {
    return code.trim().toLowerCase();
  }

  async copyBookList(books: number[] | undefined): Promise<void> {
    const text: string = this.formatBookList(books);
    await this.copyToClipboard(text);
  }

  async copyToClipboard(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
    this.noticeService.show('Copied to clipboard');
  }

  /**
   * Data is pulled from the DOM rather than directly constructing the data in order to maintain consistency between
   * exported data and displayed data. It may have been the wrong call but it kept things simpler.
   */
  private getDataForExport(): string {
    const pairs = [
      ...document.querySelectorAll('app-onboarding-request-detail .info-row:not(.skip-in-data-export)')
    ].map(e => [e.querySelector('.label')?.textContent, e.querySelector('.value')?.textContent]);
    pairs.push(['Additional Comments:', this.request?.submission.formData.additionalComments ?? '']);

    return Papa.unparse(pairs, { delimiter: '\t' });
  }
}
