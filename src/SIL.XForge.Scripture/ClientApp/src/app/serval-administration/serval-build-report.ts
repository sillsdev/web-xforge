import { Canon } from '@sillsdev/scripture';
import { notNull } from '../../type-utils';
import { BuildDto } from '../machine-api/build-dto';
import { expandNumbers, parseDate } from '../shared/utils';

/**
 * A report of a Serval build, combining Serval-native data with SF project information and event metrics information.
 * See C# comments.
 */
export interface ServalBuildReportDto {
  build: BuildDto | undefined;
  project: BuildReportProject | undefined;
  timeline: BuildReportTimeline;
  config: BuildReportConfig;
  problems: BuildReportProblem[];
  draftGenerationRequestId: string | undefined;
  requesterSFUserId: string | undefined;
  status: DraftGenerationBuildStatus;
}

export type BuildReportProblemSource = 'local' | 'serval';
function isBuildReportProblemSource(value: unknown): value is BuildReportProblemSource {
  return value === 'local' || value === 'serval';
}
export type BuildReportProblemSeverity = 'warning' | 'error';
function isBuildReportProblemSeverity(value: unknown): value is BuildReportProblemSeverity {
  return value === 'warning' || value === 'error';
}

export interface BuildReportProblem {
  source: BuildReportProblemSource;
  severity: BuildReportProblemSeverity;
  message: string;
}

/** SF project information for a build report entry.*/
export interface BuildReportProject {
  sfProjectId: string;
  ptProjectId?: string;
  shortName: string | undefined;
  name: string | undefined;
}

/** Serval build phase information. */
export interface Phase {
  /** Note that although ServalClient.PhaseStage shows only non-empty options for the enum, ServalClient.Phase.Stage
   * says an empty string is allowed. */
  stage: 'Train' | 'Inference' | '';
  step: number | undefined;
  stepCount: number | undefined;
  started: Date | undefined;
}

/** Timeline of events for a build, combining Serval timestamps and SF event metric timestamps. See C# comments. */
export interface BuildReportTimeline {
  servalCreated: Date | undefined;
  servalStarted: Date | undefined;
  servalCompleted: Date | undefined;
  servalFinished: Date | undefined;

  sfUserRequested: Date | undefined;
  sfBuildProjectSubmitted: Date | undefined;
  sfUserCancelled: Date | undefined;
  sfAcknowledgedCompletion: Date | undefined;

  requestTime: Date | undefined;
  phases: Phase[] | undefined;
}

/** Build configuration: which Scripture ranges were trained on and translated, and what training data files were used. */
export interface BuildReportConfig {
  trainingScriptureRanges: BuildReportProjectScriptureRange[];
  translationScriptureRanges: BuildReportProjectScriptureRange[];
  trainingDataFileIds: string[];
}

/**
 * A scripture range entry enriched with the referenced project's display information.
 */
export interface BuildReportProjectScriptureRange {
  sfProjectId: string;
  scriptureRange: string;
  shortName: string | undefined;
  name: string | undefined;
}

/** Takes a ServalBuildReportDto with JSON-typed values (date strings, status strings) and converts them to proper
 * TypeScript types. */
export function interpretTypes(report: ServalBuildReportDto): ServalBuildReportDto {
  const status: string = report.status;
  if (!isDraftGenerationBuildStatus(status)) {
    // Noisily handle invalid data.
    throw new Error(`Unknown DraftGenerationBuildStatus status: ${status}`);
  }

  const timeline: BuildReportTimeline = report.timeline;
  const convertedPhases: Phase[] | undefined = timeline.phases?.map((phase: Phase) => ({
    ...phase,
    started: parseDate(phase.started)
  }));
  report.problems.forEach((problem: BuildReportProblem) => {
    if (!isBuildReportProblemSource(problem.source))
      throw Error(`Unknown BuildReportProblemSource when interpreting DTO: ${problem.source}`);
    if (!isBuildReportProblemSeverity(problem.severity))
      throw Error(`Unknown BuildReportProblemSeverity when interpreting DTO: ${problem.severity}`);
  });

  return {
    ...report,
    status: status,
    timeline: {
      ...timeline,
      servalCreated: parseDate(timeline.servalCreated),
      servalStarted: parseDate(timeline.servalStarted),
      servalCompleted: parseDate(timeline.servalCompleted),
      servalFinished: parseDate(timeline.servalFinished),
      sfUserRequested: parseDate(timeline.sfUserRequested),
      sfBuildProjectSubmitted: parseDate(timeline.sfBuildProjectSubmitted),
      sfUserCancelled: parseDate(timeline.sfUserCancelled),
      sfAcknowledgedCompletion: parseDate(timeline.sfAcknowledgedCompletion),
      requestTime: parseDate(timeline.requestTime),
      phases: convertedPhases
    }
  };
}

/**
 * Status of a draft generation build request. See C# DraftGenerationBuildStatus enum comments.
 */
export const DraftGenerationBuildStatus = {
  UserRequested: 'UserRequested',
  SubmittedToServal: 'SubmittedToServal',
  Pending: 'Pending',
  Active: 'Active',
  Completed: 'Completed',
  Faulted: 'Faulted',
  Canceled: 'Canceled'
} as const;

/** Status of a draft generation request. */
export type DraftGenerationBuildStatus = (typeof DraftGenerationBuildStatus)[keyof typeof DraftGenerationBuildStatus];

/** Set of all valid DraftGenerationBuildStatus values. */
const draftGenerationBuildStatusValues: Set<string> = new Set(Object.values(DraftGenerationBuildStatus));

/** Returns whether the given string is a valid DraftGenerationBuildStatus value. */
export function isDraftGenerationBuildStatus(value: string): value is DraftGenerationBuildStatus {
  return draftGenerationBuildStatusValues.has(value);
}

/** A book identifier with optional chapter numbers. */
export interface BookAndChapters {
  bookId: string;
  chapters?: number[];
}

/** Maps a project to the list of book identifiers involved in a build. */
export interface ProjectBooks {
  sfProjectId: string;
  /** Display string for the project, e.g. "ABC - My Project" or just "ABC". */
  projectDisplayName: string;
  /** Short name of the project if available. */
  shortName?: string;
  /** Project name if available. */
  projectName?: string;
  booksAndChapters: BookAndChapters[];
}

/**
 * Parses BuildReportProjectScriptureRange entries into ProjectBooks records by parsing semicolon-delimited scripture
 * ranges into individual book identifiers with optional chapter numbers.
 */
export function toProjectBooks(ranges: BuildReportProjectScriptureRange[] | undefined): ProjectBooks[] {
  if (ranges == null) {
    return [];
  }
  const projectBooks: ProjectBooks[] = [];
  for (const range of ranges) {
    if (range == null) {
      continue;
    }
    const sfProjectId: string | undefined = range.sfProjectId;
    const scriptureRange: string | undefined = range.scriptureRange;
    if (sfProjectId == null || scriptureRange == null) {
      continue;
    }

    const displayName: string = buildProjectDisplayName(range.shortName, range.name, sfProjectId);
    const booksAndChapters: BookAndChapters[] = parseBooksAndChapters(scriptureRange);
    projectBooks.push({
      sfProjectId: sfProjectId,
      projectDisplayName: displayName,
      shortName: range.shortName,
      projectName: range.name,
      booksAndChapters: booksAndChapters
    });
  }
  return projectBooks;
}

/**
 * Parses a semicolon-delimited scripture range string into BookAndChapters entries.
 * Format: "GEN10,11,16-19;EXO" → [{bookId: 'GEN', chapters: [10,11,16,17,18,19]}, {bookId: 'EXO'}]
 */
function parseBooksAndChapters(scriptureRange: string): BookAndChapters[] {
  return scriptureRange
    .split(';')
    .map(segment => {
      const bookId: string = Canon.bookIdToNumber(segment.slice(0, 3)) > 0 ? segment.slice(0, 3) : '';
      if (bookId === '') return null;
      const chapterPart: string = segment.slice(3);
      if (chapterPart === '') {
        return { bookId };
      }
      const chapters: number[] = expandNumbers(chapterPart);
      return chapters.length > 0 ? { bookId, chapters } : { bookId };
    })
    .filter(notNull);
}

/** Builds a display name for a project from its short name, name, and ID, falling back gracefully. */
export function buildProjectDisplayName(
  shortName: string | undefined,
  name: string | undefined,
  projectId: string | undefined
): string {
  if (shortName != null && name != null) {
    return `${shortName} - ${name}`;
  }
  if (shortName != null) {
    return shortName;
  }
  if (name != null) {
    return name;
  }
  return projectId ?? 'Unknown project';
}
