import { BuildDto } from '../machine-api/build-dto';

/**
 * A report of a Serval build, combining Serval data with SF project information and event metrics.
 * This mirrors the C# ServalBuildReportDto.
 */
export interface ServalBuildReportDto {
  /** The Serval build data (unless we only had a record of the build request from event metrics). */
  build: BuildDto | undefined;
  /** SF project context for the build. Undefined if the project could not be found. */
  project: BuildReportProject | undefined;
  /** Timeline of events from both Serval and SF event metrics. */
  timeline: BuildReportTimeline;
  /** Build configuration: Scripture ranges and training data files. */
  config: BuildReportConfig;
  /** Problems or warnings identified for this build. */
  problems: string[];
  /** The SF draft generation request identifier. */
  draftGenerationRequestId: string | undefined;
  /** The SF user who requested this build, if known. */
  requesterSFUserId: string | undefined;
  /** Status of the build. */
  status: DraftGenerationBuildStatus;
}

/** SF project info for a build report entry. */
export interface BuildReportProject {
  sfProjectId: string;
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

/** Timeline of events for a build, combining Serval timestamps and SF event metric timestamps. */
export interface BuildReportTimeline {
  // Serval timestamps
  servalCreated: Date | undefined;
  servalStarted: Date | undefined;
  servalCompleted: Date | undefined;
  servalFinished: Date | undefined;
  // SF event metric timestamps
  sfUserRequested: Date | undefined;
  sfBuildProjectSubmitted: Date | undefined;
  sfUserCancelled: Date | undefined;
  sfAcknowledgedCompletion: Date | undefined;
  /** When the build was requested, with SF user request event time prioritized over Serval creation time. */
  requestTime: Date | undefined;
  /** Information on different activities during the build. */
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
 * Mirrors the C# BuildReportProjectScriptureRange.
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
  const parseDate = (value: unknown): Date | undefined => {
    if (value instanceof Date) return value;
    if (value == null) return undefined;
    if (typeof value !== 'string' && typeof value !== 'number') return undefined;

    const parsed: Date = new Date(value);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed;
  };

  const status: string = report.status;
  if (!isDraftGenerationBuildStatus(status)) {
    throw new Error(`Unknown DraftGenerationBuildStatus status: ${status}`);
  }

  const timeline: BuildReportTimeline = report.timeline;
  const convertedPhases: Phase[] | undefined = timeline.phases?.map((phase: Phase) => ({
    ...phase,
    started: parseDate(phase.started)
  }));

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
 * Status values for a draft generation build request, including SF-specific pre-submission states.
 * Values match the C# DraftGenerationBuildStatus enum.
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

/** Status of a draft generation request, including states before reported on by Serval. */
export type DraftGenerationBuildStatus = (typeof DraftGenerationBuildStatus)[keyof typeof DraftGenerationBuildStatus];

/** Set of all valid DraftGenerationBuildStatus values. */
const draftGenerationBuildStatusValues: Set<string> = new Set(Object.values(DraftGenerationBuildStatus));

/** Returns whether the given string is a valid DraftGenerationBuildStatus value. */
export function isDraftGenerationBuildStatus(value: string): value is DraftGenerationBuildStatus {
  return draftGenerationBuildStatusValues.has(value);
}

/** Maps a project to the list of book identifiers involved in a build. */
export interface ProjectBooks {
  sfProjectId: string;
  /** Display string for the project, e.g. "ABC - My Project" or just "ABC". */
  projectDisplayName: string;
  books: string[];
}

/**
 * Parses BuildReportProjectScriptureRange entries into ProjectBooks records by splitting semicolon-delimited scripture
 * ranges into individual book identifiers.
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
    const books: string[] = scriptureRange
      .split(';')
      .map(token => token.trim())
      .filter(token => token.length > 0);
    projectBooks.push({ sfProjectId: sfProjectId, projectDisplayName: displayName, books: books });
  }
  return projectBooks;
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
