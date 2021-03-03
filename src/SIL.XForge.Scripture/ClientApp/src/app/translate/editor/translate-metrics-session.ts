import { RangeTokenizer } from '@sillsdev/machine';
import cloneDeep from 'lodash-es/cloneDeep';
import isEqual from 'lodash-es/isEqual';
import { fromEvent, interval, merge, Subject } from 'rxjs';
import { buffer, debounceTime, filter, map, tap } from 'rxjs/operators';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { PwaService } from 'xforge-common/pwa.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { objectId } from 'xforge-common/utils';
import { EditEndEvent, TranslateMetrics, TranslateMetricsType } from '../../core/models/translate-metrics';
import { SFProjectService } from '../../core/sf-project.service';
import { Segment } from '../../shared/text/segment';
import { TextComponent } from '../../shared/text/text.component';

export const ACTIVE_EDIT_TIMEOUT = 2000; // 2 seconds
export const EDIT_TIMEOUT = 10 * 60 * 1000; // 10 minutes
export const SEND_METRICS_INTERVAL = 30 * 1000; // 30 seconds

function getKeyActivityType(event: KeyboardEvent): ActivityType {
  let type = ActivityType.Unknown;
  switch (event.key) {
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowRight':
    case 'ArrowLeft':
    case 'Home':
    case 'End':
    case 'PageUp':
    case 'PageDown':
      type = ActivityType.Navigation;
      break;

    case 'Delete':
      type = ActivityType.Delete;
      break;

    case 'Backspace':
      type = ActivityType.Backspace;
      break;

    default:
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        type = ActivityType.Char;
      }
      break;
  }
  return type;
}

function createKeyActivity(event: KeyboardEvent): Activity {
  return { type: getKeyActivityType(event), event, whenStarted: Date.now() };
}

function isActiveEditKeyActivity(type: ActivityType): boolean {
  return type === ActivityType.Backspace || type === ActivityType.Delete || type === ActivityType.Char;
}

enum ActivityType {
  Unknown,
  Delete,
  Backspace,
  Char,
  Navigation,
  Click,
  Suggestion
}

interface Activity {
  type: ActivityType;
  event: Event;
  /** In ms since start of UNIX epoch. */
  whenStarted: number;
}

/**
 * This records and submits usage information for a visit to the editor component.
 */
export class TranslateMetricsSession extends SubscriptionDisposable {
  readonly id: string;
  metrics!: TranslateMetrics;

  private prevMetrics?: TranslateMetrics;
  private readonly suggestionAccepted$ = new Subject<Activity>();
  private readonly endActiveEdit$ = new Subject<void>();
  private navigateSuggestionShown: boolean = false;

  constructor(
    private readonly projectService: SFProjectService,
    private readonly projectId: string,
    private readonly source: TextComponent,
    private readonly target: TextComponent,
    private readonly sourceWordTokenizer: RangeTokenizer,
    private readonly targetWordTokenizer: RangeTokenizer,
    private readonly pwaService: PwaService
  ) {
    super();
    this.id = objectId();
    this.projectId = projectId;
    this.source = source;
    this.target = target;
    this.sourceWordTokenizer = sourceWordTokenizer;
    this.targetWordTokenizer = targetWordTokenizer;
    this.createMetrics('navigate');

    if (this.target.editor != null) {
      this.setupSubscriptions();
    } else {
      this.subscribe(this.target.loaded, () => this.setupSubscriptions());
    }
  }

  get prevMetricsId(): string {
    return this.prevMetrics == null ? '' : this.prevMetrics.id;
  }

  private get isMetricsEmpty(): boolean {
    return (
      this.metrics.keyBackspaceCount == null &&
      this.metrics.keyCharacterCount == null &&
      this.metrics.keyDeleteCount == null &&
      this.metrics.keyNavigationCount == null &&
      this.metrics.mouseClickCount == null &&
      this.metrics.productiveCharacterCount == null &&
      this.metrics.suggestionAcceptedCount == null &&
      this.metrics.suggestionTotalCount == null &&
      this.metrics.timeEditActive == null
    );
  }

  dispose(): void {
    this.endActiveEdit$.next();
    super.dispose();
    if (this.metrics != null && this.metrics.type === 'edit') {
      this.metrics.editEndEvent = 'task-exit';
    }
    this.sendMetrics(this.target == null ? undefined : this.target.segment);
  }

  onSuggestionShown(): void {
    if (this.metrics.type === 'navigate') {
      this.navigateSuggestionShown = true;
    } else {
      this.incrementMetric('suggestionTotalCount');
    }
  }

  onSuggestionAccepted(event: Event): void {
    this.suggestionAccepted$.next({ type: ActivityType.Suggestion, event, whenStarted: Date.now() });
  }

  private setupSubscriptions(): void {
    if (this.target.editor == null) {
      return;
    }

    const keyDowns$ = fromEvent<KeyboardEvent>(this.target.editor.root, 'keydown').pipe(
      filter(event => getKeyActivityType(event) !== ActivityType.Unknown),
      map<KeyboardEvent, Activity>(event => createKeyActivity(event))
    );
    const keyUps$ = fromEvent<KeyboardEvent>(this.target.editor.root, 'keyup').pipe(
      filter(event => getKeyActivityType(event) !== ActivityType.Unknown),
      map<KeyboardEvent, Activity>(event => createKeyActivity(event))
    );
    const mouseClicks$ = fromEvent(window.document, 'mousedown').pipe(
      map<Event, Activity>(event => ({ type: ActivityType.Click, event, whenStarted: Date.now() }))
    );

    // navigation keystrokes
    const navigationKeyDowns$ = keyDowns$.pipe(filter(activity => activity.type === ActivityType.Navigation));
    this.subscribe(navigationKeyDowns$, () => this.onNavigationKey());

    // mouse clicks
    this.subscribe(mouseClicks$, () => this.onMouseDown());

    // edit activity
    const editActivity$ = merge(keyDowns$, mouseClicks$);
    this.subscribe(editActivity$.pipe(debounceTime(EDIT_TIMEOUT)), () =>
      this.endEditIfNecessary('timeout', this.target.segment)
    );

    // segment changes
    this.subscribe(this.target.updated.pipe(filter(event => event.prevSegment !== event.segment)), event =>
      this.endEditIfNecessary('segment-change', event.prevSegment)
    );

    // active edit activity
    const activeEditKeyDowns$ = keyDowns$.pipe(filter(activity => isActiveEditKeyActivity(activity.type)));
    const activeEditKeyUps$ = keyUps$.pipe(filter(activity => isActiveEditKeyActivity(activity.type)));
    const activeEditActivity$ = merge(activeEditKeyDowns$, activeEditKeyUps$, this.suggestionAccepted$);
    this.subscribe(
      activeEditActivity$.pipe(
        tap(activity => this.startEditIfNecessary(activity)),
        buffer(merge(activeEditActivity$.pipe(debounceTime(ACTIVE_EDIT_TIMEOUT)), this.endActiveEdit$))
      ),
      activities => this.onActiveEdit(activities)
    );

    // periodic send via a timeout callback because this can produce an error when going offline or coming online
    this.subscribe(interval(SEND_METRICS_INTERVAL), () => setTimeout(() => this.sendMetrics(this.target.segment)));
  }

  private async sendMetrics(segment: Segment | undefined): Promise<void> {
    if (this.metrics == null || !this.pwaService.isOnline) {
      return;
    }

    if (this.metrics.type === 'edit' && segment != null) {
      const prodCharCount = this.target.segment == null ? 0 : this.target.segment.productiveCharacterCount;
      if (prodCharCount !== 0) {
        this.metrics.productiveCharacterCount = prodCharCount;
      }
      const sourceText = this.source.getSegmentText(segment.ref);
      this.metrics.sourceWordCount = this.sourceWordTokenizer.tokenize(sourceText).length;
      this.metrics.targetWordCount = this.targetWordTokenizer.tokenize(segment.text).length;
    }
    if (!this.isMetricsEmpty && !isEqual(this.prevMetrics, this.metrics)) {
      this.prevMetrics = cloneDeep(this.metrics);
      try {
        await this.projectService.onlineAddTranslateMetrics(this.projectId, this.metrics);
      } catch (err) {
        // ignore "not found" and "forbidden" command errors, or errors caused by being offline
        if (
          (!(err instanceof CommandError) && this.pwaService.isOnline) ||
          (err.code !== CommandErrorCode.NotFound && err.code !== CommandErrorCode.Forbidden)
        ) {
          throw err;
        }
      }
    }
  }

  private onActiveEdit(activities: Activity[]): void {
    for (const activity of activities) {
      if (activity.event.type === 'click' || activity.event.type === 'keydown') {
        switch (activity.type) {
          case ActivityType.Delete:
            this.incrementMetric('keyDeleteCount');
            break;
          case ActivityType.Backspace:
            this.incrementMetric('keyBackspaceCount');
            break;
          case ActivityType.Char:
            this.incrementMetric('keyCharacterCount');
            break;
          case ActivityType.Suggestion:
            this.incrementMetric('suggestionAcceptedCount');
            break;
        }
      }
    }

    let timeSpan = 30;
    if (activities.length > 1) {
      timeSpan = activities[activities.length - 1].whenStarted - activities[0].whenStarted;
    }
    this.incrementMetric('timeEditActive', Math.round(timeSpan));
  }

  private onNavigationKey(): void {
    this.incrementMetric('keyNavigationCount');
  }

  private onMouseDown(): void {
    this.incrementMetric('mouseClickCount');
  }

  private startEditIfNecessary(activity: Activity): void {
    if (this.metrics.type === 'navigate') {
      if (activity.event.type === 'click') {
        this.decrementMetric('mouseClickCount');
      }
      this.sendMetrics(this.target.segment);
      this.createMetrics('edit');
      if (activity.event.type === 'click') {
        this.incrementMetric('mouseClickCount');
      }
    }
  }

  private endEditIfNecessary(editEndEvent: EditEndEvent, segment: Segment | undefined): void {
    if (this.metrics.type === 'edit') {
      this.metrics.editEndEvent = editEndEvent;
      this.sendMetrics(segment);
      this.createMetrics('navigate');
    }
    this.navigateSuggestionShown = false;
  }

  private createMetrics(type: TranslateMetricsType): void {
    this.metrics = {
      id: objectId(),
      type,
      sessionId: this.id,
      bookNum: this.target.id == null ? 0 : this.target.id.bookNum,
      chapterNum: this.target.id == null ? 0 : this.target.id.chapterNum
    };
    if (type === 'edit') {
      if (this.target.segment != null) {
        this.metrics.segment = this.target.segment.ref;
      }
      if (this.navigateSuggestionShown) {
        this.metrics.suggestionTotalCount = 1;
      }
    }
    this.navigateSuggestionShown = false;
  }

  private incrementMetric(metric: Extract<keyof TranslateMetrics, string>, amount: number = 1): void {
    if (this.metrics[metric] == null) {
      (this.metrics[metric] as number) = 0;
    }
    (this.metrics[metric] as number) += amount;
  }

  private decrementMetric(metric: Extract<keyof TranslateMetrics, string>, amount: number = 1): void {
    if (this.metrics[metric] == null) {
      return;
    }
    (this.metrics[metric] as number) -= amount;
    if ((this.metrics[metric] as number) <= 0) {
      delete this.metrics[metric];
    }
  }
}
