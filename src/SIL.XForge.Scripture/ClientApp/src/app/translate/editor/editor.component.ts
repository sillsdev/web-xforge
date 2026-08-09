import { Dir } from '@angular/cdk/bidi';
import { BreakpointObserver } from '@angular/cdk/layout';
import { ComponentType } from '@angular/cdk/portal';
import { AsyncPipe, KeyValuePipe, NgClass } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  QueryList,
  TemplateRef,
  ViewChild,
  ViewChildren
} from '@angular/core';
import { FormsModule, ReactiveFormsModule, UntypedFormControl, Validators } from '@angular/forms';
import { MatBottomSheet, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButton, MatIconButton, MatMiniFabButton } from '@angular/material/button';
import { MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatTooltip } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon, VerseRef } from '@sillsdev/scripture';
import { AngularSplitModule } from 'angular-split';
import { isEqual } from 'lodash-es';
import { Bounds, Delta, Range } from 'quill';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { EditorTabGroupType, editorTabGroupTypes } from 'realtime-server/lib/esm/scriptureforge/models/editor-tab';
import { EditorTabPersistData } from 'realtime-server/lib/esm/scriptureforge/models/editor-tab-persist-data';
import { Note } from 'realtime-server/lib/esm/scriptureforge/models/note';
import { BIBLICAL_TERM_TAG_ICON, NoteTag } from 'realtime-server/lib/esm/scriptureforge/models/note-tag';
import {
  getNoteThreadDocId,
  NoteConflictType,
  NoteStatus,
  NoteThread,
  NoteType
} from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { ParatextUserProfile } from 'realtime-server/lib/esm/scriptureforge/models/paratext-user-profile';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { isParatextRole, SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TextAnchor } from 'realtime-server/lib/esm/scriptureforge/models/text-anchor';
import { TextType } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { Chapter, TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { fromVerseRef } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { DeltaOperation } from 'rich-text';
import {
  asyncScheduler,
  BehaviorSubject,
  combineLatest,
  firstValueFrom,
  fromEvent,
  lastValueFrom,
  merge,
  Observable,
  of,
  Subject,
  Subscription
} from 'rxjs';
import { distinctUntilChanged, filter, map, startWith, switchMap, take, tap, throttleTime } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { BlurOnClickDirective } from 'xforge-common/blur-on-click.directive';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { FontService } from 'xforge-common/font.service';
import { I18nService } from 'xforge-common/i18n.service';
import { Breakpoint, MediaBreakpointService } from 'xforge-common/media-breakpoints/media-breakpoint.service';
import { LocaleDirection } from 'xforge-common/models/i18n-locale';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { filterNullish, quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { stripHtml } from 'xforge-common/util/string-util';
import { browserLinks, getLinkHTML, isBlink, issuesEmailTemplate, objectId } from 'xforge-common/utils';
import { XFValidators } from 'xforge-common/xfvalidators';
import { environment } from '../../../environments/environment';
import { isString } from '../../../type-utils';
import { defaultNoteThreadIcon, NoteThreadDoc, NoteThreadIcon } from '../../core/models/note-thread-doc';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SF_DEFAULT_TRANSLATE_SHARE_ROLE } from '../../core/models/sf-project-role-info';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { TextDocId } from '../../core/models/text-doc';
import { Revision } from '../../core/paratext.service';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';
import { TextDocService } from '../../core/text-doc.service';
import { BuildDto } from '../../machine-api/build-dto';
import { BookChapterChooserComponent } from '../../shared/book-chapter-chooser/book-chapter-chooser.component';
import { CopyrightBannerComponent } from '../../shared/copyright-banner/copyright-banner.component';
import { NoticeComponent } from '../../shared/notice/notice.component';
import { expectedBookChapters } from '../../shared/progress-service/progress.service';
import {
  FlatTabInfo,
  TabAddRequestService,
  TabFactoryService,
  TabGroup,
  TabMenuService,
  TabStateService
} from '../../shared/sf-tab-group';
import { TabGroupComponent } from '../../shared/sf-tab-group/tab-group.component';
import { TabHeaderDirective } from '../../shared/sf-tab-group/tab-header/tab-header.directive';
import { TabComponent } from '../../shared/sf-tab-group/tab/tab.component';
import { ShareButtonComponent } from '../../shared/share/share-button.component';
import { getRetainCount } from '../../shared/text/quill-util';
import { Segment } from '../../shared/text/segment';
import { TextDocIdPipe } from '../../shared/text/text-doc-id.pipe';
import {
  EmbedsByVerse,
  FeaturedVerseRefInfo,
  PresenceData,
  RemotePresences,
  TextComponent
} from '../../shared/text/text.component';
import {
  booksFromScriptureRange,
  canInsertNote,
  formatFontSizeToRems,
  getUnsupportedTags,
  threadIdFromMouseEvent,
  XmlUtils
} from '../../shared/utils';
import {
  getVerseRefFromSegmentRef,
  RIGHT_TO_LEFT_MARK,
  VERSE_REGEX,
  verseRefFromMouseEvent
} from '../../shared/verse-utils';
import { BiblicalTermsComponent } from '../biblical-terms/biblical-terms.component';
import { DraftGenerationService } from '../draft-generation/draft-generation.service';
import { DraftOptionsService } from '../draft-generation/draft-options.service';
import { EditorDraftComponent } from './editor-draft/editor-draft.component';
import { EditorHistoryComponent } from './editor-history/editor-history.component';
import { EditorHistoryService } from './editor-history/editor-history.service';
import { EditorResourceComponent } from './editor-resource/editor-resource.component';
import { LynxInsightStateService } from './lynx/insights/lynx-insight-state.service';
import { LynxInsightsPanelComponent } from './lynx/insights/lynx-insights-panel/lynx-insights-panel.component';
import { MultiCursorViewer, MultiViewerComponent } from './multi-viewer/multi-viewer.component';
import { NoteDialogComponent, NoteDialogData, NoteDialogResult } from './note-dialog/note-dialog.component';
import { SaveNoteParameters } from './save-note-parameters';
import { EditorTabAddRequestService } from './tabs/editor-tab-add-request.service';
import { EditorTabFactoryService } from './tabs/editor-tab-factory.service';
import { EditorTabMenuService } from './tabs/editor-tab-menu.service';
import { EditorTabPersistenceService } from './tabs/editor-tab-persistence.service';
import { EditorTabInfo } from './tabs/editor-tabs.types';
import {
  TranslatorSettingsDialogComponent,
  TranslatorSettingsDialogData
} from './translator-settings-dialog.component';

const UNSUPPORTED_LANGUAGE_CODES = [
  'ko',
  'kor',
  'ja',
  'jpn',
  'cmn',
  'czh',
  'cdo',
  'cjy',
  'cmn',
  'cpx',
  'czh',
  'czo',
  'gan',
  'hak',
  'hsn',
  'lzh',
  'mnp',
  'nan',
  'quu',
  'yue',
  'cnp',
  'csp',
  'cpi',
  'lzh',
  'lpz',
  'wuu',
  'zh'
];
/** Scripture editing area. Used for Translate task.
 * ```
 * ┌─────────────────────────────────────┐
 * │           editor.component          │
 * │                                     │
 * │  ┌──────────────┐  ┌──────────────┐ │
 * │  │   source     │  │    target    │ │
 * │  │text.component│  │text.component│ │
 * │  └──────────────┘  └──────────────┘ │
 * │                                     │
 * └─────────────────────────────────────┘
 * ```
 */
@Component({
  selector: 'app-editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
  providers: [
    TabStateService<EditorTabGroupType, EditorTabInfo>,
    { provide: TabFactoryService, useClass: EditorTabFactoryService },
    { provide: TabMenuService, useClass: EditorTabMenuService },
    { provide: TabAddRequestService, useClass: EditorTabAddRequestService }
  ],
  imports: [
    AsyncPipe,
    Dir,
    KeyValuePipe,
    NgClass,
    FormsModule,
    ReactiveFormsModule,
    MatButton,
    MatFormField,
    MatIcon,
    MatIconButton,
    MatInput,
    MatLabel,
    MatMiniFabButton,
    MatTooltip,
    AngularSplitModule,
    TranslocoModule,
    BlurOnClickDirective,
    BookChapterChooserComponent,
    CopyrightBannerComponent,
    MultiViewerComponent,
    NoticeComponent,
    ShareButtonComponent,
    TextComponent,
    TabComponent,
    TabGroupComponent,
    TabHeaderDirective,
    BiblicalTermsComponent,
    EditorDraftComponent,
    EditorHistoryComponent,
    EditorResourceComponent,
    LynxInsightsPanelComponent,
    TextDocIdPipe
  ]
})
export class EditorComponent extends DataLoadingComponent implements OnDestroy, OnInit, AfterViewInit {
  addingMobileNote: boolean = false;
  books: number[] = [];
  chapters: number[] = [];
  text?: TextInfo;
  isProjectAdmin: boolean = false;
  mobileNoteControl: UntypedFormControl = new UntypedFormControl('');
  multiCursorViewers: MultiCursorViewer[] = [];
  target: TextComponent | undefined;
  draftTimestamp?: Date;
  lynxInsightsEnabled = false;
  lynxAutoCorrectionsEnabled = false;
  readonly issueEmail = environment.issueEmail;

  @ViewChild('source') source?: TextComponent;
  @ViewChild('fabButton', { read: ElementRef }) insertNoteFab?: ElementRef<HTMLElement>;
  @ViewChild('fabBottomSheet') TemplateBottomSheet?: TemplateRef<any>;
  @ViewChild('mobileNoteTextarea') mobileNoteTextarea?: ElementRef<HTMLTextAreaElement>;
  @ViewChildren('target') targetTextComponent?: QueryList<TextComponent>;

  private sourceScrollContainer: Element | undefined;
  private targetScrollContainer: Element | undefined;
  private bottomSheetRef?: MatBottomSheetRef;
  private currentUserDoc?: UserDoc;
  projectDoc?: SFProjectProfileDoc;
  private projectUserConfigDoc?: SFProjectUserConfigDoc;
  private paratextUsers: ParatextUserProfile[] = [];
  private isParatextUserRole: boolean = false;
  private projectUserConfigChangesSub?: Subscription;
  private _bookNum?: number;
  sourceProjectDoc?: SFProjectProfileDoc;
  private _unsupportedTags = new Set<string>();
  private sourceLoaded: boolean = false;
  private targetLoaded: boolean = false;
  private _targetFocused: boolean = false;
  private chapter$ = new BehaviorSubject<number | undefined>(undefined);
  private _verse: string = '0';
  private onTargetDeleteSub?: Subscription;
  private projectDataChangesSub?: Subscription;
  private clickSubs: Map<string, Subscription[]> = new Map<string, Subscription[]>();
  private selectionClickSubs: Subscription[] = [];
  private noteThreadQuery?: RealtimeQuery<NoteThreadDoc>;
  private toggleNoteThreadVerseRefs$: BehaviorSubject<void> = new BehaviorSubject<void>(undefined);
  private initializeLynxStateSub?: Subscription;
  private targetEditorLoaded$: Subject<void> = new Subject<void>();
  private syncScrollRequested$: Subject<void> = new Subject<void>();
  private toggleNoteThreadSub?: Subscription;
  private shouldNoteThreadsRespondToEdits: boolean = false;
  private commenterSelectedVerseRef?: VerseRef;
  private resizeObserver?: ResizeObserver;
  private scrollSubscription?: Subscription;
  private tabStateInitialized$ = new BehaviorSubject<boolean>(false);
  private visibleTabGroups: EditorTabGroupType[] = editorTabGroupTypes.slice();
  private showEditorTabsInSinglePaneSub?: Subscription;
  private showEditorTabsInSinglePane$ = new BehaviorSubject<boolean>(false);
  private readonly fabDiameter = 40;
  readonly fabVerticalCushion = 5;

  /**  Determines whether the user can edit the current text.  Combines all permissions and chapter validity checks. */
  canEdit: boolean = false;
  private canEdit$ = new BehaviorSubject<boolean>(false);

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly userService: UserService,
    private readonly projectService: SFProjectService,
    noticeService: NoticeService,
    private readonly dialogService: DialogService,
    private readonly changeDetector: ChangeDetectorRef,

    private readonly onlineStatusService: OnlineStatusService,
    readonly i18n: I18nService,
    readonly fontService: FontService,
    private readonly activatedProject: ActivatedProjectService,
    private readonly router: Router,
    private bottomSheet: MatBottomSheet,
    readonly tabState: TabStateService<EditorTabGroupType, EditorTabInfo>,
    private readonly editorHistoryService: EditorHistoryService,
    private readonly editorTabFactory: EditorTabFactoryService,
    private readonly editorTabPersistenceService: EditorTabPersistenceService,
    private readonly textDocService: TextDocService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly draftOptionsService: DraftOptionsService,
    private readonly destroyRef: DestroyRef,
    private readonly breakpointObserver: BreakpointObserver,
    private readonly mediaBreakpointService: MediaBreakpointService,
    private readonly permissionsService: PermissionsService,
    readonly editorInsightState: LynxInsightStateService
  ) {
    super(noticeService, 'EditorComponent');
    this.mobileNoteControl.setValidators([Validators.required, XFValidators.someNonWhitespace]);
  }

  get targetFocused(): boolean {
    return this._targetFocused;
  }

  set targetFocused(focused: boolean) {
    // both the note dialog and the bottom sheet causes the editor to lose focus,
    // but the editor should still keep the highlighting in both situations
    focused = this.dialogService.openDialogCount > 0 || this.bottomSheetRef != null ? true : focused;
    this._targetFocused = focused;
  }

  get isTargetTextRight(): boolean {
    return this.projectUserConfigDoc == null || this.projectUserConfigDoc.data == null
      ? true
      : this.projectUserConfigDoc.data.isTargetTextRight;
  }

  set isTargetTextRight(value: boolean) {
    if (this.projectUserConfigDoc != null && this.isTargetTextRight !== value) {
      void this.projectUserConfigDoc.submitJson0Op(op => op.set(puc => puc.isTargetTextRight, value));
    }
  }

  get lynxProjectEnabled(): boolean {
    return (
      !!this.projectDoc?.data?.lynxConfig.assessmentsEnabled ||
      !!this.projectDoc?.data?.lynxConfig.autoCorrectionsEnabled
    );
  }

  get noteTags(): NoteTag[] {
    return this.projectDoc?.data?.noteTags ?? [];
  }

  get verse(): string {
    return this._verse;
  }

  get chapter(): number | undefined {
    return this.chapter$.value;
  }

  set chapter(value: number | undefined) {
    if (this.chapter$.value !== value && value != null) {
      // Update url to reflect current chapter, triggering ActivatedRoute
      void this.router.navigateByUrl(
        `/projects/${this.projectId}/translate/${Canon.bookNumberToId(this.bookNum!)}/${value}`
      );
    }
  }

  setBook(book: number): void {
    void this.router.navigate(['projects', this.projectId, 'translate', Canon.bookNumberToId(book)]);
  }

  get bookNum(): number | undefined {
    return this._bookNum;
  }

  get currentUser(): User | undefined {
    return this.currentUserDoc == null ? undefined : this.currentUserDoc.data;
  }

  get defaultShareRole(): SFProjectRole {
    return SF_DEFAULT_TRANSLATE_SHARE_ROLE;
  }

  get canShowSourceTab(): boolean {
    return (this.hasSource && this.hasSourceViewRight) || this.isParatextUserRole;
  }

  get showSourceTab(): boolean {
    return (
      (this.canShowSourceTab || (this.tabState.getTabGroup('source')?.tabs.some(tab => tab.persist) ?? false)) &&
      this.projectUserConfigDoc?.data?.showEditorTabsInSinglePane !== true
    );
  }

  get hasEditRight(): boolean {
    return this.userHasGeneralEditRight && this.hasChapterEditPermission === true;
  }

  get userHasGeneralEditRight(): boolean {
    return this.textDocService.userHasGeneralEditRight(this.projectDoc?.data);
  }

  /**
   * Determines whether the user has permission to edit the currently active chapter.
   * Returns undefined if the necessary data is not yet available.
   */
  get hasChapterEditPermission(): boolean | undefined {
    return this.textDocService.hasChapterEditPermissionForText(this.text, this.chapter);
  }

  get showNoEditPermissionMessage(): boolean {
    return this.userHasGeneralEditRight && this.hasChapterEditPermission === false;
  }

  get userRoleStr(): string {
    return this.userRole == null ? '' : this.i18n.localizeRole(this.userRole);
  }

  get hasSourceViewRight(): boolean {
    const sourceProject = this.sourceProjectDoc?.data;
    const sourceId = this.source?.id;
    if (sourceProject != null && sourceId != null) {
      return this.permissionsService.canAccessText(sourceId, sourceProject);
    } else {
      return false;
    }
  }

  get canInsertNote(): boolean {
    if (this.projectDoc?.data == null) return false;
    return canInsertNote(this.projectDoc.data, this.userService.currentUserId);
  }

  get canShare(): boolean {
    return (
      this.projectDoc?.data != null &&
      SF_PROJECT_RIGHTS.hasRight(
        this.projectDoc.data,
        this.userService.currentUserId,
        SFProjectDomain.UserInvites,
        Operation.Create
      )
    );
  }

  get currentSegmentReference(): string {
    const verseRef: VerseRef | undefined = this.commenterSelectedVerseRef;
    if (verseRef == null) {
      return '';
    }
    return this.i18n.localizeReference(verseRef);
  }

  get direction(): LocaleDirection {
    return this.i18n.direction;
  }

  get fontSize(): string | undefined {
    return formatFontSizeToRems(this.projectDoc?.data?.defaultFontSize);
  }

  get sourceFontSize(): string | undefined {
    return formatFontSizeToRems(this.sourceProjectDoc?.data?.defaultFontSize);
  }

  get projectTextNotEditable(): boolean {
    return this.textDocService.isEditingDisabled(this.projectDoc?.data);
  }

  get isSourceRightToLeft(): boolean {
    if (this.projectDoc?.data?.translateConfig?.source?.isRightToLeft != null) {
      return this.projectDoc.data.translateConfig?.source?.isRightToLeft;
    }
    return false;
  }

  get isTargetRightToLeft(): boolean {
    if (this.projectDoc?.data?.isRightToLeft != null) {
      return this.projectDoc.data.isRightToLeft;
    }
    return false;
  }

  get isUsfmValid(): boolean {
    return this.textDocService.isUsfmValidForText(this.text, this.chapter);
  }

  invalidTags(): string[] {
    return [...this._unsupportedTags]?.map(tag => '\\' + tag) ?? [];
  }

  get dataInSync(): boolean {
    return this.textDocService.isDataInSync(this.projectDoc?.data);
  }

  get issueEmailLink(): string {
    return getLinkHTML(this.issueEmail, issuesEmailTemplate());
  }

  get writingSystemWarningMessage(): string {
    return this.i18n.translateStatic('editor.browser_warning_banner', {
      firefoxLink: browserLinks().firefoxLink,
      safari: browserLinks().safariLink
    });
  }

  get showMultiViewers(): boolean {
    return this.onlineStatusService.isOnline && this.multiCursorViewers.length > 0;
  }

  /**
   * Determines whether the comment adding UI should be shown
   * This will be true any time the user has the right to add notes
   */
  get showAddCommentUI(): boolean {
    if (this.projectDoc?.data == null) return false;

    return SF_PROJECT_RIGHTS.hasRight(
      this.projectDoc.data,
      this.userService.currentUserId,
      SFProjectDomain.SFNoteThreads,
      Operation.Create
    );
  }

  get projectId(): string | undefined {
    return this.projectDoc?.id;
  }

  get sourceProjectId(): string | undefined {
    return this.projectDoc?.data?.translateConfig.source?.projectRef;
  }

  get visibleSourceProjectId(): string | undefined {
    return this.hasSource ? this.sourceProjectId : undefined;
  }

  private get userRole(): string | undefined {
    return this.projectDoc?.data?.userRoles[this.userService.currentUserId];
  }

  private get hasSource(): boolean {
    if (
      (this.text == null && !this.isParatextUserRole) ||
      this.currentUser === undefined ||
      this.sourceProjectId === undefined
    ) {
      return false;
    } else {
      // The case where user is paratext role but does not have source in user projects due
      // to permissions issue we want to show the source
      const projects = this.currentUser.sites[environment.siteId].projects;
      return (this.text?.hasSource && projects.includes(this.sourceProjectId)) || this.isParatextUserRole;
    }
  }

  private get isInsertNoteFabEnabled(): boolean {
    return this.canShowInsertNoteFab && !this.isCommenterOnMobileDevice;
  }

  private get isCommenterOnMobileDevice(): boolean {
    return (
      !this.hasEditRight && this.breakpointObserver.isMatched(this.mediaBreakpointService.width('<', Breakpoint.LG))
    );
  }

  private get canShowInsertNoteFab(): boolean {
    return this.targetLoaded && this.dialogService.openDialogCount < 1;
  }

  get hasSourceCopyrightBanner(): boolean {
    return this.sourceProjectDoc?.data?.copyrightBanner != null;
  }

  get sourceCopyrightBanner(): string {
    return this.sourceProjectDoc?.data?.copyrightBanner ?? '';
  }

  get sourceCopyrightNotice(): string | undefined {
    return this.sourceProjectDoc?.data?.copyrightNotice;
  }

  get hasTargetCopyrightBanner(): boolean {
    return this.projectDoc?.data?.copyrightBanner != null;
  }

  get targetCopyrightBanner(): string {
    return this.projectDoc?.data?.copyrightBanner ?? '';
  }

  get targetCopyrightNotice(): string | undefined {
    return this.projectDoc?.data?.copyrightNotice;
  }

  get sourceLabel(): string | undefined {
    return this.projectDoc?.data?.translateConfig.source?.shortName;
  }
  get targetLabel(): string | undefined {
    return this.projectDoc?.data?.shortName;
  }

  get writingSystemWarningBanner(): boolean {
    const writingSystemTag = this.projectDoc?.data?.writingSystem.tag;
    /*
      We only want the beginning part of the language code identifier from Paratext.
      Standard format is with a hyphen, checking for an underscore in the off
      chance a SF project has saved the writing system tag with one.
    */
    const languageCode = writingSystemTag?.split(/-_/)[0] ?? '';
    const unsupportedLanguageCode = UNSUPPORTED_LANGUAGE_CODES.includes(languageCode);
    return isBlink() && writingSystemTag != null && unsupportedLanguageCode && this.canEdit;
  }

  /**
   * Set the visibility of the add comment button. The button will be the FAB or the bottom sheet button
   * depending on the user's edit permissions and screen size.
   */
  private set showAddCommentButton(value: boolean) {
    if (this.insertNoteFab == null || this.TemplateBottomSheet == null) return;
    this.addingMobileNote = false;
    // Mobile users without editing rights will see a bottom sheet instead of a FAB
    if (this.isCommenterOnMobileDevice) {
      this.setNoteFabVisibility('hidden');
      if (value) {
        if (this.bottomSheetRef?.containerInstance == null) {
          this.bottomSheetRef = this.bottomSheet.open(this.TemplateBottomSheet, { hasBackdrop: false });
        }
      } else {
        this.bottomSheet.dismiss();
      }
    } else {
      this.setNoteFabVisibility(value ? 'visible' : 'hidden');
      this.bottomSheet.dismiss();
    }
  }

  ngOnInit(): void {
    this.activatedProject.projectDoc$
      .pipe(
        quietTakeUntilDestroyed(this.destroyRef),
        filterNullish(),
        switchMap(doc => this.initEditorTabs(doc))
      )
      .subscribe();
  }

  ngAfterViewInit(): void {
    fromEvent(window, 'resize')
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.positionInsertNoteFab();
      });

    combineLatest([
      this.activatedRoute.params.pipe(filter(params => params['projectId'] != null && params['bookId'] != null)),
      this.targetTextComponent!.changes
    ])
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(async ([params, targetViewChildren]) => {
        this.target = targetViewChildren.first;
        this.sourceLoaded = false;
        this.targetLoaded = false;
        this.bottomSheet.dismiss();
        this.loadingStarted();
        const projectId = params['projectId'] as string;
        const bookId = params['bookId'] as string;
        const chapterNum = params['chapter'] as string | null;
        const bookNum = bookId != null ? Canon.bookIdToNumber(bookId) : 0;
        this._bookNum = bookNum;

        if (this.currentUserDoc === undefined) {
          this.currentUserDoc = await this.userService.getCurrentUser();
        }

        const prevProjectId = this.projectDoc == null ? '' : this.projectDoc.id;
        if (projectId !== prevProjectId) {
          this.projectDoc = await this.projectService.getProfile(projectId);

          const userRole: string | undefined = this.userRole;
          if (userRole != null) {
            const projectDoc: SFProjectDoc | undefined = await this.projectService.tryGetForRole(projectId, userRole);
            if (projectDoc?.data?.paratextUsers != null) {
              this.paratextUsers = projectDoc.data.paratextUsers;
            }
          }
          this.isProjectAdmin = await this.projectService.isProjectAdmin(projectId, this.userService.currentUserId);
          this.isParatextUserRole = isParatextRole(this.userRole);
          this.projectUserConfigDoc = await this.projectService.getUserConfig(
            projectId,
            this.userService.currentUserId
          );

          this.sourceProjectDoc = await this.getSourceProjectDoc();
          this.projectUserConfigChangesSub?.unsubscribe();

          this.projectUserConfigChangesSub = this.projectUserConfigDoc.remoteChanges$.subscribe(async () => {
            if (
              this.projectUserConfigDoc?.data != null &&
              this.projectUserConfigDoc.data.selectedSegmentChecksum == null &&
              this._bookNum != null
            ) {
              // Reload config if the checksum has been reset on the server
              await this.loadProjectUserConfig(this._bookNum);
            }
          });

          // Show/hide the source tab based on the user project configuration
          const showEditorTabsInSinglePane: boolean =
            this.projectUserConfigDoc.data?.showEditorTabsInSinglePane ?? false;
          this.showEditorTabsInSinglePane$.next(showEditorTabsInSinglePane);
          this.visibleTabGroups = showEditorTabsInSinglePane ? ['target'] : editorTabGroupTypes.slice();
          this.showEditorTabsInSinglePaneSub?.unsubscribe();
          this.showEditorTabsInSinglePaneSub = this.projectUserConfigDoc.changes$.subscribe(async () => {
            if (this.projectUserConfigDoc?.data != null) {
              this.showEditorTabsInSinglePane$.next(this.projectUserConfigDoc.data.showEditorTabsInSinglePane ?? false);
            }
          });
        }

        if (this.projectDoc?.data == null) {
          return;
        }

        const projectTexts: number[] = this.projectDoc.data.texts.map(t => t.bookNum);
        const draftedBooks: number[] = booksFromScriptureRange(
          this.projectDoc.data.translateConfig.draftConfig?.draftedScriptureRange
        );
        this.books = Array.from(new Set([...projectTexts, ...draftedBooks])).sort((a, b) => a - b);
        this.text = this.projectDoc.data.texts.find(t => t.bookNum === bookNum);

        const allChapters: number = Math.max(
          this.text?.chapters[this.text.chapters.length - 1]?.number ?? 1,
          expectedBookChapters(Canon.bookNumberToId(bookNum))
        );
        this.chapters = Array.from({ length: allChapters }, (_, i) => i + 1);

        this.updateVerseNumber();

        // Set chapter from route if provided
        await this.loadProjectUserConfig(bookNum, chapterNum != null ? Number.parseInt(chapterNum) : undefined);

        // Lynx must be initialized after the adding of notes and other text-change related events
        this.initLynxFeatureStates(this.projectUserConfigDoc);

        if (this.projectDoc.id !== prevProjectId) {
          this.projectDataChangesSub?.unsubscribe();
          this.projectDataChangesSub = this.projectDoc.remoteChanges$.subscribe(async () => {
            let sourceId: TextDocId | undefined;
            if (this.hasSource && this.chapter != null) {
              sourceId = new TextDocId(
                this.projectDoc!.data!.translateConfig.source!.projectRef,
                bookNum,
                this.chapter
              );
              if (this.source != null && !isEqual(this.source.id, sourceId)) {
                this.sourceLoaded = false;
                this.loadingStarted();
              }
            }

            if (this.source != null) {
              this.source.id = sourceId;
            }

            await this.addRemoveSourceTabAsync(this.projectDoc!);
          });
        }
      });

    combineLatest([
      this.activatedProject.changes$.pipe(filterNullish()),
      this.chapter$,
      this.targetEditorLoaded$ // Wait for target to load to detect corrupted ops
    ])
      .pipe(
        quietTakeUntilDestroyed(this.destroyRef),
        map(([projectDoc, chapterNum]) => {
          return (
            this.textDocService.canEdit(projectDoc.data, this.bookNum, chapterNum) && !this.target?.areOpsCorrupted
          );
        }),
        tap(canEdit => {
          this.canEdit = canEdit; // Cache for non-reactive access
          this.canEdit$.next(canEdit);
        })
      )
      .subscribe();

    // Throttle bursts of sync scroll requests
    this.syncScrollRequested$
      .pipe(
        quietTakeUntilDestroyed(this.destroyRef),
        throttleTime(100, asyncScheduler, { leading: true, trailing: true })
      )
      .subscribe(() => {
        this.syncScroll();
      });

    // Consolidate tab groups for small screen widths, or if the setting is enabled
    combineLatest([
      this.breakpointObserver.observe(this.mediaBreakpointService.width('<', Breakpoint.SM)),
      this.tabStateInitialized$.pipe(filter(initialized => initialized)),
      this.targetEditorLoaded$.pipe(take(1)),
      this.showEditorTabsInSinglePane$.pipe(distinctUntilChanged())
    ])
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(([breakpointState, _initialized, _loaded, showEditorTabsInSinglePane]) => {
        if (breakpointState.matches || showEditorTabsInSinglePane) {
          this.visibleTabGroups = ['target'];
          this.tabState.consolidateTabGroups('target');
        } else {
          this.visibleTabGroups = editorTabGroupTypes.slice();
          if (this.tabState.deconsolidateTabGroups()) {
            this.addBlankTab();
          }
        }
      });
  }

  ngOnDestroy(): void {
    this.projectUserConfigChangesSub?.unsubscribe();
    this.projectDataChangesSub?.unsubscribe();
    this.initializeLynxStateSub?.unsubscribe();
    this.showEditorTabsInSinglePaneSub?.unsubscribe();
    this.onTargetDeleteSub?.unsubscribe();
    this.bottomSheet?.dismiss();
    this.resizeObserver?.disconnect();
    this.noteThreadQuery?.dispose();
  }

  async onTargetUpdated(
    segment?: Segment,
    delta?: Delta,
    prevSegment?: Segment,
    preDeltaAffectedEmbeds?: EmbedsByVerse[],
    isLocalUpdate?: boolean
  ): Promise<void> {
    if (this.target == null || this.target.editor == null) {
      return;
    }

    if (segment !== prevSegment) {
      if (this.source != null) {
        this.source.setSegment(this.target.segmentRef);
        this.syncScrollRequested$.next();
      }
      if (segment == null || !VERSE_REGEX.test(segment.ref)) {
        this.resetCommenterVerseSelection();
      }

      if (
        this.projectUserConfigDoc?.data != null &&
        this.text != null &&
        this.target.segmentRef !== '' &&
        (this.projectUserConfigDoc.data.selectedBookNum !== this.text.bookNum ||
          this.projectUserConfigDoc.data.selectedChapterNum !== this.chapter ||
          this.projectUserConfigDoc.data.selectedSegment !== this.target.segmentRef)
      ) {
        await this.projectUserConfigDoc.submitJson0Op(op => {
          op.set(puc => puc.selectedSegment, this.target!.segmentRef);
          op.set(puc => puc.selectedSegmentChecksum!, this.target!.segmentChecksum);
        });
      }
      if (this.bookNum != null && this.hasEditRight) {
        const verseRef: VerseRef | undefined = getVerseRefFromSegmentRef(this.bookNum, this.target.segmentRef);
        this.toggleVerseRefElement(verseRef);
      }
    } else {
      if (this.source != null && this.source.segmentRef !== this.target.segmentRef) {
        this.source.setSegment(this.target.segmentRef);
      }

      if (
        delta?.ops != null &&
        segment != null &&
        preDeltaAffectedEmbeds != null &&
        this.shouldNoteThreadsRespondToEdits &&
        !!isLocalUpdate
      ) {
        // only update the note anchors if the update is local, otherwise remote edits will mess up the note anchors
        await this.updateVerseNoteThreadAnchors(preDeltaAffectedEmbeds, delta);
      }

      this.syncScrollRequested$.next();
    }

    if (this.commenterSelectedVerseRef != null && this.target.commenterSelection.length === 0) {
      // if we're here, the state hasn't been updated, and we need to re-toggle the selected verse
      const correctVerseRef = this.commenterSelectedVerseRef;
      this.commenterSelectedVerseRef = undefined;
      this.toggleVerseRefElement(correctVerseRef);
    }

    if (delta != null && this.shouldNoteThreadsRespondToEdits) {
      // wait 20 ms so that note thread docs have time to receive the updated note positions
      setTimeout(() => {
        this.toggleNoteThreadVerses(true);
        if (segment != null) {
          this.subscribeClickEvents([segment.ref]);
        }
      }, 20);
    }
  }

  async onSourceUpdated(textChange: boolean): Promise<void> {
    if (!textChange) {
      return;
    }

    this.syncScrollRequested$.next();
  }

  onTextLoaded(textType: TextType): void {
    switch (textType) {
      case 'source':
        this.sourceLoaded = true;
        this.sourceScrollContainer = this.source?.editor?.root;
        break;
      case 'target':
        this.targetLoaded = true;
        this.targetScrollContainer = this.target?.editor?.root;
        this.toggleNoteThreadVerseRefs$.next();
        this.shouldNoteThreadsRespondToEdits = true;

        if (!this.isUsfmValid) {
          this._unsupportedTags.clear();
          const ops: DeltaOperation[] = this.target?.editor?.getContents().ops ?? [];
          ops.forEach(op => getUnsupportedTags(op).forEach(inv => this._unsupportedTags.add(inv)));
        }

        if (this.target?.editor != null && this.targetScrollContainer != null) {
          this.positionInsertNoteFab();
          this.observeResize(this.targetScrollContainer);
          this.subscribeScroll(this.targetScrollContainer);
          this.targetEditorLoaded$.next();
        }
        break;
    }

    if ((!this.hasSource || this.sourceLoaded || this.isParatextUserRole) && this.targetLoaded) {
      this.loadingFinished();
      // Toggle the segment the cursor is focused in - the timeout allows for Quill to get its focus set
      setTimeout(() => {
        if (this.target != null && this.targetFocused && this.bookNum != null && this.hasEditRight) {
          const verseRef = getVerseRefFromSegmentRef(this.bookNum, this.target.segmentRef);
          this.toggleVerseRefElement(verseRef);
        }
      }, 50);
    }
  }

  onPresenceChange(remotePresences?: RemotePresences): void {
    if (remotePresences != null) {
      const uniquePresences: PresenceData[] = Object.values(remotePresences).filter(
        (a, index, self) =>
          index ===
          self.findIndex(
            b => b.viewer.displayName === a.viewer.displayName && b.viewer.avatarUrl === a.viewer.avatarUrl
          )
      );
      const multiCursorViewers: MultiCursorViewer[] = [];
      const currentUser: User | undefined = this.currentUserDoc?.data;
      for (const presence of uniquePresences) {
        const viewer: MultiCursorViewer = presence.viewer;
        if (viewer.displayName !== currentUser?.displayName && viewer.avatarUrl !== currentUser?.avatarUrl) {
          multiCursorViewers.push(viewer);
        }
      }
      this.multiCursorViewers = multiCursorViewers;
    }
  }

  onSegmentRefChange(segmentRef: string): void {
    // If the segment is empty or not in a valid verse, set the verse to zero
    // so that it can propagate correctly to the biblical terms component
    if (segmentRef == null || this.bookNum == null) {
      this._verse = '0';
      return;
    }

    const verseRef: VerseRef | undefined = getVerseRefFromSegmentRef(this.bookNum, segmentRef);
    if (verseRef == null) {
      this._verse = '0';
      return;
    }

    // We use a string to account for partial (e.g. 12a) and compound (e.g. 3-4) verses
    this._verse = verseRef.verse;
  }

  openTranslatorSettings(): void {
    if (this.projectDoc == null || this.projectUserConfigDoc == null) {
      return;
    }

    this.openMatDialog<TranslatorSettingsDialogComponent, TranslatorSettingsDialogData>(
      TranslatorSettingsDialogComponent,
      {
        data: { projectDoc: this.projectDoc, projectUserConfigDoc: this.projectUserConfigDoc }
      }
    );
  }

  insertNote(): void {
    if (this.target == null || this.bookNum == null || !this.showAddCommentUI || this.TemplateBottomSheet == null) {
      return;
    }
    if (!this.target.contentShowing) {
      this.noticeService.show(this.i18n.translateStatic('editor.navigate_to_a_valid_text'));
      return;
    }
    let verseRef: VerseRef | undefined = this.commenterSelectedVerseRef;
    if (verseRef == null) {
      const defaultSegmentRef: string | undefined = this.target.firstVerseSegment;
      if (defaultSegmentRef == null) return;
      verseRef = getVerseRefFromSegmentRef(this.bookNum, defaultSegmentRef);
    }
    // Mobile users can use the bottom sheet to add new notes
    if (this.breakpointObserver.isMatched(this.mediaBreakpointService.width('<', Breakpoint.LG))) {
      this.toggleAddingMobileNote();
      this.setNoteFabVisibility('hidden');
      this.bottomSheetRef = this.bottomSheet.open(this.TemplateBottomSheet, { hasBackdrop: false });
    } else {
      void this.showNoteThread(undefined, verseRef);
    }
  }

  removeEmbeddedElements(): void {
    this.shouldNoteThreadsRespondToEdits = false;
    this.target?.removeEmbeddedElements();
    // Un-subscribe from all segment click events as these all get setup again
    for (const segmentEvents of this.clickSubs.values()) {
      for (const event of segmentEvents) {
        event.unsubscribe();
      }
    }
  }

  toggleAddingMobileNote(): void {
    this.addingMobileNote = !this.addingMobileNote;
    if (this.addingMobileNote) {
      this.mobileNoteControl.reset();
      // On-screen keyboards appearing can interfere with the resize height logic which then changes the focus
      // Waiting for 100ms was found to be a good amount of time for that to be resolved
      setTimeout(() => this.mobileNoteTextarea?.nativeElement.focus(), 650);
    } else if (this.hasEditRight) {
      this.bottomSheetRef?.dismiss();
      this.setNoteFabVisibility('visible');
    }
  }

  async saveMobileNote(): Promise<void> {
    if (!this.mobileNoteControl.valid || this.projectId == null || this.commenterSelectedVerseRef == null) {
      return;
    }

    await this.saveNote({ content: this.mobileNoteControl.value, verseRef: this.commenterSelectedVerseRef });
    this.addingMobileNote = false;
    this.bottomSheetRef?.dismiss();
    this.toggleNoteThreadVerseRefs$.next();
    // The verse stays selected after saving, so restore the UI for adding another note to it: for users with
    // edit rights, re-show the FAB; for commenters on mobile viewports (who have no FAB), reopen the bottom
    // sheet with its add comment button
    this.showAddCommentButton = true;
  }

  onViewerClicked(viewer: MultiCursorViewer): void {
    this.target!.scrollToViewer(viewer);
  }

  async onHistoryTabRevisionSelect(tab: EditorTabInfo, revision: Revision | undefined): Promise<void> {
    if (revision != null) {
      const separator: string = this.i18n.isRtl ? `${RIGHT_TO_LEFT_MARK} - ` : ' - ';
      tab.headerText$ = of(
        `${this.targetLabel}${separator}${this.editorHistoryService.formatTimestamp(revision.timestamp)}`
      );
      tab.tooltip = `${this.projectDoc?.data?.name}${separator}${this.editorHistoryService.formatTimestamp(
        revision.timestamp,
        true
      )}`;
    } else {
      const historyDefaultTabHeader: string = await firstValueFrom(
        this.i18n.translate('editor_tab_factory.default_history_tab_header')
      );
      tab.headerText$ = of(`${this.targetLabel} - ${historyDefaultTabHeader}`);
      tab.tooltip = `${this.projectDoc?.data?.name} - ${historyDefaultTabHeader}`;
    }

    this.changeDetector.detectChanges();
  }

  /**
   * Initializes the tab state from persisted tabs plus non-persisted tabs (source and target projects),
   * then listens for tab state changes to update the persisted tabs or add the blank tab.
   * Returns an observable that can be piped from projectDoc changes, allowing a single call to `subscribe`,
   * avoiding potential NG0911 error 'View has already been destroyed'.
   */
  private initEditorTabs(projectDoc: SFProjectProfileDoc): Observable<any> {
    // Set tab state from persisted tabs plus non-persisted tabs
    const storeToState$: Observable<any> = this.editorTabPersistenceService.persistedTabs$.pipe(
      take(1),
      // Include the project doc for tabs that contain a project id
      switchMap(persistedTabs => {
        return Promise.all(
          persistedTabs.map(async tabData => {
            let projectDoc: SFProjectProfileDoc | undefined = undefined;
            if (tabData.projectId != null) {
              projectDoc = await this.projectService.getProfile(tabData.projectId);
            }

            return {
              ...tabData,
              projectDoc
            };
          })
        );
      }),
      tap(async (persistedTabs: (EditorTabPersistData & { projectDoc?: SFProjectProfileDoc })[]) => {
        const sourceTabGroup = new TabGroup<EditorTabGroupType, EditorTabInfo>('source');
        const targetTabGroup = new TabGroup<EditorTabGroupType, EditorTabInfo>('target');
        targetTabGroup.addTab(
          this.editorTabFactory.createTab('project-target', {
            projectId: projectDoc.id,
            headerText$: projectDoc.data?.shortName == null ? undefined : of(projectDoc.data.shortName),
            tooltip: projectDoc?.data?.name
          })
        );

        await this.addRemoveSourceTabAsync(projectDoc, sourceTabGroup);

        for (const tabData of persistedTabs) {
          // Do not display the Biblical Terms tab if the user has lost permission
          if (
            tabData.tabType === 'biblical-terms' &&
            this.activatedProject.projectDoc?.data?.biblicalTermsConfig?.biblicalTermsEnabled === false
          ) {
            continue;
          }

          // Exclude tabs that have projectDoc but not projectDoc data (project may have been deleted).
          // These will be cleaned out the next time tab state is persisted.
          if (tabData.projectDoc != null && tabData.projectDoc.data == null) {
            continue;
          }

          // Exclude resource tabs if they match the project source
          if (
            tabData.tabType === 'project-resource' &&
            tabData.projectId != null &&
            tabData.projectId === projectDoc?.data?.translateConfig.source?.projectRef
          ) {
            continue;
          }

          // Create the tab
          const tab: EditorTabInfo = this.editorTabFactory.createTab(tabData.tabType, {
            projectId: tabData.projectId,
            headerText$:
              tabData?.projectDoc?.data?.shortName == null ? undefined : of(tabData.projectDoc.data.shortName),
            tooltip: tabData.projectDoc?.data?.name
          });

          if (tabData.groupId === 'source') {
            sourceTabGroup.addTab(tab, tabData.isSelected);
          } else {
            targetTabGroup.addTab(tab, tabData.isSelected);
          }
        }

        this.tabState.setTabGroups([sourceTabGroup, targetTabGroup]);

        // Notify to start tab persistence on tab state changes
        this.tabStateInitialized$.next(true);

        // View is initialized before the tab state is initialized, so re-run change detection
        this.changeDetector.detectChanges();
      })
    );

    // Persist tabs from tab state changes once tab state has been initialized
    const stateToStore$: Observable<any> = combineLatest([
      this.tabState.tabs$,
      this.tabStateInitialized$.pipe(filter(initialized => initialized))
    ]).pipe(
      map(([tabs]) => {
        const tabsToPersist: EditorTabPersistData[] = [];

        tabs.forEach(tab => {
          // Only persist tabs flagged as persistable
          if (tab.persist) {
            tabsToPersist.push({
              tabType: tab.type,
              groupId: tab.groupId,
              isSelected: tab.isSelected,
              projectId: tab.projectId
            });
          }
        });

        // Handle the showing/hiding of the blank tab
        setTimeout(() => {
          this.addBlankTab(tabs);
        }, 0);

        return tabsToPersist;
      }),
      tap((tabs: EditorTabPersistData[]) => {
        void this.editorTabPersistenceService.persistTabsOpen(tabs);
      })
    );

    // Combine so both observables are triggered with single subscription
    return merge(storeToState$, stateToStore$);
  }

  private addBlankTab(tabs: FlatTabInfo<EditorTabGroupType, EditorTabInfo>[] | undefined = undefined): void {
    for (const groupId of this.visibleTabGroups) {
      // For each tab group (i.e. source and target)
      const blankTab = this.tabState.getFirstTabOfTypeIndex('blank-tab', groupId);
      const groupTabs: EditorTabInfo[] =
        tabs == null
          ? (this.tabState.getTabGroup(groupId)?.tabs ?? []).slice()
          : tabs.filter(t => t.groupId === groupId);
      if (groupTabs.length === 0 && blankTab == null) {
        // Add the blank tab, if there are no in tabs the tab group
        this.tabState.addTab(groupId, this.editorTabFactory.createTab('blank-tab'));
      } else if (groupTabs.length > 1 && blankTab != null) {
        // Remove the blank tab if the tab group has a non-blank tab
        this.tabState.removeTab(groupId, blankTab.index);
      }
    }
  }

  private async addRemoveSourceTabAsync(
    projectDoc: SFProjectProfileDoc,
    sourceTabGroup?: TabGroup<EditorTabGroupType, EditorTabInfo>
  ): Promise<void> {
    const projectSource: TranslateSource | undefined = projectDoc.data?.translateConfig.source;
    let canViewSource = false;
    if (projectSource != null) {
      canViewSource =
        (await this.permissionsService.isUserOnProject(projectSource?.projectRef)) ||
        (await this.permissionsService.userHasParatextRoleOnProject(projectDoc.id));
    }

    const existingSourceTab: { groupId: EditorTabGroupType; index: number } | undefined =
      this.tabState.getFirstTabOfTypeIndex('project-source');
    if (projectSource != null && canViewSource) {
      if (sourceTabGroup != null || existingSourceTab == null) {
        const tab = this.editorTabFactory.createTab('project-source', {
          projectId: projectSource.projectRef,
          headerText$: of(projectSource.shortName),
          tooltip: projectSource.name
        });
        if (sourceTabGroup != null) {
          sourceTabGroup?.addTab(tab);
        } else if (existingSourceTab == null) {
          this.tabState.addTab('source', tab);
        }
      }
    } else if (existingSourceTab != null) {
      // Remove from the group the tab is actually in, which is not the 'source' group when tab groups are
      // consolidated for small screens
      this.tabState.removeTab(existingSourceTab.groupId, existingSourceTab.index);
    }
  }

  private async saveNote(params: SaveNoteParameters): Promise<void> {
    if (this.projectId == null || this.bookNum == null) {
      return;
    }
    const currentDate: string = new Date().toJSON();
    // if adding a note to an existing thread, the empty string must be replaced by the existing thread id
    const newThreadId: string = params.threadDataId != null ? '' : objectId();
    // only set the tag id if it is the first note in the thread
    const tagId: number | undefined =
      params.threadDataId == null ? this.projectDoc?.data?.translateConfig.defaultNoteTagId : undefined;
    const noteContent: string | undefined = params.content == null ? undefined : XmlUtils.encodeForXml(params.content);
    const noteStatus: NoteStatus = params.status ?? NoteStatus.Todo;
    // Configure the note
    const note: Note = {
      dateCreated: currentDate,
      dateModified: currentDate,
      threadId: newThreadId,
      dataId: params.dataId ?? objectId(),
      tagId,
      ownerRef: this.userService.currentUserId,
      content: noteContent,
      conflictType: NoteConflictType.DefaultValue,
      type: NoteType.Normal,
      status: noteStatus,
      deleted: false,
      editable: true,
      versionNumber: 1
    };
    if (params.threadDataId == null) {
      if (params.verseRef == null) return;
      // Create a new thread
      const noteThread: NoteThread = {
        dataId: objectId(),
        threadId: newThreadId,
        verseRef: fromVerseRef(params.verseRef),
        projectRef: this.projectId,
        ownerRef: this.userService.currentUserId,
        notes: [note],
        position: { start: 0, length: 0 },
        originalContextBefore: '',
        originalSelectedText: this.target?.segmentText!,
        originalContextAfter: '',
        status: NoteStatus.Todo,
        publishedToSF: true
      };
      await this.projectService.createNoteThread(this.projectId, noteThread);
    } else {
      const threadDoc: NoteThreadDoc = await this.projectService.getNoteThread(
        getNoteThreadDocId(this.projectId, params.threadDataId)
      );
      const noteIndex: number = threadDoc.data!.notes.findIndex(n => n.dataId === params.dataId);
      if (noteIndex >= 0) {
        // updated the existing note
        if (threadDoc.data?.notes[noteIndex].editable === true) {
          await threadDoc!.submitJson0Op(op => {
            op.set(t => t.notes[noteIndex].content, noteContent);
            op.set(t => t.notes[noteIndex].dateModified, currentDate);
            op.set(t => t.notes[noteIndex].status, noteStatus);
            // also set the status of the thread to be the status of the note
            op.set(t => t.status, noteStatus);
          });
        } else {
          void this.dialogService.message('editor.cannot_edit_note_paratext');
        }
      } else {
        note.threadId = threadDoc.data!.threadId;
        await threadDoc.submitJson0Op(op => {
          op.add(t => t.notes, note);
          // also set the status of the thread to be the status of the note
          op.set(t => t.status, note.status);
        });
        await this.updateNoteReadRefs(note.dataId);
      }
    }
  }

  private async updateDraftTabVisibility(): Promise<void> {
    const chapter: Chapter | undefined = this.text?.chapters.find(c => c.number === this.chapter);
    const hasDraft: boolean = this.projectService.hasDraft(this.projectDoc?.data, this.bookNum, this.chapter);
    const draftApplied: boolean = chapter?.draftApplied ?? false;
    const existingDraftTab: { groupId: EditorTabGroupType; index: number } | undefined =
      this.tabState.getFirstTabOfTypeIndex('draft');

    const urlDraftActive: boolean = this.activatedRoute.snapshot.queryParams['draft-active'] === 'true';
    if (this.activatedRoute.snapshot.queryParams['draft-timestamp'] != null) {
      this.draftTimestamp = new Date(this.activatedRoute.snapshot.queryParams['draft-timestamp']);
    } else {
      this.draftTimestamp = undefined;
    }
    const canViewDrafts: boolean = this.permissionsService.canAccessDrafts(
      this.projectDoc,
      this.userService.currentUserId
    );

    const hasUnappliedDraft: boolean = hasDraft && !draftApplied;
    const draftShouldBeVisible: boolean = hasUnappliedDraft || urlDraftActive;

    let draftBuild: BuildDto | undefined;
    // Only try to fetch the draft build if existing information indicates we should show the draft
    if (draftShouldBeVisible && canViewDrafts && this.projectId != null) {
      draftBuild = await firstValueFrom(this.draftGenerationService.getLastCompletedBuild(this.projectId));
    }

    const isBlockedByFormattingOptions: boolean =
      this.draftOptionsService.areFormattingOptionsAvailableButUnselected(draftBuild);

    if (draftShouldBeVisible && canViewDrafts && draftBuild != null && !isBlockedByFormattingOptions) {
      // Add to 'source' tab group if no existing draft tab
      if (existingDraftTab == null) {
        this.tabState.addTab(
          'source',
          this.editorTabFactory.createTab('draft', {
            tooltip: `Draft - ${this.editorHistoryService.formatTimestamp(
              draftBuild?.additionalInfo?.dateFinished,
              true
            )}`
          }),
          urlDraftActive
        );
      }

      if (urlDraftActive) {
        // Remove 'draft-active' and 'draft-timestamp' query string from url when another tab from group is selected
        this.tabState.tabs$
          .pipe(
            filter(tabs => tabs.some(tab => tab.groupId === 'source' && tab.type !== 'draft' && tab.isSelected)),
            take(1)
          )
          .subscribe(() => {
            void this.router.navigate([], {
              queryParams: { 'draft-active': null, 'draft-timestamp': null },
              queryParamsHandling: 'merge',
              replaceUrl: true
            });
          });
      }
    } else if (existingDraftTab != null) {
      // No draft for chapter, so remove the draft tab
      this.tabState.removeTab(existingDraftTab.groupId, existingDraftTab.index);
    }
  }

  private async updateBiblicalTermsTabVisibility(): Promise<void> {
    // If the user does not have an existing Biblical Terms tab, and BT is enabled in their project and project-user
    // configuration, show the Biblical Terms tab then remove that setting from their project-user configuration.
    const existingDraftTab: { groupId: EditorTabGroupType; index: number } | undefined =
      this.tabState.getFirstTabOfTypeIndex('biblical-terms');
    if (
      existingDraftTab == null &&
      this.projectDoc?.data?.biblicalTermsConfig?.biblicalTermsEnabled === true &&
      this.projectUserConfigDoc?.data?.biblicalTermsEnabled === true
    ) {
      this.tabState.addTab('source', this.editorTabFactory.createTab('biblical-terms'), false);
      await this.projectUserConfigDoc?.submitJson0Op(op => op.unset(p => p.biblicalTermsEnabled));
    }
  }

  /** Insert or remove note thread embeds into the quill editor. */
  private toggleNoteThreadVerses(toggleOn: boolean): void {
    if (
      this.target?.editor == null ||
      this.noteThreadQuery == null ||
      this.bookNum == null ||
      this.chapter == null ||
      this.projectDoc?.data == null
    ) {
      return;
    }
    if (!toggleOn) {
      this.removeEmbeddedElements();
      return;
    }
    const role: string = this.projectDoc.data.userRoles[this.userService.currentUserId];

    const chapterNoteThreadDocs: NoteThreadDoc[] = this.currentChapterNoteThreadDocs();
    const noteThreadVerseRefs: Set<VerseRef> = new Set<VerseRef>();
    for (const noteThreadDoc of chapterNoteThreadDocs) {
      const featured: FeaturedVerseRefInfo | undefined = this.getFeaturedVerseRefInfo(noteThreadDoc);
      if (featured != null && !this.target.embeddedElements.has(featured.id)) {
        this.embedNoteThread(featured, role);
        noteThreadVerseRefs.add(featured.verseRef);
      }
    }

    // add the formatting to mark featured verses after notes are embedded
    const segments: string[] = this.target.toggleFeaturedVerseRefs(
      toggleOn,
      Array.from(noteThreadVerseRefs.values()),
      'note-thread'
    );
    this.shouldNoteThreadsRespondToEdits = true;
    // Defer the subscription so that the editor has time to clean up comments on blanks verses
    void Promise.resolve().then(() => this.subscribeClickEvents(segments));
  }

  private async showNoteThread(threadDataId?: string, verseRef?: VerseRef): Promise<void> {
    if (this.bookNum == null || this.chapter == null) {
      return;
    }
    if (threadDataId == null && verseRef == null) {
      // at least one must be defined
      return;
    }

    const noteDialogData: NoteDialogData = {
      projectId: this.projectDoc!.id,
      threadDataId: threadDataId,
      textDocId: new TextDocId(this.projectDoc!.id, this.bookNum, this.chapter),
      verseRef
    };
    const dialogRef: MatDialogRef<NoteDialogComponent, NoteDialogResult | undefined> = this.openMatDialog<
      NoteDialogComponent,
      NoteDialogData,
      NoteDialogResult | undefined
    >(NoteDialogComponent, {
      autoFocus: true,
      width: '600px',
      disableClose: true,
      data: noteDialogData
    });

    const currentVerseRef: VerseRef | undefined = this.commenterSelectedVerseRef;
    this.setNoteFabVisibility('hidden');
    const result: NoteDialogResult | undefined = await lastValueFrom(dialogRef.afterClosed());

    if (result != null) {
      if (result.noteContent != null || result.status != null) {
        await this.saveNote({
          content: result.noteContent,
          threadDataId: threadDataId,
          dataId: result.noteDataId,
          verseRef: currentVerseRef,
          status: result.status
        });
      }
      this.toggleNoteThreadVerseRefs$.next();
    }
    if (this.isInsertNoteFabEnabled) {
      this.setNoteFabVisibility('visible');
      this.positionInsertNoteFab();
    }
  }

  /** Sets the visibility of the insert note FAB. If the FAB does not exist, this is a no-op. */
  private setNoteFabVisibility(visible: 'visible' | 'hidden'): void {
    if (this.insertNoteFab?.nativeElement != null) {
      this.insertNoteFab.nativeElement.style.visibility = visible;
    }
  }

  private updateReadNotes(threadId: string): void {
    const noteThread: NoteThreadDoc | undefined = this.noteThreadQuery?.docs.find(
      d => d.data?.dataId === threadId && d.data?.notes.filter(n => !n.deleted).length > 0
    );
    if (noteThread?.data != null && this.projectUserConfigDoc?.data != null) {
      const notesRead: string[] = [];
      for (const note of noteThread.data.notes) {
        if (!this.projectUserConfigDoc.data.noteRefsRead.includes(note.dataId)) {
          notesRead.push(note.dataId);
        }
      }

      if (notesRead.length === 0) {
        return;
      }
      void this.projectUserConfigDoc.submitJson0Op(op => {
        for (const noteId of notesRead) {
          op.add(puc => puc.noteRefsRead, noteId);
        }
      });
    }
  }

  private async updateNoteReadRefs(noteId: string): Promise<void> {
    if (this.projectUserConfigDoc?.data == null || this.projectUserConfigDoc.data.noteRefsRead.includes(noteId)) return;
    await this.projectUserConfigDoc.submitJson0Op(op => op.add(puc => puc.noteRefsRead, noteId));
  }

  private async changeText(): Promise<void> {
    if (this.projectDoc == null || this.text == null || this.chapter == null) {
      if (this.source != null) this.source.id = undefined;
      if (this.target != null) this.target.id = undefined;
      return;
    }
    if (this.target == null) {
      return;
    }

    // reset the verse selection before changing text
    this.resetCommenterVerseSelection();

    if (this.source != null) {
      this.source.id = this.hasSource
        ? new TextDocId(this.projectDoc.data!.translateConfig.source!.projectRef, this.text.bookNum, this.chapter)
        : undefined;
    }

    const targetId = new TextDocId(this.projectDoc.id, this.text.bookNum, this.chapter, 'target');

    if (!isEqual(targetId, this.target.id)) {
      // blur the target before switching so that scrolling is reset to the top
      this.target.blur();
    }

    this.target.id = targetId;
    this.setSegment();
    const textDoc = await this.projectService.getText(targetId);

    if (this.onTargetDeleteSub != null) {
      this.onTargetDeleteSub.unsubscribe();
    }

    this.onTargetDeleteSub = textDoc.delete$.subscribe(() => {
      void this.dialogService.message(this.i18n.translate('editor.text_has_been_deleted')).then(() => {
        void this.router.navigateByUrl('/projects/' + this.projectDoc!.id + '/translate', { replaceUrl: true });
      });
    });

    await this.loadNoteThreadDocs(this.projectDoc.id, this.text.bookNum, this.chapter);
  }

  private setSegment(selectedSegment?: string, selectedSegmentChecksum?: number): void {
    if (this.target == null || this.text == null) return;
    if (
      selectedSegment == null &&
      this.projectUserConfigDoc?.data != null &&
      this.projectUserConfigDoc.data.selectedBookNum === this.text.bookNum &&
      this.projectUserConfigDoc.data.selectedChapterNum === this.chapter &&
      this.projectUserConfigDoc.data.selectedSegment !== ''
    ) {
      selectedSegment = this.projectUserConfigDoc.data.selectedSegment;
      selectedSegmentChecksum = this.projectUserConfigDoc.data.selectedSegmentChecksum;
    }

    if (selectedSegment != null) {
      const segmentChanged: boolean = this.target.setSegment(selectedSegment, selectedSegmentChecksum, true);
      if (!segmentChanged && selectedSegmentChecksum == null && this.target.segment != null) {
        // the segment checksum was unset on the server, so accept the current segment changes
        this.target.segment.acceptChanges();
      }
    }
  }

  private subscribeClickEvents(segments: string[]): void {
    if (this.target == null) {
      return;
    }
    for (const segment of segments) {
      // If a note is in the middle of a segment, the editor may have two segments with the same data-segment.
      // This will not affect the text in the Realtime Server, as ShareDB will combine the segments together again.
      const elements = this.target.editor?.container.querySelectorAll(
        `usx-segment[data-segment="${segment}"] display-note`
      );
      if (elements == null) {
        continue;
      }
      this.clickSubs.get(segment)?.forEach(s => s.unsubscribe());
      this.clickSubs.set(
        segment,
        Array.from(elements).map((element: Element) =>
          fromEvent<MouseEvent>(element, 'click')
            .pipe(quietTakeUntilDestroyed(this.destroyRef))
            .subscribe(event => {
              if (this.bookNum == null) {
                return;
              }
              const threadDataId: string | undefined = threadIdFromMouseEvent(event);
              if (threadDataId != null) {
                void this.showNoteThread(threadDataId);
                this.target?.formatEmbed(threadDataId, 'note-thread-embed', {
                  ['highlight']: false
                });
                this.updateReadNotes(threadDataId);
              }
              // stops the event from causing the segment to be selected
              event.stopPropagation();
            })
        )
      );
    }
  }

  private subscribeCommentingSelectionEvents(): void {
    if (this.target == null || this.userRole == null || !this.showAddCommentUI || this.hasEditRight) return;
    this.selectionClickSubs.forEach(s => s.unsubscribe());

    for (const [segment] of this.target.segments) {
      if (!VERSE_REGEX.test(segment)) continue;
      const segmentElement: Element | null = this.target.getSegmentElement(segment);
      if (segmentElement == null) continue;

      this.selectionClickSubs.push(
        fromEvent<MouseEvent>(segmentElement, 'click')
          .pipe(quietTakeUntilDestroyed(this.destroyRef))
          .subscribe(event => {
            if (this.bookNum == null || this.target == null) return;
            const verseRef: VerseRef | undefined = verseRefFromMouseEvent(event, this.bookNum);
            this.toggleVerseRefElement(verseRef);
          })
      );
    }
  }

  private async getSourceProjectDoc(): Promise<SFProjectProfileDoc | undefined> {
    // Only get the project doc if the user is on the project to avoid an error.
    if (this.sourceProjectId == null) return undefined;
    if (this.currentUser?.sites[environment.siteId].projects.includes(this.sourceProjectId) !== true) return undefined;
    return await this.projectService.getProfile(this.sourceProjectId);
  }

  private async loadNoteThreadDocs(sfProjectId: string, bookNum: number, chapterNum: number): Promise<void> {
    this.noteThreadQuery?.dispose();
    this.noteThreadQuery = await this.projectService.queryNoteThreads(
      sfProjectId,
      bookNum,
      chapterNum,
      this.destroyRef
    );

    this.toggleNoteThreadSub?.unsubscribe();
    this.toggleNoteThreadSub = merge(
      this.toggleNoteThreadVerseRefs$,
      this.noteThreadQuery.ready$.pipe(filter(isReady => isReady)),
      this.noteThreadQuery.remoteChanges$,
      this.noteThreadQuery.remoteDocChanges$
    )
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.toggleNoteThreadVerses(false);
        this.toggleNoteThreadVerses(true);
        if (this.userRole != null && this.showAddCommentUI) {
          this.subscribeCommentingSelectionEvents();
        }
      });
  }

  private async loadProjectUserConfig(bookNum: number, chapterFromUrl?: number): Promise<void> {
    let chapter: number =
      chapterFromUrl ?? this.projectDoc?.data?.texts.find(t => t.bookNum === bookNum)?.chapters[0].number ?? 1;

    if (chapterFromUrl == null && this.projectUserConfigDoc?.data != null) {
      if (this.text != null && this.projectUserConfigDoc.data.selectedBookNum === this.text.bookNum) {
        if (
          this.projectUserConfigDoc.data.selectedChapterNum != null &&
          this.chapters.includes(this.projectUserConfigDoc.data.selectedChapterNum)
        ) {
          chapter = this.projectUserConfigDoc.data.selectedChapterNum;
        }
      }
    }

    if (!this.chapters.includes(chapter)) {
      this.loadingFinished();
      this.chapter = this.chapters[0] ?? 1;
      return;
    }
    this.toggleNoteThreadVerses(false);
    this.chapter$.next(chapter);
    await this.changeText();
    this.toggleNoteThreadVerses(true);
    await this.updateDraftTabVisibility();
    await this.updateBiblicalTermsTabVisibility();
  }

  /**
   * Opens a MAT dialog and records the current editor selection if one exists
   * and return the cursor to that position on dialog close.
   */
  private openMatDialog<T, D = any, R = any>(
    component: ComponentType<T>,
    dialogConfig: MatDialogConfig<D>
  ): MatDialogRef<T, R> {
    const selection: Range | null | undefined = this.target?.editor?.getSelection();
    const targetScrollTop: number | undefined = this.targetScrollContainer?.scrollTop;
    const dialogRef: MatDialogRef<T, R> = this.dialogService.openMatDialog(component, dialogConfig);

    if (selection == null || !this.canEdit) {
      return dialogRef;
    }

    const subscription: Subscription = dialogRef.afterClosed().subscribe(() => {
      if (this.target?.editor != null && this.dialogService.openDialogCount === 0) {
        const currentSelection: Range | null | undefined = this.target.editor.getSelection();

        if (currentSelection?.index !== selection.index) {
          this.target.editor.setSelection(selection.index, 0, 'user');

          if (this.targetScrollContainer != null && targetScrollTop != null) {
            this.targetScrollContainer.scrollTop = targetScrollTop;
          }
        }
      }
      subscription.unsubscribe();
    });

    return dialogRef;
  }

  /** Gets the information needed to format a particular featured verse. */
  private getFeaturedVerseRefInfo(threadDoc: NoteThreadDoc): FeaturedVerseRefInfo | undefined {
    const notes: Note[] = threadDoc.notesInOrderClone(threadDoc.data!.notes);
    let preview: string = notes[0].content != null ? stripHtml(notes[0].content.trim()) : '';
    const numberOfNotes: number = notes.filter(n => !n.deleted).length;
    if (numberOfNotes > 1) {
      preview += '\n' + this.i18n.translateStatic('editor.more_notes', { count: numberOfNotes - 1 });
    }
    const verseRef: VerseRef | undefined = threadDoc.currentVerseRef();
    if (threadDoc.data == null || verseRef == null) {
      return undefined;
    }
    const hasNewContent: boolean = this.hasNewContent(threadDoc);
    const otherAssigned: boolean = threadDoc.isAssignedToOtherUser(this.userService.currentUserId, this.paratextUsers);
    const icon: NoteThreadIcon =
      threadDoc.data.biblicalTermId != null
        ? defaultNoteThreadIcon(BIBLICAL_TERM_TAG_ICON)
        : otherAssigned
          ? threadDoc.getIconGrayed(this.noteTags)
          : threadDoc.getIcon(this.noteTags);

    return {
      verseRef,
      id: threadDoc.data.dataId,
      preview,
      icon,
      textAnchor: threadDoc.data.position,
      highlight: hasNewContent
    };
  }

  /** Update the text anchors for the note threads in the current segment. */
  private async updateVerseNoteThreadAnchors(affectedEmbeds: EmbedsByVerse[], delta: Delta): Promise<void> {
    if (this.target == null || this.noteThreadQuery == null || this.noteThreadQuery.docs.length < 1) {
      return;
    }
    if (delta.ops == null || delta.ops.length < 2) {
      // If the length is less than two, it can be skipped since productive ops have a minimum length of two
      return;
    }

    const updatePromises: Promise<boolean>[] = [];

    // a user initiated delta with ops that include inserting a note embed can only be undo deleting a note icon
    const reinsertedNoteEmbeds: DeltaOperation[] = delta.filter(
      op => op.insert != null && op.insert['note-thread-embed'] != null
    );
    const reinsertedNoteIds: string[] = [];
    reinsertedNoteEmbeds.forEach(n => {
      if (isString(n.attributes?.['threadid'])) {
        reinsertedNoteIds.push(n.attributes['threadid']);
      }
    });
    const textInsertOps: DeltaOperation[] = delta.filter(
      ops => ops.insert != null && ops.insert['note-thread-embed'] == null
    );
    const textDeleteOps: DeltaOperation[] = delta.filter(ops => ops.delete != null);
    const hasTextEditOp: boolean = textInsertOps.length > 0 || textDeleteOps.length > 0;
    for (const affected of affectedEmbeds) {
      const editPosition: number | undefined = this.getEditPositionWithinRange(affected.verseRange, delta);
      if (editPosition == null) {
        continue;
      }
      for (const [threadId, notePos] of affected.embeds.entries()) {
        const noteThreadDoc: NoteThreadDoc | undefined = this.noteThreadQuery.docs.find(
          n => n.data?.dataId === threadId
        );
        if (noteThreadDoc?.data == null) {
          continue;
        }

        const noteCountInTextAnchor: number = this.getEmbedCountInAnchorRange(
          affected.embeds,
          notePos,
          noteThreadDoc.data.position.length
        );
        const noteAnchorEndIndex: number = notePos + noteThreadDoc.data.position.length + noteCountInTextAnchor;
        const isUndoingDeleteNoteEmbed: boolean = reinsertedNoteEmbeds.length > 0;
        // A note anchor is only affected by the undo operation if the delta includes inserting the note embed, or
        // if the edit op occurs before the note text anchor last character
        // i.e. note anchors are unaffected if the edit index comes after the note and anchor
        const noteIsAffected: boolean = noteAnchorEndIndex >= editPosition || reinsertedNoteIds.includes(threadId);
        if (isUndoingDeleteNoteEmbed && noteIsAffected && hasTextEditOp) {
          updatePromises.push(
            noteThreadDoc
              .previousSnapshot()
              .then(s => noteThreadDoc.submitJson0Op(op => op.set(n => n.position, s.data.position)))
          );
          continue;
        }

        const oldNotePosition: TextAnchor = noteThreadDoc.data.position ?? {
          start: 0,
          length: 0
        };
        const newTextAnchor: TextAnchor | undefined = this.getUpdatedTextAnchor(
          oldNotePosition,
          affected.embeds,
          notePos,
          affected.verseRange,
          delta
        );
        if (isEqual(oldNotePosition, newTextAnchor)) {
          continue;
        }
        updatePromises.push(noteThreadDoc.submitJson0Op(op => op.set(n => n.position, newTextAnchor)));
      }
      await Promise.all(updatePromises);

      // Re-apply the underline style to notes that were re-inserted
      const embedPositions: Readonly<Map<string, number>> = this.target.embeddedElements;
      for (const id of reinsertedNoteIds) {
        const position: number | undefined = embedPositions.get(id);
        if (position != null) {
          this.target.editor?.formatText(position, 1, 'text-anchor', 'true', 'api');
        }
      }
    }
  }

  private positionInsertNoteFab(): void {
    if (this.insertNoteFab == null || this.target?.editor == null || this.addingMobileNote) return;
    // getSelection can steal the focus, so we should not call this if the add mobile note bottom sheet is open
    const selection: Range | null | undefined = this.target.editor.getSelection();
    // quill has no selection when the editor is not focused (e.g. after the add note bottom sheet or dialog
    // closes), but while a verse is still selected the FAB should stay available and anchored to it
    if (selection != null || this.commenterSelectedVerseRef != null) {
      this.insertNoteFab.nativeElement.style.top = `${this.target.selectionBoundsTop}px`;
      this.insertNoteFab.nativeElement.style.marginTop = `-${this.target.scrollPosition}px`;
    } else {
      // hide the insert note FAB when the user clicks outside of the editor
      // and move to the top left so scrollbars are note affected
      this.insertNoteFab.nativeElement.style.top = '0px';
      this.insertNoteFab.nativeElement.style.marginTop = '0px';
      this.showAddCommentButton = false;
    }
  }

  private toggleVerseRefElement(verseRef?: VerseRef): void {
    if (
      verseRef == null ||
      this.target == null ||
      !this.targetLoaded ||
      this.userRole == null ||
      !this.showAddCommentUI
    )
      return;
    const verseSegments: string[] = this.target.getCompatibleSegments(verseRef);
    const segmentElement: Element | null = this.target.getSegmentElement(verseSegments[0]);
    if (segmentElement == null) {
      return;
    }

    // always keep the selection current even if the note dialog was opened
    let allowToggleVerseSelection: boolean = true;
    if (this.commenterSelectedVerseRef != null && verseRef.equals(this.commenterSelectedVerseRef)) {
      allowToggleVerseSelection = !this.hasEditRight;
    }
    if (allowToggleVerseSelection) {
      this.showAddCommentButton = this.target.toggleVerseSelection(verseRef);
      this.positionInsertNoteFab();
    }
    if (!this.isInsertNoteFabEnabled) {
      this.setNoteFabVisibility('hidden');
    }

    if (this.commenterSelectedVerseRef != null) {
      if (verseRef.equals(this.commenterSelectedVerseRef)) {
        if (!this.hasEditRight) {
          this.commenterSelectedVerseRef = undefined;
        }
        return;
      }
      // un-select previously selected verses since a note can apply to only one verse.
      this.target.toggleVerseSelection(this.commenterSelectedVerseRef);
    }
    this.commenterSelectedVerseRef = verseRef;
  }

  /**
   * Updates the verse number, either setting it to the selected segment, or 0 if the segment is in another chapter.
   */
  private updateVerseNumber(): void {
    if (
      this.target?.segment != null &&
      this.target.segment.bookNum === this.bookNum &&
      this.target.segment.chapter === this.chapter
    ) {
      const verseRef: VerseRef | undefined = getVerseRefFromSegmentRef(this.bookNum, this.target.segment.ref);
      if (verseRef != null) {
        this._verse = verseRef.verse;
        return;
      }
    }

    // Default to no verse selected
    this._verse = '0';
  }

  /** Determine the number of embeds that are within an anchoring.
   * @param embeds Positions of embeds to consider.
   * @param embedIndex The position of an embed at the beginning of the anchoring, included in the resulting count.
   * @param anchorLength The text character count in the anchoring range, excludes length of embeds.
   */
  private getEmbedCountInAnchorRange(embeds: Map<string, number>, embedIndex: number, anchorLength: number): number {
    let embedCount = 0;
    let endIndex = embedIndex + anchorLength;
    // sort the indices so we count the segment embeds in ascending order
    const embedIndices: number[] = Array.from(embeds.values()).sort();
    for (const index of embedIndices) {
      if (index >= embedIndex) {
        if (index < endIndex) {
          embedCount++;
          // add the embed to the length to search
          endIndex++;
        } else {
          break;
        }
      }
    }
    return embedCount;
  }

  /** Gets the updated text anchor for a note thread given the positions of the old embeds and the text edit applied. */
  private getUpdatedTextAnchor(
    oldTextAnchor: TextAnchor,
    oldVerseEmbedPositions: Map<string, number>,
    noteIndex: number,
    verseRange: Range,
    delta: Delta
  ): TextAnchor | undefined {
    if (oldTextAnchor.start === 0 && oldTextAnchor.length === 0) {
      return oldTextAnchor;
    }
    const noteCount: number = this.getEmbedCountInAnchorRange(oldVerseEmbedPositions, noteIndex, oldTextAnchor.length);
    const noteAnchorEndIndex: number = noteIndex + oldTextAnchor.length + noteCount;
    const verseNotePositions = new Set(oldVerseEmbedPositions.values());
    const [startChange, lengthChange] = this.getAnchorChanges(
      noteIndex,
      noteAnchorEndIndex,
      verseRange,
      delta,
      verseNotePositions
    );

    if (oldTextAnchor.length > 0 && oldTextAnchor.length + lengthChange <= 0) {
      return { start: 0, length: 0 };
    }

    return {
      start: oldTextAnchor.start + startChange,
      length: oldTextAnchor.length + lengthChange
    };
  }

  private getAnchorChanges(
    embedPosition: number,
    noteAnchorEndIndex: number,
    verseRange: Range,
    delta: Delta,
    embedPositions: Set<number>
  ): [number, number] {
    let startChange: number = 0;
    let lengthChange: number = 0;
    if (delta.ops == null || delta.ops.length < 2) {
      return [0, 0];
    }
    let curIndex = 0;
    // get the length that was inserted or deleted to apply to the verse text anchors
    for (const op of delta.ops) {
      const insertOp: any = op.insert;
      const deleteOp: number | undefined = op.delete;
      const retainCount: number | undefined = getRetainCount(op);
      if (retainCount != null) {
        curIndex += retainCount;
        continue;
      }

      const editIsInVerseRange: boolean =
        curIndex >= verseRange.index && curIndex <= verseRange.index + verseRange.length;
      if (insertOp != null) {
        if (!editIsInVerseRange) continue;
        let length = 0;
        if (typeof insertOp === 'string') {
          length = insertOp.length;
        } else if (insertOp['note-thread-embed'] != null) {
          const embedId = insertOp['note-thread-embed']['threadid'];
          if (embedId != null) {
            continue;
          }
        } else {
          // the non-text insert always has a length of 1
          length = 1;
        }

        if (curIndex <= embedPosition) {
          startChange += length;
        } else if (curIndex > embedPosition && curIndex <= noteAnchorEndIndex) {
          // Note that if the user inserted text at the end of this note anchor, we consider
          // this inside the text anchor because the user could be expanding the last text anchor word.
          lengthChange += length;
        }
      } else if (deleteOp != null) {
        if (editIsInVerseRange) {
          const [deleteBefore, deleteWithin] = this.calculateDeletionUpdate(
            curIndex,
            embedPosition,
            noteAnchorEndIndex,
            deleteOp,
            embedPositions
          );
          startChange -= deleteBefore;
          lengthChange -= deleteWithin;
        }
        curIndex += deleteOp;
      }
    }

    return [startChange, lengthChange];
  }

  /** Gets the first edit position within the given range. */
  private getEditPositionWithinRange(range: Range, delta: Delta): number | undefined {
    if (delta.ops == null) {
      return undefined;
    }
    let curIndex = 0;
    for (const op of delta.ops) {
      const deleteOp: number | undefined = op.delete;
      const insertOp: any | undefined = op.insert;
      if ((deleteOp != null || insertOp != null) && curIndex >= range.index && curIndex <= range.index + range.length) {
        // the edit op occurs within the range
        return curIndex;
      }

      const retainCount: number = getRetainCount(op) ?? 0;
      curIndex += retainCount;
    }
    return undefined;
  }

  private calculateDeletionUpdate(
    editPosition: number,
    embedPosition: number,
    noteAnchorEndIndex: number,
    deleteLength: number,
    embedPositions: Set<number>
  ): [number, number] {
    let deleteBeforeLength = 0;
    let deleteWithinLength = 0;
    for (let charIndex = editPosition; charIndex < editPosition + deleteLength; charIndex++) {
      if (embedPositions.has(charIndex)) {
        // The edit involves deleting an embed icon. It neither counts as length within nor before
        continue;
      }
      if (charIndex === embedPosition) {
        console.warn(
          `Warning: getUpdatedTextAnchor: No embed at position ${embedPosition} was found in embedPositions:`,
          embedPositions
        );
      }
      if (charIndex < embedPosition) {
        deleteBeforeLength++;
      } else if (charIndex > embedPosition && charIndex < noteAnchorEndIndex) {
        deleteWithinLength++;
      } else {
        break;
      }
    }
    return [deleteBeforeLength, deleteWithinLength];
  }

  private currentChapterNoteThreadDocs(): NoteThreadDoc[] {
    if (
      this.noteThreadQuery?.docs == null ||
      this.noteThreadQuery.docs.length < 1 ||
      this.bookNum == null ||
      this.chapter == null
    ) {
      return [];
    }
    // only show notes that are from this chapter, are notes for biblical terms, and is not a conflict note
    return this.noteThreadQuery.docs.filter(
      nt =>
        nt.data != null &&
        nt.data.notes.filter(n => !n.deleted).length > 0 &&
        nt.data.biblicalTermId == null &&
        nt.data.notes[0].type !== NoteType.Conflict
    );
  }

  private embedNoteThread(featured: FeaturedVerseRefInfo, role: string): string | undefined {
    if (this.target == null) {
      return undefined;
    }

    const format = {
      iconsrc: featured.icon.cssVar,
      preview: featured.preview,
      threadid: featured.id
    };
    if (featured.highlight) {
      format['highlight'] = featured.highlight;
    }
    return this.target.embedElementInline(
      featured.verseRef,
      featured.id,
      role,
      featured.textAnchor ?? { start: 0, length: 0 },
      'note-thread-embed',
      format
    );
  }

  private resetCommenterVerseSelection(): void {
    if (this.target != null && this.commenterSelectedVerseRef != null) {
      this.target.toggleVerseSelection(this.commenterSelectedVerseRef);
      this.commenterSelectedVerseRef = undefined;
    }
    this.showAddCommentButton = false;
  }

  private hasNewContent(thread: NoteThreadDoc): boolean {
    if (thread.data == null || this.projectUserConfigDoc?.data == null) return false;
    // look for any note that has not been read and was authored by another user
    const noteRefsRead: string[] = this.projectUserConfigDoc.data.noteRefsRead;
    return thread.data.notes.some(
      n => n.ownerRef !== this.userService.currentUserId && !noteRefsRead.includes(n.dataId) && !n.deleted
    );
  }

  private syncScroll(): void {
    if (
      !this.hasSource ||
      this.source == null ||
      this.source.segment == null ||
      this.source.editor == null ||
      this.sourceScrollContainer == null ||
      this.target == null ||
      this.target.segment == null ||
      this.target.editor == null ||
      !this.targetFocused
    ) {
      return;
    }

    const targetRange: Range = this.target.segment.range;
    const targetSelectionBounds: DOMRect | Bounds = this.target.editor.selection.getBounds(targetRange.index)!;

    const sourceRange: Range = this.source.segment.range;
    const sourceSelectionBounds: DOMRect | Bounds = this.source.editor.selection.getBounds(
      sourceRange.index,
      sourceRange.length
    )!;

    let newScrollTop: number =
      this.sourceScrollContainer.scrollTop + sourceSelectionBounds.top - targetSelectionBounds.top;

    // Check to see if the top of source selection would be visible after the scroll adjustment
    const sourceTopPosition: number =
      sourceSelectionBounds.top - this.sourceScrollContainer.getBoundingClientRect().top;

    // Check to see if the bottom of source selection would be visible after the scroll adjustment
    const sourceBottomPosition: number =
      sourceTopPosition + sourceSelectionBounds.height - this.sourceScrollContainer.clientHeight;

    // Adjust the scroll to ensure the selection fits within the container
    // Only adjust the bottom position so long as that doesn't hide the top position i.e. a long verse(s)
    if (sourceTopPosition < 0) {
      newScrollTop += sourceTopPosition;
    } else if (sourceBottomPosition > 0 && sourceTopPosition - sourceBottomPosition > 0) {
      newScrollTop += sourceBottomPosition;
    }

    this.sourceScrollContainer.scrollTop = newScrollTop;
  }

  private observeResize(scrollContainer: Element): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(entries => {
      entries.forEach(_ => {
        this.keepInsertNoteFabInView(scrollContainer);
      });
    });
    this.resizeObserver.observe(scrollContainer);
  }

  private subscribeScroll(scrollContainer: Element): void {
    this.scrollSubscription?.unsubscribe();
    this.scrollSubscription = fromEvent(scrollContainer, 'scroll')
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.keepInsertNoteFabInView(scrollContainer);
      });
  }

  private keepInsertNoteFabInView(scrollContainer: Element): void {
    if (
      this.insertNoteFab == null ||
      this.target == null ||
      this.target.editor == null ||
      this.targetScrollContainer == null
    ) {
      return;
    }

    const bounds: DOMRect = scrollContainer.getBoundingClientRect();
    const fabTop = this.target.selectionBoundsTop - this.fabVerticalCushion;
    const fabBottom = this.target.selectionBoundsTop + this.fabDiameter + this.fabVerticalCushion;

    // Editor top is FAB upper bound
    const fabTopAdjustment = Math.min(fabTop, scrollContainer.scrollTop);

    // Editor bottom is FAB lower bound
    const minAdjustment: number = Math.max(fabBottom - bounds.height, 0);

    this.insertNoteFab.nativeElement.style.marginTop = `-${Math.max(fabTopAdjustment, minAdjustment)}px`;
  }

  /**
   * Subscribes to project- and user-level lynx config changes and updates lynx feature states accordingly.
   */
  private initLynxFeatureStates(projectUserConfigDoc: SFProjectUserConfigDoc | undefined): void {
    this.initializeLynxStateSub?.unsubscribe();
    this.initializeLynxStateSub = combineLatest([
      this.canEdit$.pipe(map(canEdit => canEdit ?? false)),
      this.activatedProject.changes$.pipe(map(projectDoc => projectDoc?.data?.lynxConfig)),
      projectUserConfigDoc?.changes$.pipe(
        startWith(projectUserConfigDoc),
        map(() => projectUserConfigDoc?.data?.lynxInsightState)
      ) ?? of(undefined)
    ])
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(([canEdit, lynxProjectConfig, lynxInsightState]) => {
        // Enable lynx features only if user can edit chapter and lynx is enabled in both project AND user settings
        this.lynxInsightsEnabled =
          canEdit && (lynxProjectConfig?.assessmentsEnabled ?? false) && (lynxInsightState?.assessmentsEnabled ?? true);
        this.lynxAutoCorrectionsEnabled =
          canEdit &&
          (lynxProjectConfig?.autoCorrectionsEnabled ?? false) &&
          (lynxInsightState?.autoCorrectionsEnabled ?? true);
      });
  }
}
