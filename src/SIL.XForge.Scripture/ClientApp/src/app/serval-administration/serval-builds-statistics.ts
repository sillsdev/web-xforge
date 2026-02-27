import { notNull } from '../../type-utils';
import {
  BuildReportProject,
  DraftGenerationBuildState,
  ProjectBooks,
  ServalBuildReportDto
} from './serval-build-report';
import { ServalBuildRow, ServalBuildSummary } from './serval-builds.component';

/*
 * This file contains pure functions for computing aggregate statistics over a number of Serval build records. Tests are
 * in serval-builds.component.spec.ts.
 */

/** Returns whether a build status represents an in-progress build. */
export function isInProgress(status: DraftGenerationBuildState): boolean {
  return (
    status === DraftGenerationBuildState.Active ||
    status === DraftGenerationBuildState.Finishing ||
    status === DraftGenerationBuildState.Pending ||
    status === DraftGenerationBuildState.Queued ||
    status === DraftGenerationBuildState.UserRequested ||
    status === DraftGenerationBuildState.SubmittedToServal
  );
}

/** Extracts the millisecond timestamp from a Date, returning undefined if the date is null or invalid. */
export function validDateMsFrom(date: Date | undefined): number | undefined {
  if (date == null) return undefined;
  const value: number = date.getTime();
  if (Number.isNaN(value)) return undefined;
  return value;
}

/** Counts the total number of books across all project-book entries. */
export function countBooks(projectBooks: ProjectBooks[]): number {
  return projectBooks.reduce((total: number, projectBook: ProjectBooks) => total + projectBook.books.length, 0);
}

/** Computes the arithmetic mean, returning undefined for an empty array. */
export function averageNumbers(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const total: number = values.reduce((sum: number, value: number) => sum + value, 0);
  return total / values.length;
}

/**
 * Computes the gap in milliseconds between consecutive builds for the same project. Builds are ordered by effective
 * start time. Gaps are measured from the previous build's finish (SF acknowledged time, falling back to Serval finish)
 * to the next build's request time. Returns undefined entries where builds are missing timing data.
 */
export function gapsBetweenBuildsMs(rows: ServalBuildRow[]): Array<number | undefined> {
  if (rows.length < 2) return [];

  const sortableRows: ServalBuildRow[] = [...rows];

  // Sort by effective start time (SF user request time with fallback to Serval created time)
  sortableRows.sort((left: ServalBuildRow, right: ServalBuildRow) => {
    const leftStartMs: number = validDateMsFrom(left.report.timeline.requestTime) ?? 0;
    const rightStartMs: number = validDateMsFrom(right.report.timeline.requestTime) ?? 0;
    return leftStartMs - rightStartMs;
  });

  const gaps: Array<number | undefined> = [];
  for (let index = 1; index < sortableRows.length; index++) {
    const previous: ServalBuildRow = sortableRows[index - 1];
    const next: ServalBuildRow = sortableRows[index];
    // Use SF acknowledged time with fallback to Serval finish time for previous build
    const previousFinishMs: number | undefined =
      validDateMsFrom(previous.report.timeline.sfAcknowledgedCompletion) ??
      validDateMsFrom(previous.report.timeline.servalFinished);
    // Use request time with fallback to Serval created time for next build
    const nextStartMs: number | undefined = validDateMsFrom(next.report.timeline.requestTime);
    if (previousFinishMs == null || nextStartMs == null) {
      // If any build lacks a beginning or ending time, log that gap as undefined and callers can decide how to handle
      // that.
      gaps.push(undefined);
      continue;
    }
    const gap: number = nextStartMs - previousFinishMs;
    if (gap < 0) {
      // Somehow the two build times were overlapping.
      const previousId: string =
        previous.report.build?.additionalInfo?.buildId ?? previous.report.draftGenerationRequestId ?? 'unknown id';
      const nextId: string =
        next.report.build?.additionalInfo?.buildId ?? next.report.draftGenerationRequestId ?? 'unknown id';
      console.error(`Two consecutive builds (${previousId}, ${nextId}) have overlapping durations.`);
      gaps.push(undefined);
      continue;
    }
    gaps.push(gap);
  }
  return gaps;
}

/**
 * Calculates the percentage of time that successfully completed builds spent in SF rather than in Serval.
 * Only considers builds that have all four required timing values: sfUserRequestTime,
 * sfAcknowledgedServalCompletionTime, servalCreated, and servalFinished.
 */
export function calculatePercentTimeOnSF(rows: ServalBuildRow[]): number | undefined {
  let totalDurationMs: number = 0;
  let totalServalDurationMs: number = 0;

  for (const row of rows) {
    // Only consider successfully completed builds
    if (row.report.status !== DraftGenerationBuildState.Completed) {
      continue;
    }

    // All four timing values are required
    const sfUserRequestTimeMs: number | undefined = validDateMsFrom(row.report.timeline.sfUserRequested);
    const sfAcknowledgedTimeMs: number | undefined = validDateMsFrom(row.report.timeline.sfAcknowledgedCompletion);
    const servalCreatedMs: number | undefined = validDateMsFrom(row.report.timeline.servalCreated);
    const servalFinishedMs: number | undefined = validDateMsFrom(row.report.timeline.servalFinished);

    if (
      sfUserRequestTimeMs == null ||
      sfAcknowledgedTimeMs == null ||
      servalCreatedMs == null ||
      servalFinishedMs == null
    ) {
      continue;
    }

    const fullDurationMs: number = sfAcknowledgedTimeMs - sfUserRequestTimeMs;
    const servalDurationMs: number = servalFinishedMs - servalCreatedMs;

    // Skip builds with inconsistent timing: negative durations or Serval time exceeding total time
    if (fullDurationMs <= 0 || servalDurationMs < 0 || servalDurationMs > fullDurationMs) {
      continue;
    }

    totalDurationMs += fullDurationMs;
    totalServalDurationMs += servalDurationMs;
  }

  if (totalDurationMs === 0) {
    return undefined;
  }

  const sfDurationMs: number = totalDurationMs - totalServalDurationMs;
  const percentOnSF: number = (sfDurationMs / totalDurationMs) * 100;
  return percentOnSF;
}

/**
 * Computes aggregate statistics over all build rows. Rows without an associated SF project are
 * counted as "unconsidered" and excluded from most aggregation. Returns a ServalBuildSummary
 * containing counts, averages, and timing statistics.
 */
export function buildSummary(rows: ServalBuildRow[]): ServalBuildSummary {
  // Type for a build row where the SF project is known.
  type KnowableBuildRow = ServalBuildRow & { report: ServalBuildReportDto & { project: BuildReportProject } };
  // Rows with a known SF project. Any build that is not associable with a project will not be included or
  // considered for much of the data summarization.
  const buildRows: KnowableBuildRow[] = rows.filter(
    (row: ServalBuildRow): row is KnowableBuildRow => row.report.project != null
  );
  const unconsideredBuilds: number = rows.length - buildRows.length;
  const totalBuilds: number = buildRows.length;
  if (totalBuilds < 1) {
    return {
      totalBuilds: totalBuilds,
      totalProjects: 0,
      buildsPerProjectRatio: undefined,
      averageInterBuildTimeMs: undefined,
      totalRequesters: 0,
      averageRequestersPerProject: undefined,
      faultedBuilds: 0,
      averageTrainingBooksPerBuild: undefined,
      averageTranslationBooksPerBuild: undefined,
      completedBuilds: 0,
      inProgressBuilds: 0,
      buildsWithProblems: 0,
      unconsideredBuilds: unconsideredBuilds,
      meanDurationMs: undefined,
      maxDurationMs: undefined,
      percentTimeOnSF: undefined,
      buildsServalDidNotKnowAbout: 0,
      buildsSfDidNotKnowAbout: 0
    };
  }

  // Group ServalBuildRows by their project.
  const rowsBySFProjectId: Map<string, KnowableBuildRow[]> = Map.groupBy(
    buildRows,
    (buildRow: KnowableBuildRow) => buildRow.report.project.sfProjectId
  );
  const sfProjectIdsUsed: Set<string> = new Set(rowsBySFProjectId.keys());
  const totalProjects: number = sfProjectIdsUsed.size;
  const buildsPerProjectRatio: number = totalBuilds / totalProjects;

  // Determine the average amount of time between Serval builds of the same project.
  const allGapsMs: number[] = [];
  for (const rowsForProject of rowsBySFProjectId.values()) {
    const gapsMs: number[] = gapsBetweenBuildsMs(rowsForProject).filter(notNull);
    allGapsMs.push(...gapsMs);
  }
  const averageInterBuildTimeMs: number | undefined = averageNumbers(allGapsMs);

  // Determine requesting SF user ids for each project.
  const requesters: Set<string | undefined> = new Set(
    buildRows.map(row => row.report.requesterSFUserId).filter(notNull)
  );
  const totalRequesters: number = requesters.size;

  let averageRequestersPerProject: number | undefined = undefined;
  // (Only compute average if we know the requester of each build.)
  if (buildRows.every((r: KnowableBuildRow) => notNull(r.report.requesterSFUserId))) {
    const projectsAndRequesters: Set<string> = new Set(
      buildRows.map(row => `${row.report.project.sfProjectId}-${row.report.requesterSFUserId}`)
    );

    averageRequestersPerProject = projectsAndRequesters.size / totalProjects;
  }

  const faultedBuilds: number = buildRows.filter(row => row.report.status === DraftGenerationBuildState.Faulted).length;
  const completedBuilds: number = buildRows.filter(
    row => row.report.status === DraftGenerationBuildState.Completed
  ).length;
  const inProgressBuilds: number = buildRows.filter(row => isInProgress(row.report.status)).length;
  const buildsWithProblems: number = buildRows.filter(row => row.report.problems.length > 0).length;

  const durations: number[] = buildRows.map((row: KnowableBuildRow) => row.durationMs).filter(notNull);
  const completedRows: KnowableBuildRow[] = buildRows.filter(
    (row: KnowableBuildRow) => row.report.status === DraftGenerationBuildState.Completed
  );
  const completedDurations: number[] = completedRows.map((row: KnowableBuildRow) => row.durationMs).filter(notNull);
  const meanDurationMs: number | undefined = averageNumbers(completedDurations);
  const maxDurationMs: number | undefined = durations.length > 0 ? Math.max(...durations) : undefined;

  // Book averages are calculated only from builds that have Serval data.
  const rowsWithServalData: KnowableBuildRow[] = buildRows.filter((row: KnowableBuildRow) => row.report.build != null);
  const servalBuildCount: number = rowsWithServalData.length;

  const totalTrainingBooks: number = rowsWithServalData.reduce(
    (sum: number, row: KnowableBuildRow) => sum + countBooks(row.trainingBooks),
    0
  );
  const totalTranslationBooks: number = rowsWithServalData.reduce(
    (sum: number, row: KnowableBuildRow) => sum + countBooks(row.translationBooks),
    0
  );

  const averageTrainingBooksPerBuild: number | undefined =
    servalBuildCount > 0 ? totalTrainingBooks / servalBuildCount : undefined;
  const averageTranslationBooksPerBuild: number | undefined =
    servalBuildCount > 0 ? totalTranslationBooks / servalBuildCount : undefined;

  const percentTimeOnSF: number | undefined = calculatePercentTimeOnSF(buildRows);

  // Builds with no Serval build data (events-only reports from backend)
  const buildsServalDidNotKnowAbout: number = buildRows.filter(
    (row: KnowableBuildRow) => row.report.build == null
  ).length;
  // Builds with Serval build data but no SF event timeline data
  const buildsSfDidNotKnowAbout: number = buildRows.filter(
    (row: KnowableBuildRow) => row.report.build != null && row.report.timeline.sfUserRequested == null
  ).length;

  return {
    totalBuilds: totalBuilds,
    totalProjects: totalProjects,
    buildsPerProjectRatio: buildsPerProjectRatio,
    averageInterBuildTimeMs: averageInterBuildTimeMs,
    totalRequesters: totalRequesters,
    averageRequestersPerProject: averageRequestersPerProject,
    faultedBuilds: faultedBuilds,
    averageTrainingBooksPerBuild: averageTrainingBooksPerBuild,
    averageTranslationBooksPerBuild: averageTranslationBooksPerBuild,
    completedBuilds: completedBuilds,
    inProgressBuilds: inProgressBuilds,
    buildsWithProblems: buildsWithProblems,
    unconsideredBuilds: unconsideredBuilds,
    meanDurationMs: meanDurationMs,
    maxDurationMs: maxDurationMs,
    percentTimeOnSF: percentTimeOnSF,
    buildsServalDidNotKnowAbout: buildsServalDidNotKnowAbout,
    buildsSfDidNotKnowAbout: buildsSfDidNotKnowAbout
  };
}
