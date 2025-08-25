import { DestroyRef, Inject, Injectable } from '@angular/core';
import {
  Diagnostic,
  DiagnosticsChanged,
  DiagnosticSeverity,
  DocumentData,
  DocumentManager,
  DocumentReader,
  Workspace
} from '@sillsdev/lynx';
import { ScriptureDeltaDocument } from '@sillsdev/lynx-delta';
import { Canon } from '@sillsdev/scripture';
import { groupBy } from 'lodash-es';
import Delta, { Op } from 'quill-delta';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { LynxConfig } from 'realtime-server/lib/esm/scriptureforge/models/lynx-config';
import { LynxInsightType } from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { getTextDocId } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import {
  debounceTime,
  distinctUntilChanged,
  map,
  mergeMap,
  Observable,
  of,
  groupBy as rxjsGroupBy,
  shareReplay,
  startWith,
  Subscription,
  switchMap,
  take
} from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { ActivatedBookChapterService, RouteBookChapter } from 'xforge-common/activated-book-chapter.service';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { SFProjectProfileDoc } from '../../../../core/models/sf-project-profile-doc';
import { TextDocId } from '../../../../core/models/text-doc';
import { SFProjectService } from '../../../../core/sf-project.service';
import { LynxInsight, LynxInsightAction } from './lynx-insight';

const TEXTS_PATH_TEMPLATE = obj<SFProjectProfile>().pathTemplate(p => p.texts);

@Injectable({
  providedIn: 'root'
})
export class LynxWorkspaceService {
  private projectId?: string;
  private textDocId?: TextDocId;
  private currentBookChapter?: RouteBookChapter;
  private textDocChangeSubscription?: Subscription;
  private projectDocChangeSubscription?: Subscription;
  private readonly curInsightsByEventUriAndSource = new Map<string, Map<string, LynxInsight[]>>();
  private curInsightsFlattened: LynxInsight[] = [];
  public readonly rawInsightSource$: Observable<LynxInsight[]>;
  private lastLynxSettings?: LynxConfig;

  /** Emits `true` while a new project's insights are loading, and `false` once the first insights arrive. */
  public readonly taskRunningStatus$: Observable<boolean>;

  constructor(
    private readonly projectService: SFProjectService,
    private readonly i18n: I18nService,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly activatedBookChapterService: ActivatedBookChapterService,
    private readonly destroyRef: DestroyRef,
    private readonly documentReader: TextDocReader,
    @Inject(DocumentManager) private readonly documentManager: DocumentManager<ScriptureDeltaDocument, Op, Delta>,
    @Inject(Workspace) public readonly workspace: Workspace<Op>
  ) {
    this.activatedProjectService.projectDoc$
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(projectDoc => this.onProjectActivated(projectDoc));
    this.activatedBookChapterService.activatedBookChapter$
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(bookChapter => this.onBookChapterActivated(bookChapter));

    this.rawInsightSource$ = this.workspace.diagnosticsChanged$.pipe(
      // Group events by event URI, then switchMap within each group to handle the cancellation and processing
      // of only the latest event for that URI.
      rxjsGroupBy(event => event.uri),
      mergeMap(group$ => group$.pipe(switchMap(event => this.onDiagnosticsChanged(event)))),
      debounceTime(10) // Debouncing avoids emitting after each event URI when loading a new project
    );

    // Task is running if new project activated and insights have not yet been emitted by rawInsightSource$
    this.taskRunningStatus$ = this.activatedProjectService.projectDoc$.pipe(
      switchMap(projectDoc => {
        if (projectDoc == null) {
          return of(false);
        }

        // Start with true (task running), then emit false when first insights are received
        return this.rawInsightSource$.pipe(
          take(1),
          map(() => false),
          startWith(true)
        );
      }),
      distinctUntilChanged(),
      shareReplay(1)
    );
  }

  get currentInsights(): LynxInsight[] {
    return this.curInsightsFlattened;
  }

  async init(): Promise<void> {
    await this.workspace.init();
    await this.workspace.changeLanguage(this.i18n.localeCode);
    this.i18n.locale$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(async locale => {
      await this.workspace.changeLanguage(locale.canonicalTag);
    });
  }

  async getActions(insight: LynxInsight): Promise<LynxInsightAction[]> {
    const doc: ScriptureDeltaDocument | undefined = await this.documentManager.get(insight.textDocId.toString());
    if (doc == null) {
      return [];
    }
    let severity: DiagnosticSeverity = DiagnosticSeverity.Information;
    switch (insight.type) {
      case 'info':
        severity = DiagnosticSeverity.Information;
        break;
      case 'warning':
        severity = DiagnosticSeverity.Warning;
        break;
      case 'error':
        severity = DiagnosticSeverity.Error;
        break;
    }
    const diagnostic: Diagnostic = {
      code: insight.code,
      source: insight.source,
      range: {
        start: doc.positionAt(insight.range.index),
        end: doc.positionAt(insight.range.index + insight.range.length)
      },
      message: insight.description,
      severity,
      data: insight.data
    };
    const fixes = await this.workspace.getDiagnosticFixes(insight.textDocId.toString(), diagnostic);
    return fixes.map(fix => ({
      id: uuidv4(),
      insight,
      label: fix.title,
      isPrimary: fix.isPreferred,
      ops: fix.edits
    }));
  }

  async getOnTypeEdits(delta: Delta): Promise<Delta[]> {
    const { autoCorrectionsEnabled } = this.getLynxSettings(this.activatedProjectService.projectDoc);

    // No edits if auto-corrections are not enabled
    if (!autoCorrectionsEnabled) {
      return [];
    }

    const curDocUri: string | undefined = this.textDocId?.toString();
    if (curDocUri == null) {
      return [];
    }
    const ops: Op[] = delta.ops;
    let offset: number;
    let text: string;
    if (ops.length === 1 && typeof ops[0].insert === 'string') {
      offset = 0;
      text = ops[0].insert;
    } else if (ops.length === 2 && typeof ops[0].retain === 'number' && typeof ops[1].insert === 'string') {
      offset = ops[0].retain;
      text = ops[1].insert;
    } else {
      return [];
    }

    const doc: ScriptureDeltaDocument | undefined = await this.documentManager.get(curDocUri);
    if (doc == null) {
      return [];
    }
    const edits: Delta[] = [];
    for (const ch of this.workspace.getOnTypeTriggerCharacters()) {
      let startIndex: number = 0;
      while (startIndex < text.length) {
        const chIndex: number = text.indexOf(ch, startIndex);
        if (chIndex >= 0) {
          const position = doc.positionAt(offset + chIndex + 1);
          const chEdits: Op[] | undefined = await this.workspace.getOnTypeEdits(curDocUri, position, ch);

          if (chEdits != null && chEdits.length > 0) {
            edits.push(new Delta(chEdits));
          }
          startIndex = chIndex + ch.length;
        } else {
          break;
        }
      }
    }
    return edits;
  }

  private async onDiagnosticsChanged(event: DiagnosticsChanged): Promise<LynxInsight[]> {
    if (event.diagnostics.length === 0) {
      this.curInsightsByEventUriAndSource.delete(event.uri);
    } else {
      const doc: ScriptureDeltaDocument | undefined = await this.documentManager.get(event.uri);

      if (!this.curInsightsByEventUriAndSource.has(event.uri)) {
        this.curInsightsByEventUriAndSource.set(event.uri, new Map<string, LynxInsight[]>());
      }

      if (doc != null) {
        const textDocIdParts: string[] = event.uri.split(':', 3);
        const textDocId = new TextDocId(
          textDocIdParts[0],
          Canon.bookIdToNumber(textDocIdParts[1]),
          parseInt(textDocIdParts[2])
        );

        // Group diagnostics by source because onDiagnosticsChanged event may fire multiple times
        // for the same URI (once for each diagnostic source).
        // This way, 'current insights' for a different diagnostic source will not be cleared and insight id
        // will be reused if the diagnostic matches an existing insight.
        const diagnosticsBySource = groupBy(event.diagnostics, 'source');

        for (const [source, diagnosticsForSource] of Object.entries(diagnosticsBySource)) {
          const updatedInsightsForSource: LynxInsight[] = [];
          const currentInsightsForSource: LynxInsight[] =
            this.curInsightsByEventUriAndSource.get(event.uri)?.get(source) ?? [];

          for (const diagnostic of diagnosticsForSource) {
            let type: LynxInsightType = 'info';
            switch (diagnostic.severity) {
              case DiagnosticSeverity.Information:
              case DiagnosticSeverity.Hint:
                type = 'info';
                break;
              case DiagnosticSeverity.Warning:
                type = 'warning';
                break;
              case DiagnosticSeverity.Error:
                type = 'error';
                break;
            }

            const start: number = doc.offsetAt(diagnostic.range.start);
            const end: number = doc.offsetAt(diagnostic.range.end);
            const range = { index: start, length: end - start };

            // Look for matching existing insight
            const existingMatchingInsight: LynxInsight | undefined = currentInsightsForSource.find(curInsight => {
              return (
                curInsight.code === diagnostic.code.toString() &&
                curInsight.type === type &&
                curInsight.range.index === range.index &&
                curInsight.range.length === range.length
              );
            });

            updatedInsightsForSource.push({
              id: existingMatchingInsight?.id ?? uuidv4(), // Reuse id if matching insight found, otherwise generate
              type,
              textDocId,
              range: { index: start, length: end - start },
              code: diagnostic.code.toString(),
              source: diagnostic.source,
              description: diagnostic.message,
              moreInfo: diagnostic.moreInfo,
              data: diagnostic.data
            });
          }

          // Refresh the insights for this source only
          this.curInsightsByEventUriAndSource.get(event.uri)!.set(source, updatedInsightsForSource);
        }
      }
    }

    // Flatten the 2D map to a single array of insights
    const allInsights: LynxInsight[] = [];
    for (const uriMap of this.curInsightsByEventUriAndSource.values()) {
      for (const sourceInsights of uriMap.values()) {
        allInsights.push(...sourceInsights);
      }
    }

    this.curInsightsFlattened = allInsights;
    return allInsights;
  }

  private async onProjectActivated(projectDoc: SFProjectProfileDoc | undefined): Promise<void> {
    if (projectDoc?.id === this.projectId) {
      return;
    }

    this.curInsightsByEventUriAndSource.clear();
    this.curInsightsFlattened = [];

    if (this.projectDocChangeSubscription != null) {
      this.projectDocChangeSubscription.unsubscribe();
      this.projectDocChangeSubscription = undefined;
    }

    this.projectId = projectDoc?.id;
    this.documentReader.textDocIds = getTextDocIds(projectDoc);
    this.lastLynxSettings = this.getLynxSettings(projectDoc);

    await this.documentManager.reset();
    if (projectDoc != null) {
      this.projectDocChangeSubscription = projectDoc.changes$
        .pipe(quietTakeUntilDestroyed(this.destroyRef))
        .subscribe(async ops => {
          if (ops.some(op => TEXTS_PATH_TEMPLATE.matches(op.p))) {
            const oldTextDocIds: Set<string> = this.documentReader.textDocIds;
            this.documentReader.textDocIds = getTextDocIds(projectDoc);
            // created texts
            for (const textDocId of setDifference(this.documentReader.textDocIds, oldTextDocIds)) {
              await this.documentManager.fireCreated(textDocId);
            }
            // deleted texts
            for (const textDocId of setDifference(oldTextDocIds, this.documentReader.textDocIds)) {
              await this.documentManager.fireDeleted(textDocId);
            }
          }

          // Handle Lynx settings changes
          const currentLynxSettings: LynxConfig = this.getLynxSettings(projectDoc);
          const haveLynxSettingsChanged: boolean = this.lynxSettingsChanged(this.lastLynxSettings, currentLynxSettings);

          this.lastLynxSettings = currentLynxSettings;

          // Re-evaluate whether documents should be opened/closed based on new settings
          if (haveLynxSettingsChanged) {
            await this.onBookChapterActivated(this.currentBookChapter);
          }
        });
    }
  }

  private async onBookChapterActivated(bookChapter: RouteBookChapter | undefined): Promise<void> {
    this.currentBookChapter = bookChapter;

    const textDocId: TextDocId | undefined =
      this.activatedProjectService.projectId == null || bookChapter?.bookId == null || bookChapter.chapter == null
        ? undefined
        : new TextDocId(
            this.activatedProjectService.projectId,
            Canon.bookIdToNumber(bookChapter.bookId),
            bookChapter?.chapter
          );

    const { assessmentsEnabled, autoCorrectionsEnabled } = this.getLynxSettings(
      this.activatedProjectService.projectDoc
    );
    const shouldOpenDoc: boolean = assessmentsEnabled || autoCorrectionsEnabled;

    // If textDocId hasn't changed but we need to re-evaluate document state (e.g., settings changed)
    const isSameTextDoc = textDocId === this.textDocId;
    const isDocCurrentlyOpen = this.textDocId != null && this.textDocChangeSubscription != null;

    // Close document if it's open but no lynx feature is enabled or we are switching to a different document
    if (isDocCurrentlyOpen && (!shouldOpenDoc || !isSameTextDoc)) {
      await this.documentManager.fireClosed(this.textDocId!.toString());
      this.textDocChangeSubscription!.unsubscribe();
      this.textDocChangeSubscription = undefined;
      if (!isSameTextDoc) {
        this.textDocId = undefined;
      }
    }

    // Early return if same document and state doesn't need to change
    if (isSameTextDoc && isDocCurrentlyOpen === shouldOpenDoc) {
      return;
    }

    this.textDocId = textDocId;
    if (this.textDocId != null && shouldOpenDoc) {
      const uri: string = this.textDocId.toString();
      const textDoc = await this.projectService.getText(this.textDocId);
      await this.documentManager.fireOpened(uri, {
        format: 'scripture-delta',
        version: textDoc.adapter.version,
        content: textDoc.data as Delta
      });

      this.textDocChangeSubscription = textDoc.changes$
        .pipe(quietTakeUntilDestroyed(this.destroyRef))
        .subscribe(async changes => {
          await this.documentManager.fireChanged(uri, {
            contentChanges: changes.ops ?? [],
            version: textDoc.adapter.version
          });
        });
    }
  }

  /**
   * Extracts the Lynx configuration settings from a project profile document.
   * @param projectDoc The project profile document to extract settings from
   * @returns The Lynx configuration with default values of false if not set
   */
  private getLynxSettings(projectDoc: SFProjectProfileDoc | undefined): LynxConfig {
    return {
      autoCorrectionsEnabled: projectDoc?.data?.lynxConfig?.autoCorrectionsEnabled ?? false,
      assessmentsEnabled: projectDoc?.data?.lynxConfig?.assessmentsEnabled ?? false
    };
  }

  /**
   * Compares two Lynx configuration objects to determine if any settings have changed.
   * @param prev The previous Lynx configuration
   * @param curr The current Lynx configuration
   * @returns true if any settings have changed, false if settings are the same
   */
  private lynxSettingsChanged(prev: LynxConfig | undefined, curr: LynxConfig): boolean {
    if (prev == null) {
      return curr.autoCorrectionsEnabled || curr.assessmentsEnabled;
    }

    return (
      curr.autoCorrectionsEnabled !== prev.autoCorrectionsEnabled || curr.assessmentsEnabled !== prev.assessmentsEnabled
    );
  }
}

@Injectable({
  providedIn: 'root'
})
export class TextDocReader implements DocumentReader<Delta> {
  public textDocIds: Set<string> = new Set();

  constructor(private readonly projectService: SFProjectService) {}

  keys(): Promise<string[]> {
    return Promise.resolve([...this.textDocIds]);
  }

  async read(uri: string): Promise<DocumentData<Delta>> {
    const textDoc = await this.projectService.getText(uri);
    return {
      format: 'scripture-delta',
      content: textDoc.data as Delta,
      version: textDoc.adapter.version
    };
  }
}

function getTextDocIds(projectDoc: SFProjectProfileDoc | undefined): Set<string> {
  if (projectDoc == null || projectDoc.data == null) {
    return new Set<string>();
  }
  return new Set<string>(
    projectDoc.data.texts.flatMap(text =>
      text.chapters.map(chapter => getTextDocId(projectDoc.id, text.bookNum, chapter.number))
    )
  );
}

function* setDifference(x: Set<string>, y: Set<string>): Iterable<string> {
  for (const value of x) {
    if (!y.has(value)) {
      yield value;
    }
  }
}
