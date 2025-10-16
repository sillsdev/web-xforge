import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { cloneDeep } from 'lodash-es';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { Delta } from 'quill';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { ParagraphBreakFormat, QuoteFormat } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { BehaviorSubject, of } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { DialogService } from 'xforge-common/dialog.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { Revision } from '../../../core/paratext.service';
import { BuildDto } from '../../../machine-api/build-dto';
import { BuildStates } from '../../../machine-api/build-states';
import { SharedModule } from '../../../shared/shared.module';
import { EDITOR_READY_TIMEOUT } from '../../../shared/text/text.component';
import { DraftSegmentMap } from '../../draft-generation/draft-generation';
import { DraftGenerationService } from '../../draft-generation/draft-generation.service';
import { DraftHandlingService } from '../../draft-generation/draft-handling.service';
import { HistoryRevisionFormatPipe } from '../editor-history/history-chooser/history-revision-format.pipe';
import { EditorDraftComponent } from './editor-draft.component';

const mockDraftGenerationService = mock(DraftGenerationService);
const mockActivatedProjectService = mock(ActivatedProjectService);
const mockDraftHandlingService = mock(DraftHandlingService);
const mockI18nService = mock(I18nService);
const mockDialogService = mock(DialogService);
const mockNoticeService = mock(NoticeService);
const mockErrorReportingService = mock(ErrorReportingService);
const mockFeatureFlagService = mock(FeatureFlagService);

describe('EditorDraftComponent', () => {
  let fixture: ComponentFixture<EditorDraftComponent>;
  let component: EditorDraftComponent;
  let testOnlineStatus: TestOnlineStatusService;
  const buildProgress$ = new BehaviorSubject<BuildDto | undefined>(undefined);

  configureTestingModule(() => ({
    declarations: [EditorDraftComponent, HistoryRevisionFormatPipe],
    imports: [
      MatProgressBarModule,
      MatSelectModule,
      MatIconModule,
      MatTooltipModule,
      NoopAnimationsModule,
      SharedModule.forRoot(),
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      TestTranslocoModule,
      TranslocoMarkupModule
    ],
    providers: [
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: DraftGenerationService, useMock: mockDraftGenerationService },
      { provide: DraftHandlingService, useMock: mockDraftHandlingService },
      { provide: I18nService, useMock: mockI18nService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: DialogService, useMock: mockDialogService },
      { provide: NoticeService, useMock: mockNoticeService },
      { provide: ErrorReportingService, useMock: mockErrorReportingService },
      { provide: FeatureFlagService, useMock: mockFeatureFlagService }
    ]
  }));

  beforeEach(() => {
    when(mockFeatureFlagService.usfmFormat).thenReturn(createTestFeatureFlag(true));
    when(mockDraftGenerationService.pollBuildProgress(anything())).thenReturn(buildProgress$.asObservable());
    buildProgress$.next({ state: BuildStates.Completed } as BuildDto);
    when(mockActivatedProjectService.projectId$).thenReturn(of('targetProjectId'));
    when(mockDraftGenerationService.getLastCompletedBuild(anything())).thenReturn(of(undefined));

    fixture = TestBed.createComponent(EditorDraftComponent);
    component = fixture.componentInstance;

    testOnlineStatus = TestBed.inject(OnlineStatusService) as TestOnlineStatusService;

    component.projectId = 'targetProjectId';
    component.bookNum = 1;
    component.chapter = 1;
    component.isRightToLeft = false;
    component.ngOnChanges();
  });

  it('should handle offline when component created', fakeAsync(() => {
    testOnlineStatus.setIsOnline(false);
    fixture.detectChanges();
    expect(component.draftCheckState).toEqual('draft-unknown');
    expect(component.draftText).not.toBeUndefined();
    flush();
  }));

  it('should handle build is finishing', fakeAsync(() => {
    buildProgress$.next({ state: BuildStates.Finishing } as BuildDto);
    const testProjectDoc: SFProjectProfileDoc = {
      data: createTestProjectProfile()
    } as SFProjectProfileDoc;
    when(mockFeatureFlagService.newDraftHistory).thenReturn(createTestFeatureFlag(true));
    when(mockDraftGenerationService.draftExists(anything(), anything(), anything())).thenReturn(of(true));
    when(mockDraftGenerationService.getGeneratedDraftHistory(anything(), anything(), anything())).thenReturn(
      of(draftHistory)
    );
    when(mockActivatedProjectService.changes$).thenReturn(of(testProjectDoc));
    spyOn<any>(component, 'getTargetOps').and.returnValue(of(targetDelta.ops!));
    when(mockDraftHandlingService.getDraft(anything(), anything())).thenReturn(of(cloneDeep(draftDelta.ops!)));
    when(mockDraftHandlingService.draftDataToOps(anything(), anything())).thenReturn(draftDelta.ops!);
    when(mockDraftHandlingService.isDraftSegmentMap(anything())).thenReturn(false);

    fixture.detectChanges();
    tick(EDITOR_READY_TIMEOUT);

    verify(mockDraftHandlingService.getDraft(anything(), anything())).never();
    verify(mockDraftHandlingService.draftDataToOps(anything(), anything())).never();
    expect(component.draftCheckState).toEqual('draft-unknown');
    expect(component.draftText).not.toBeUndefined();

    buildProgress$.next({ state: BuildStates.Completed } as BuildDto);
    fixture.detectChanges();
    tick(EDITOR_READY_TIMEOUT);

    verify(mockDraftHandlingService.getDraft(anything(), anything())).once();
    verify(mockDraftHandlingService.draftDataToOps(anything(), anything())).once();
    expect(component.draftCheckState).toEqual('draft-present');
    expect(component.draftText).not.toBeUndefined();
    flush();
  }));

  it('should populate draft text correctly and then handle going offline/online', fakeAsync(() => {
    const testProjectDoc: SFProjectProfileDoc = {
      data: createTestProjectProfile()
    } as SFProjectProfileDoc;

    when(mockFeatureFlagService.newDraftHistory).thenReturn(createTestFeatureFlag(false));
    when(mockActivatedProjectService.changes$).thenReturn(of(testProjectDoc));
    when(mockDraftGenerationService.draftExists(anything(), anything(), anything())).thenReturn(of(true));
    when(mockDraftGenerationService.getGeneratedDraftHistory(anything(), anything(), anything())).thenReturn(
      of(draftHistory)
    );
    when(mockDraftHandlingService.getDraft(anything(), anything())).thenReturn(of(draftMap));
    when(mockDraftHandlingService.draftDataToOps(anything(), anything())).thenReturn(draftDelta.ops!);
    when(mockDraftHandlingService.isDraftSegmentMap(anything())).thenReturn(true);
    spyOn<any>(component, 'getTargetOps').and.returnValue(of(targetDelta.ops!));

    testOnlineStatus.setIsOnline(false);
    fixture.detectChanges();
    tick(EDITOR_READY_TIMEOUT);
    expect(component.draftCheckState).toEqual('draft-unknown');

    testOnlineStatus.setIsOnline(true);
    tick(EDITOR_READY_TIMEOUT);
    expect(component.draftCheckState).toEqual('draft-legacy');
    expect(component.draftText.editor!.getContents().ops).toEqual(draftDelta.ops);

    testOnlineStatus.setIsOnline(false);
    fixture.detectChanges();
    expect(component.draftCheckState).toEqual('draft-legacy'); // Display if already fetched

    testOnlineStatus.setIsOnline(true);
    tick(EDITOR_READY_TIMEOUT);
    fixture.detectChanges();
    expect(component.draftCheckState).toEqual('draft-legacy');
    expect(component.draftText.editor!.getContents().ops).toEqual(draftDelta.ops);

    fixture.detectChanges();
    tick(EDITOR_READY_TIMEOUT);
    flush();
  }));

  it('should return ops and update the editor', fakeAsync(() => {
    const testProjectDoc: SFProjectProfileDoc = {
      data: createTestProjectProfile()
    } as SFProjectProfileDoc;
    when(mockDraftGenerationService.draftExists(anything(), anything(), anything())).thenReturn(of(true));
    when(mockDraftGenerationService.getGeneratedDraftHistory(anything(), anything(), anything())).thenReturn(
      of(draftHistory)
    );
    when(mockActivatedProjectService.changes$).thenReturn(of(testProjectDoc));
    spyOn<any>(component, 'getTargetOps').and.returnValue(of(targetDelta.ops!));
    when(mockDraftHandlingService.getDraft(anything(), anything())).thenReturn(of(cloneDeep(draftDelta.ops!)));
    when(mockDraftHandlingService.draftDataToOps(anything(), anything())).thenReturn(draftDelta.ops!);
    when(mockDraftHandlingService.isDraftSegmentMap(anything())).thenReturn(false);

    fixture.detectChanges();
    tick(EDITOR_READY_TIMEOUT);

    verify(mockDraftHandlingService.getDraft(anything(), anything())).once();
    verify(mockDraftHandlingService.draftDataToOps(anything(), anything())).once();
    expect(component.draftCheckState).toEqual('draft-present');
    expect(component.draftText.editor!.getContents().ops).toEqual(draftDelta.ops);
    flush();
  }));

  it('should support a timestamp earlier than the oldest draft', fakeAsync(() => {
    const testProjectDoc: SFProjectProfileDoc = {
      data: createTestProjectProfile()
    } as SFProjectProfileDoc;
    when(mockFeatureFlagService.newDraftHistory).thenReturn(createTestFeatureFlag(true));
    when(mockDraftGenerationService.draftExists(anything(), anything(), anything())).thenReturn(of(true));
    when(mockDraftGenerationService.getGeneratedDraftHistory(anything(), anything(), anything())).thenReturn(
      of(draftHistory)
    );
    when(mockActivatedProjectService.changes$).thenReturn(of(testProjectDoc));
    spyOn<any>(component, 'getTargetOps').and.returnValue(of(targetDelta.ops!));
    when(mockDraftHandlingService.getDraft(anything(), anything())).thenReturn(of(cloneDeep(draftDelta.ops!)));
    when(mockDraftHandlingService.draftDataToOps(anything(), anything())).thenReturn(draftDelta.ops!);
    when(mockDraftHandlingService.isDraftSegmentMap(anything())).thenReturn(false);

    // Set the date to a time before the earliest draft
    fixture.componentInstance.timestamp = new Date('2024-03-22T03:02:01Z');

    // SUT
    fixture.detectChanges();
    tick(EDITOR_READY_TIMEOUT);

    verify(mockDraftHandlingService.getDraft(anything(), anything())).once();
    verify(mockDraftHandlingService.draftDataToOps(anything(), anything())).once();
    expect(component.draftCheckState).toEqual('draft-present');
    expect(component.draftText.editor!.getContents().ops).toEqual(draftDelta.ops);
    flush();
  }));

  it('should support a timestamp close to the oldest draft', fakeAsync(() => {
    const testProjectDoc: SFProjectProfileDoc = {
      data: createTestProjectProfile()
    } as SFProjectProfileDoc;
    when(mockFeatureFlagService.newDraftHistory).thenReturn(createTestFeatureFlag(true));
    when(mockDraftGenerationService.draftExists(anything(), anything(), anything())).thenReturn(of(true));
    when(mockDraftGenerationService.getGeneratedDraftHistory(anything(), anything(), anything())).thenReturn(
      of(draftHistory)
    );
    when(mockActivatedProjectService.changes$).thenReturn(of(testProjectDoc));
    spyOn<any>(component, 'getTargetOps').and.returnValue(of(targetDelta.ops!));
    when(mockDraftHandlingService.getDraft(anything(), anything())).thenReturn(of(cloneDeep(draftDelta.ops!)));
    when(mockDraftHandlingService.draftDataToOps(anything(), anything())).thenReturn(draftDelta.ops!);
    when(mockDraftHandlingService.isDraftSegmentMap(anything())).thenReturn(false);

    // Set the date to a time just before the earliest draft
    // This will account for the delay in storing the draft
    const timestamp = new Date(draftHistory[0].timestamp);
    timestamp.setMinutes(timestamp.getMinutes() - 10);
    fixture.componentInstance.timestamp = timestamp;

    // SUT
    fixture.detectChanges();
    tick(EDITOR_READY_TIMEOUT);

    verify(mockDraftHandlingService.getDraft(anything(), anything())).once();
    verify(mockDraftHandlingService.draftDataToOps(anything(), anything())).once();
    expect(component.draftCheckState).toEqual('draft-present');
    expect(component.draftText.editor!.getContents().ops).toEqual(draftDelta.ops);
    flush();
  }));

  it('should show previous draft when history is enabled and not timestamp is provided', fakeAsync(() => {
    const testProjectDoc: SFProjectProfileDoc = {
      data: createTestProjectProfile()
    } as SFProjectProfileDoc;
    when(mockFeatureFlagService.newDraftHistory).thenReturn(createTestFeatureFlag(true));
    when(mockDraftGenerationService.draftExists(anything(), anything(), anything())).thenReturn(of(false));
    when(mockDraftGenerationService.getGeneratedDraftHistory(anything(), anything(), anything())).thenReturn(
      of(draftHistory)
    );
    when(mockActivatedProjectService.changes$).thenReturn(of(testProjectDoc));
    spyOn<any>(component, 'getTargetOps').and.returnValue(of(targetDelta.ops!));
    when(mockDraftHandlingService.getDraft(anything(), anything())).thenReturn(of(cloneDeep(draftDelta.ops!)));
    when(mockDraftHandlingService.draftDataToOps(anything(), anything())).thenReturn(draftDelta.ops!);
    when(mockDraftHandlingService.isDraftSegmentMap(anything())).thenReturn(false);

    // SUT
    fixture.detectChanges();
    tick(EDITOR_READY_TIMEOUT);

    verify(mockDraftHandlingService.getDraft(anything(), anything())).once();
    verify(mockDraftHandlingService.draftDataToOps(anything(), anything())).once();
    expect(component.draftCheckState).toEqual('draft-present');
    expect(component.draftText.editor!.getContents().ops).toEqual(draftDelta.ops);
    flush();
  }));

  it('should show draft empty when history is enabled and the draft does not have verse content', fakeAsync(() => {
    const testProjectDoc: SFProjectProfileDoc = {
      data: createTestProjectProfile()
    } as SFProjectProfileDoc;
    when(mockFeatureFlagService.newDraftHistory).thenReturn(createTestFeatureFlag(true));
    when(mockDraftGenerationService.draftExists(anything(), anything(), anything())).thenReturn(of(false));
    when(mockDraftGenerationService.getGeneratedDraftHistory(anything(), anything(), anything())).thenReturn(
      of(draftHistory)
    );
    when(mockActivatedProjectService.changes$).thenReturn(of(testProjectDoc));
    spyOn<any>(component, 'getTargetOps').and.returnValue(of(targetDelta.ops!));
    when(mockDraftHandlingService.getDraft(anything(), anything())).thenReturn(of(cloneDeep(emptyDraftDelta.ops!)));
    when(mockDraftHandlingService.draftDataToOps(anything(), anything())).thenReturn(emptyDraftDelta.ops!);
    when(mockDraftHandlingService.isDraftSegmentMap(anything())).thenReturn(false);

    // SUT
    fixture.detectChanges();
    tick(EDITOR_READY_TIMEOUT);

    verify(mockDraftHandlingService.getDraft(anything(), anything())).once();
    verify(mockDraftHandlingService.draftDataToOps(anything(), anything())).once();
    expect(component.draftCheckState).toEqual('draft-empty');
    flush();
  }));

  it('should show draft empty if earlier draft exists but history is not enabled', fakeAsync(() => {
    const testProjectDoc: SFProjectProfileDoc = {
      data: createTestProjectProfile()
    } as SFProjectProfileDoc;
    when(mockFeatureFlagService.newDraftHistory).thenReturn(createTestFeatureFlag(false));
    when(mockDraftGenerationService.draftExists(anything(), anything(), anything())).thenReturn(of(false));
    when(mockDraftGenerationService.getGeneratedDraftHistory(anything(), anything(), anything())).thenReturn(
      of(draftHistory)
    );
    when(mockActivatedProjectService.changes$).thenReturn(of(testProjectDoc));
    spyOn<any>(component, 'getTargetOps').and.returnValue(of(targetDelta.ops!));

    fixture.detectChanges();
    tick(EDITOR_READY_TIMEOUT);

    verify(mockDraftHandlingService.getDraft(anything(), anything())).never();
    verify(mockDraftHandlingService.draftDataToOps(anything(), anything())).never();
    expect(component.draftCheckState).toEqual('draft-empty');
    flush();
  }));

  it('should return ops and update the editor when no revision', fakeAsync(() => {
    const testProjectDoc: SFProjectProfileDoc = {
      data: createTestProjectProfile()
    } as SFProjectProfileDoc;
    when(mockDraftGenerationService.draftExists(anything(), anything(), anything())).thenReturn(of(true));
    when(mockDraftGenerationService.getGeneratedDraftHistory(anything(), anything(), anything())).thenReturn(
      of(undefined)
    );
    when(mockActivatedProjectService.changes$).thenReturn(of(testProjectDoc));
    spyOn<any>(component, 'getTargetOps').and.returnValue(of(targetDelta.ops!));
    when(mockDraftHandlingService.getDraft(anything(), anything())).thenReturn(of(cloneDeep(draftDelta.ops!)));
    when(mockDraftHandlingService.draftDataToOps(anything(), anything())).thenReturn(draftDelta.ops!);
    when(mockDraftHandlingService.isDraftSegmentMap(anything())).thenReturn(false);

    fixture.detectChanges();
    tick(EDITOR_READY_TIMEOUT);

    verify(mockDraftHandlingService.getDraft(anything(), anything())).once();
    verify(mockDraftHandlingService.draftDataToOps(anything(), anything())).once();
    expect(component.draftCheckState).toEqual('draft-present');
    expect(component.draftText.editor!.getContents().ops).toEqual(draftDelta.ops);
    flush();
  }));

  it('should return ops and update the editor when the selected revision changes', fakeAsync(() => {
    const testProjectDoc: SFProjectProfileDoc = {
      data: createTestProjectProfile()
    } as SFProjectProfileDoc;
    when(mockFeatureFlagService.newDraftHistory).thenReturn(createTestFeatureFlag(false));
    when(mockDraftGenerationService.draftExists(anything(), anything(), anything())).thenReturn(of(true));
    when(mockDraftGenerationService.getGeneratedDraftHistory(anything(), anything(), anything())).thenReturn(
      of(draftHistory)
    );
    when(mockActivatedProjectService.changes$).thenReturn(of(testProjectDoc));
    spyOn<any>(component, 'getTargetOps').and.returnValue(of(targetDelta.ops!));
    when(mockDraftHandlingService.getDraft(anything(), anything())).thenReturn(of(cloneDeep(draftDelta.ops!)));
    when(mockDraftHandlingService.draftDataToOps(anything(), anything())).thenReturn(draftDelta.ops!);
    when(mockDraftHandlingService.isDraftSegmentMap(anything())).thenReturn(false);

    fixture.detectChanges();
    tick(EDITOR_READY_TIMEOUT);

    // SUT
    component.onSelectionChanged({ value: draftHistory[1] } as MatSelectChange);

    fixture.detectChanges();
    tick(EDITOR_READY_TIMEOUT);

    verify(mockDraftHandlingService.getDraft(anything(), anything())).twice();
    verify(mockDraftHandlingService.draftDataToOps(anything(), anything())).twice();
    expect(component.draftCheckState).toEqual('draft-present');
    expect(component.draftText.editor!.getContents().ops).toEqual(draftDelta.ops);
    flush();
  }));

  describe('applyDraft', () => {
    it('should allow user to apply draft when formatting selected', fakeAsync(() => {
      const testProjectDoc: SFProjectProfileDoc = {
        data: createTestProjectProfile({
          texts: [
            {
              bookNum: 1,
              chapters: [{ number: 1, permissions: { user01: SFProjectRole.ParatextAdministrator }, hasDraft: true }]
            }
          ],
          translateConfig: {
            draftConfig: {
              usfmConfig: { paragraphFormat: ParagraphBreakFormat.BestGuess, quoteFormat: QuoteFormat.Denormalized }
            }
          }
        })
      } as SFProjectProfileDoc;
      when(mockDraftGenerationService.draftExists(anything(), anything(), anything())).thenReturn(of(true));
      when(mockDraftGenerationService.getGeneratedDraftHistory(anything(), anything(), anything())).thenReturn(
        of(draftHistory)
      );
      when(mockActivatedProjectService.changes$).thenReturn(of(testProjectDoc));
      when(mockDialogService.confirm(anything(), anything())).thenResolve(true);
      when(mockDraftHandlingService.canApplyDraft(anything(), anything(), anything(), anything())).thenReturn(true);
      spyOn<any>(component, 'getTargetOps').and.returnValue(of(targetDelta.ops));
      when(mockDraftHandlingService.getDraft(anything(), anything())).thenReturn(of(draftDelta.ops!));
      when(mockDraftHandlingService.draftDataToOps(anything(), anything())).thenReturn(draftDelta.ops!);

      fixture.detectChanges();
      tick(EDITOR_READY_TIMEOUT);

      expect(component.canApplyDraft).toBe(true);
      flush();
    }));

    it('should show a prompt when applying if the target has content', fakeAsync(() => {
      const testProjectDoc: SFProjectProfileDoc = {
        data: createTestProjectProfile()
      } as SFProjectProfileDoc;
      when(mockDraftGenerationService.draftExists(anything(), anything(), anything())).thenReturn(of(true));
      when(mockDraftGenerationService.getGeneratedDraftHistory(anything(), anything(), anything())).thenReturn(
        of(draftHistory)
      );
      when(mockActivatedProjectService.changes$).thenReturn(of(testProjectDoc));
      when(mockDialogService.confirm(anything(), anything())).thenResolve(true);
      spyOn<any>(component, 'getTargetOps').and.returnValue(of(targetDelta.ops));
      when(mockDraftHandlingService.getDraft(anything(), anything())).thenReturn(of(draftDelta.ops!));
      when(mockDraftHandlingService.draftDataToOps(anything(), anything())).thenReturn(draftDelta.ops!);

      fixture.detectChanges();
      tick(EDITOR_READY_TIMEOUT);

      component.draftText.editor?.setContents(draftDelta);

      component.applyDraft();
      tick(EDITOR_READY_TIMEOUT);

      verify(mockDialogService.confirm(anything(), anything())).once();
      expect(component.isDraftApplied).toBe(true);
      flush();
    }));

    it('should not show a prompt when applying if the target has no content', fakeAsync(() => {
      const testProjectDoc: SFProjectProfileDoc = {
        data: createTestProjectProfile()
      } as SFProjectProfileDoc;
      when(mockDraftGenerationService.draftExists(anything(), anything(), anything())).thenReturn(of(true));
      when(mockDraftGenerationService.getGeneratedDraftHistory(anything(), anything(), anything())).thenReturn(
        of(draftHistory)
      );
      when(mockActivatedProjectService.changes$).thenReturn(of(testProjectDoc));
      spyOn<any>(component, 'getTargetOps').and.returnValue(of([]));
      when(mockDraftHandlingService.getDraft(anything(), anything())).thenReturn(of(draftDelta.ops!));
      when(mockDraftHandlingService.draftDataToOps(anything(), anything())).thenReturn(draftDelta.ops!);

      fixture.detectChanges();
      tick(EDITOR_READY_TIMEOUT);

      component.draftText.editor?.setContents(draftDelta);

      component.applyDraft();
      tick(EDITOR_READY_TIMEOUT);

      verify(mockDialogService.confirm(anything(), anything())).never();
      expect(component.isDraftApplied).toBe(true);
      flush();
    }));

    it('should throw error if there is no draft', fakeAsync(() => {
      component.applyDraft().catch(e => {
        expect(e).toEqual(new Error('No draft ops to apply.'));
      });
      flush();
    }));

    it('should apply draft using draft viewer service', fakeAsync(() => {
      const testProjectDoc: SFProjectProfileDoc = {
        data: createTestProjectProfile()
      } as SFProjectProfileDoc;
      when(mockDraftGenerationService.draftExists(anything(), anything(), anything())).thenReturn(of(true));
      when(mockDraftGenerationService.getGeneratedDraftHistory(anything(), anything(), anything())).thenReturn(
        of(draftHistory)
      );
      when(mockActivatedProjectService.changes$).thenReturn(of(testProjectDoc));
      when(mockDialogService.confirm(anything(), anything())).thenResolve(true);
      when(mockDraftHandlingService.getDraft(anything(), anything())).thenReturn(of(draftDelta.ops!));
      when(mockDraftHandlingService.draftDataToOps(anything(), anything())).thenReturn(draftDelta.ops!);
      spyOn<any>(component, 'getTargetOps').and.returnValue(of(targetDelta.ops));

      fixture.detectChanges();
      tick(EDITOR_READY_TIMEOUT);

      component.draftText.editor?.setContents(draftDelta);

      component.applyDraft();
      tick();

      expect(draftDelta.ops).toEqual(component['draftDelta']!.ops);
      verify(mockDraftHandlingService.applyChapterDraftAsync(component.textDocId!, component['draftDelta']!)).once();
      expect(component.isDraftApplied).toBe(true);
      flush();
    }));

    it('should show snackbar if applying a draft fails', fakeAsync(() => {
      const testProjectDoc: SFProjectProfileDoc = {
        data: createTestProjectProfile()
      } as SFProjectProfileDoc;
      when(mockDraftGenerationService.draftExists(anything(), anything(), anything())).thenReturn(of(true));
      when(mockDraftGenerationService.getGeneratedDraftHistory(anything(), anything(), anything())).thenReturn(
        of(draftHistory)
      );
      when(mockActivatedProjectService.changes$).thenReturn(of(testProjectDoc));
      when(mockDialogService.confirm(anything(), anything())).thenResolve(true);
      when(mockDraftHandlingService.getDraft(anything(), anything())).thenReturn(of(draftDelta.ops!));
      when(mockDraftHandlingService.draftDataToOps(anything(), anything())).thenReturn(draftDelta.ops!);
      spyOn<any>(component, 'getTargetOps').and.returnValue(of(targetDelta.ops));
      fixture.detectChanges();
      tick(EDITOR_READY_TIMEOUT);

      // Does not report network related issues to bugsnag
      when(mockDraftHandlingService.applyChapterDraftAsync(anything(), anything())).thenReject(
        new CommandError(CommandErrorCode.Other, '504 Gateway Timeout')
      );
      component.applyDraft();
      tick();
      verify(mockDraftHandlingService.applyChapterDraftAsync(component.textDocId!, anything())).once();
      verify(mockNoticeService.showError(anything())).once();
      verify(mockErrorReportingService.silentError(anything())).never();
      expect(component.isDraftApplied).toBe(false);

      // Reports to bugsnag if error is not network related
      when(mockDraftHandlingService.applyChapterDraftAsync(anything(), anything())).thenReject(
        new CommandError(CommandErrorCode.Other, 'Unknown error')
      );
      component.applyDraft();
      tick();
      verify(mockDraftHandlingService.applyChapterDraftAsync(component.textDocId!, anything())).twice();
      verify(mockNoticeService.showError(anything())).twice();
      verify(mockErrorReportingService.silentError(anything(), anything())).once();
      expect(component.isDraftApplied).toBe(false);
      flush();
    }));
  });

  describe('getLocalizedBookChapter', () => {
    it('should return an empty string if bookNum or chapter is undefined', () => {
      component.bookNum = undefined;
      component.chapter = 1;
      expect(component['getLocalizedBookChapter']()).toEqual('');

      component.bookNum = 1;
      component.chapter = undefined;
      expect(component['getLocalizedBookChapter']()).toEqual('');
    });

    it('should return a localized book and chapter if both are not null', () => {
      when(mockI18nService.localizeBookChapter(1, 1)).thenReturn('Localized Book 1');
      component.bookNum = 1;
      component.chapter = 1;
      expect(component['getLocalizedBookChapter']()).toEqual('Localized Book 1');
    });
  });
});

const draftMap: DraftSegmentMap = {
  verse_1_1: 'Draft verse 1. ',
  verse_1_2: 'Draft verse 2. ',
  verse_1_3: 'Draft verse 3. '
};

const draftDelta = new Delta([
  {
    attributes: {
      segment: 'verse_1_1',
      'para-contents': true
    },
    insert: 'Draft verse 1. '
  },
  {
    attributes: {
      segment: 'verse_1_2',
      'para-contents': true
    },
    insert: 'Draft verse 2. '
  },
  {
    attributes: {
      segment: 'verse_1_3',
      'para-contents': true
    },
    insert: 'Draft verse 3. '
  },
  {
    insert: '\n',
    attributes: {
      para: {
        style: 'p'
      }
    }
  }
]);

const emptyDraftDelta = new Delta([
  {
    attributes: {
      segment: 'id_1'
    },
    insert: 'Non-verse content from the template'
  },
  {
    insert: '\n',
    attributes: {
      book: {
        code: '2JN',
        style: 'id'
      }
    }
  },
  {
    attributes: {
      segment: 'p_1',
      'para-contents': true
    },
    insert: 'More non-verse content from the template'
  },
  {
    insert: {
      verse: {
        number: '1',
        style: 'v'
      }
    }
  },
  {
    insert: '\n',
    attributes: {
      para: {
        style: 'p'
      }
    }
  }
]);

const draftHistory: Revision[] = [
  { source: 'Draft', timestamp: '2025-03-25T01:02:03Z' },
  { source: 'Draft', timestamp: '2025-03-22T03:02:01Z' }
];

const targetDelta = new Delta([
  {
    attributes: {
      segment: 'verse_1_1',
      'para-contents': true
    },
    insert: 'Existing verse 1. '
  },
  {
    attributes: {
      segment: 'verse_1_2',
      'para-contents': true
    },
    insert: 'Existing verse 2. '
  },
  {
    attributes: {
      segment: 'verse_1_3',
      'para-contents': true
    },
    insert: { blank: true }
  },
  {
    insert: '\n',
    attributes: {
      para: {
        style: 'p'
      }
    }
  }
]);
