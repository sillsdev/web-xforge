import { DestroyRef, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Diagnostic,
  DiagnosticFix,
  DiagnosticProvider,
  DiagnosticsChanged,
  DiagnosticSeverity,
  DocumentAccessor,
  DocumentData,
  DocumentManager,
  DocumentReader,
  Localizer,
  ScriptureDocument,
  ScriptureNodeType,
  ScriptureText,
  ScriptureVerse,
  Workspace
} from '@sillsdev/lynx';
import { ScriptureDeltaDocument, ScriptureDeltaDocumentFactory, ScriptureDeltaEditFactory } from '@sillsdev/lynx-delta';
import { Canon } from '@sillsdev/scripture';
import Delta, { Op } from 'quill-delta';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { getTextDocId } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { map, merge, Observable, Subscription, switchMap } from 'rxjs';
import { ActivatedBookChapterService, RouteBookChapter } from 'xforge-common/activated-book-chapter.service';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { SFProjectProfileDoc } from '../../../../core/models/sf-project-profile-doc';
import { TextDocId } from '../../../../core/models/text-doc';
import { SFProjectService } from '../../../../core/sf-project.service';

const TEXTS_PATH_TEMPLATE = obj<SFProjectProfile>().pathTemplate(p => p.texts);

@Injectable({
  providedIn: 'root'
})
export class LynxWorkspaceService {
  private readonly documentReader: TextDocReader;
  public readonly documentManager: DocumentManager<ScriptureDeltaDocument, Op, Delta>;
  public readonly workspace: Workspace<Op>;
  private textDocId?: TextDocId;
  private textDocChangeSubscription?: Subscription;
  private projectDocChangeSubscription?: Subscription;

  constructor(
    private readonly projectService: SFProjectService,
    private readonly i18n: I18nService,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly activatedBookChapterService: ActivatedBookChapterService,
    private readonly destroyRef: DestroyRef
  ) {
    const documentFactory = new ScriptureDeltaDocumentFactory();
    const editFactory = new ScriptureDeltaEditFactory();
    this.documentReader = new TextDocReader(this.projectService);
    this.documentManager = new DocumentManager<ScriptureDeltaDocument, Op, Delta>(documentFactory, this.documentReader);

    const localizer = new Localizer();
    this.workspace = new Workspace<Op>({
      localizer,
      diagnosticProviders: [new TestDiagnosticProvider(localizer, this.documentManager, editFactory)]
    });

    this.activatedProjectService.projectDoc$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(projectDoc => this.onProjectActivated(projectDoc));
    this.activatedBookChapterService.activatedBookChapter$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(bookChapter => this.onBookChapterActivated(bookChapter));
  }

  async init(): Promise<void> {
    await this.workspace.init();
    await this.workspace.changeLanguage(this.i18n.localeCode);
    this.i18n.locale$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async locale => {
      await this.workspace.changeLanguage(locale.canonicalTag);
    });
  }

  private async onProjectActivated(projectDoc: SFProjectProfileDoc | undefined): Promise<void> {
    if (this.projectDocChangeSubscription != null) {
      this.projectDocChangeSubscription.unsubscribe();
      this.projectDocChangeSubscription = undefined;
    }

    this.documentReader.textDocIds = getTextDocIds(projectDoc);
    await this.documentManager.reset();
    if (projectDoc != null) {
      this.projectDocChangeSubscription = projectDoc.changes$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(async ops => {
          if (ops.some(op => TEXTS_PATH_TEMPLATE.matches(op.p))) {
            const oldTextDocIds = this.documentReader.textDocIds;
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
        });
    }
  }

  private async onBookChapterActivated(bookChapter: RouteBookChapter | undefined): Promise<void> {
    const textDocId =
      this.activatedProjectService.projectId == null || bookChapter?.bookId == null || bookChapter.chapter == null
        ? undefined
        : new TextDocId(
            this.activatedProjectService.projectId,
            Canon.bookIdToNumber(bookChapter.bookId),
            bookChapter?.chapter
          );
    if (textDocId === this.textDocId) {
      return;
    }

    if (this.textDocId != null) {
      await this.documentManager.fireClosed(this.textDocId.toString());
      this.textDocId = undefined;
      if (this.textDocChangeSubscription != null) {
        this.textDocChangeSubscription.unsubscribe();
        this.textDocChangeSubscription = undefined;
      }
    }

    this.textDocId = textDocId;
    if (this.textDocId != null) {
      const textDoc = await this.projectService.getText(this.textDocId);
      await this.documentManager.fireOpened(this.textDocId.toString(), {
        format: 'scripture-delta',
        version: textDoc.adapter.version,
        content: textDoc.data as Delta
      });
      const uri = this.textDocId.toString();
      this.textDocChangeSubscription = textDoc.changes$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(async changes => {
          await this.documentManager.fireChanged(uri, {
            contentChanges: changes.ops ?? [],
            version: textDoc.adapter.version
          });
        });
    }
  }
}

class TextDocReader implements DocumentReader<Delta> {
  public textDocIds: Set<string> = new Set();

  constructor(private readonly projectService: SFProjectService) {}

  keys(): string[] {
    return Array.from(this.textDocIds);
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
    return new Set();
  }
  return new Set(
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

export class TestDiagnosticProvider implements DiagnosticProvider<Op> {
  public readonly id = 'test';
  public readonly diagnosticsChanged$: Observable<DiagnosticsChanged>;

  constructor(
    private readonly localizer: Localizer,
    private readonly documents: DocumentAccessor<ScriptureDeltaDocument>,
    private readonly editFactory: ScriptureDeltaEditFactory
  ) {
    this.diagnosticsChanged$ = merge(
      documents.opened$.pipe(
        map(e => ({
          uri: e.document.uri,
          version: e.document.version,
          diagnostics: this.validateDocument(e.document)
        }))
      ),
      documents.changed$.pipe(
        map(e => ({
          uri: e.document.uri,
          version: e.document.version,
          diagnostics: this.validateDocument(e.document)
        }))
      ),
      documents.closed$.pipe(
        switchMap(async e => {
          const doc = await this.documents.get(e.uri);
          return { uri: e.uri, version: doc?.version, diagnostics: [] };
        })
      )
    );
  }

  init(): Promise<void> {
    return Promise.resolve();
  }

  async getDiagnostics(uri: string): Promise<Diagnostic[]> {
    const doc = await this.documents.get(uri);
    if (doc == null) {
      return [];
    }
    return this.validateDocument(doc);
  }

  async getDiagnosticFixes(uri: string, diagnostic: Diagnostic): Promise<DiagnosticFix<Op>[]> {
    const doc = await this.documents.get(uri);
    if (doc == null) {
      return [];
    }
    const fixes: DiagnosticFix<Op>[] = [];
    if (diagnostic.code === 'tst0001') {
      fixes.push({
        title: 'Fix the problem',
        isPreferred: true,
        diagnostic,
        edits: this.editFactory.createScriptureEdit(
          doc,
          { start: diagnostic.range.start, end: diagnostic.range.start },
          new ScriptureText('Problem fixed! ')
        )
      });
    }
    return fixes;
  }

  private validateDocument(doc: ScriptureDocument): Diagnostic[] {
    const firstVerses = doc.findNodes(n => n.type === ScriptureNodeType.Verse && (n as ScriptureVerse).number === '1');
    const diagnostics: Diagnostic[] = [];
    for (const verseNode of firstVerses) {
      if (verseNode.next?.type === ScriptureNodeType.Text && !verseNode.next.getText().includes('Problem fixed!')) {
        diagnostics.push({
          code: 'tst0001',
          source: this.id,
          severity: DiagnosticSeverity.Error,
          message: 'Test error',
          range: verseNode.next.range
        });
      }
    }
    return diagnostics;
  }
}
