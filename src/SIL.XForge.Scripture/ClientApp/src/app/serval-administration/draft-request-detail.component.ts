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
import { ActivatedRoute, Router } from '@angular/router';
import { Canon } from '@sillsdev/scripture';
import { saveAs } from 'file-saver';
import Papa from 'papaparse';
import { ProjectType } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { catchError, lastValueFrom, of, throwError } from 'rxjs';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OwnerComponent } from 'xforge-common/owner/owner.component';
import { RouterLinkDirective } from 'xforge-common/router-link.directive';
import { isPopulatedString } from '../../type-utils';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { ParatextService } from '../core/paratext.service';
import { DevOnlyComponent } from '../shared/dev-only/dev-only.component';
import { JsonViewerComponent } from '../shared/json-viewer/json-viewer.component';
import { MobileNotSupportedComponent } from '../shared/mobile-not-supported/mobile-not-supported.component';
import { NoticeComponent } from '../shared/notice/notice.component';
import { projectLabel } from '../shared/utils';
import { normalizeLanguageCodeToISO639_3 } from '../translate/draft-generation/draft-utils';
import {
  DraftingSignupFormData,
  DraftRequestResolutionKey,
  DraftRequestResolutionMetadata,
  OnboardingRequest,
  OnboardingRequestService
} from '../translate/draft-generation/onboarding-request.service';
import { ServalAdministrationService } from './serval-administration.service';

/**
 * Component for displaying a single draft request's full details.
 * Accessible from the Serval Administration interface.
 */
@Component({
  selector: 'app-draft-request-detail',
  templateUrl: './draft-request-detail.component.html',
  styleUrls: ['./draft-request-detail.component.scss'],
  imports: [
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
    NoticeComponent
  ]
})
export class DraftRequestDetailComponent extends DataLoadingComponent implements OnInit {
  request?: OnboardingRequest;
  mainProjectDoc?: SFProjectProfileDoc;
  projectName?: string;
  projectDocs: Map<string, SFProjectProfileDoc> = new Map();
  projectNames: Map<string, string> = new Map();
  projectIds: Map<string, string> = new Map(); // Maps Paratext ID to SF project ID
  projectShortNames: Map<string, string> = new Map(); // Maps Paratext ID to project short name
  newCommentText: string = '';
  isAddingComment: boolean = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly servalAdministrationService: ServalAdministrationService,
    private readonly onboardingRequestService: OnboardingRequestService,
    private readonly dialogService: DialogService,
    protected readonly noticeService: NoticeService
  ) {
    super(noticeService);
  }

  ngOnInit(): void {
    const requestId = this.route.snapshot.paramMap.get('id');
    if (requestId != null) {
      void this.loadRequest(requestId);
    } else {
      this.noticeService.showError('No request ID provided');
      void this.router.navigate(['/serval-administration'], { queryParams: { tab: 'draft-requests' } });
    }
  }

  private async loadRequest(requestId: string): Promise<void> {
    this.loadingStarted();
    try {
      this.request = await this.onboardingRequestService.getRequestById(requestId);
      await this.loadProjectNames();
    } finally {
      this.loadingFinished();
    }
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
    void this.router.navigate(['/serval-administration'], { queryParams: { tab: 'draft-requests' } });
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

  getResolution(resolution: DraftRequestResolutionKey): DraftRequestResolutionMetadata {
    return this.onboardingRequestService.getResolution(resolution);
  }

  get isResolved(): boolean {
    return this.request?.resolution != null && this.request.resolution !== 'unresolved';
  }

  getStatus = this.onboardingRequestService.getStatus;

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
    return value?.map(b => Canon.bookNumberToId(b)).join(';') ?? '';
  }

  getZipFileNames(): string[] {
    if (this.request == null) {
      return [];
    }

    const zipFileNamesSet = new Set<string>();
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
          zipFileNamesSet.add(`${shortName}.zip`);
        }
      }
    };

    // Add the main project (submission.projectId is already an SF project ID)
    const mainProjectShortName = this.projectShortNames.get(this.request.submission.projectId);
    if (mainProjectShortName != null) {
      zipFileNamesSet.add(`${mainProjectShortName}.zip`);
    }

    // Add all source project zip file names
    addZipFileName(formData.sourceProjectA);
    addZipFileName(formData.sourceProjectB);
    addZipFileName(formData.sourceProjectC);
    addZipFileName(formData.draftingSourceProject);
    addZipFileName(formData.backTranslationProject);

    return Array.from(zipFileNamesSet);
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

  /** Gets the suggested onboarding command based on all downloadable projects. */
  getSuggestedCommand(): string {
    const zipFileNames = this.getZipFileNames();
    if (zipFileNames.length === 0) {
      return '';
    }
    return `poetry run python -m silnlp.common.onboard_project --copy-from $DOWNLOAD_FOLDER --extract-corpora --collect-verse-counts --wildebeest --datestamp ${zipFileNames.join(' ')}`;
  }

  /** Adds a comment to the current draft request. */
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

  /** Deletes the current draft request after confirmation, then returns to the list. */
  async deleteRequest(): Promise<void> {
    if (this.request == null) {
      return;
    }

    const result = await this.dialogService.confirm(
      of('Are you sure you want to delete this draft request? This action cannot be undone.'),
      of('Delete')
    );

    if (!result) {
      return;
    }

    this.loadingStarted();
    try {
      await this.onboardingRequestService.deleteRequest(this.request.id);
      this.noticeService.show('Draft request deleted');
      void this.router.navigate(['/serval-administration'], { queryParams: { tab: 'draft-requests' } });
    } catch (error) {
      console.error('Error deleting draft request:', error);
      this.noticeService.showError('Failed to delete draft request');
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

    const projectISOCode: string | undefined = this.mainProjectDoc?.data?.writingSystem.tag;
    const formISOCode: string | undefined = this.request?.submission.formData.translationLanguageIsoCode?.trim();
    if (
      isPopulatedString(projectISOCode) &&
      isPopulatedString(formISOCode) &&
      normalizeLanguageCodeToISO639_3(projectISOCode) !== normalizeLanguageCodeToISO639_3(formISOCode)
    ) {
      warnings.push(
        `The project language code (${projectISOCode}) is not identical to the code specified in the form (${formISOCode}).`
      );
    }

    // Check if back translation is specified, but isn't marked as a back translation, and isn't enabled for drafting
    const backTranslationProjectId = this.request?.submission.formData.backTranslationProject;
    const backTranslationTranslateConfig = this.projectDocs.get(backTranslationProjectId ?? '')?.data?.translateConfig;
    if (
      backTranslationTranslateConfig != null &&
      backTranslationTranslateConfig.projectType !== ProjectType.BackTranslation &&
      backTranslationTranslateConfig.preTranslate !== true
    ) {
      warnings.push(
        'The back translation project specified is not marked as a back translation project in Paratext, and does not have draft generation enabled. You will need to enable it if you want the user to be able to generate back translation drafts.'
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

  /**
   * Data is pulled from the DOM rather than directly constructing the data in order to maintain consistency between
   * exported data and displayed data. It may have been the wrong call but it kept things simpler.
   */
  private getDataForExport(): string {
    const pairs = [...document.querySelectorAll('app-draft-request-detail .info-row:not(.skip-in-data-export)')].map(
      e => [e.querySelector('.label')?.textContent, e.querySelector('.value')?.textContent]
    );
    pairs.push(['Additional Comments:', this.request?.submission.formData.additionalComments ?? '']);

    return Papa.unparse(pairs, { delimiter: '\t' });
  }
}
