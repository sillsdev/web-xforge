use('xforge');

const fs = require('fs');

// Example usage, where CONNECTION can be empty for local or "ssh scriptureforge-foo" for a remote:
/*
  export CONNECTION="" &&
    export MONGO_PORT="27017" &&
    export PERIOD_START="2026-04-01" &&
    export PERIOD_END="2026-07-01" &&
    export TEST_PROJECTS="$(cat "${SF_REPO}"/mongodb/Projects/determine-project-metadata.py |
      ${CONNECTION} python3 |
      "${SF_REPO}"/mongodb/Projects/annotate-test-project-reasons.py --values)" &&
    mongosh --port "${MONGO_PORT}" --file "${SF_REPO}"/mongodb/Projects/ActiveProjects.mongodb.js
*/
// PERIOD_START is inclusive. PERIOD_END is exclusive (as its time is 00:00). Start and End are in UTC. TEST_PROJECTS is
// a white-space delimited list of PT project ids to exclude as test projects. ${CONNECTION} is purposefully un-quoted.
// PERIOD_START, PERIOD_END, and TEST_PROJECTS are required.

// This script determines whether each currently-existing SF project is "active" during the specified period. Projects
// that were active, but are now deleted, will not be considered due to technical limitations to do this well.
//
// A project counts as active if, during [periodStart, periodEnd), any of the following happened:
//
//   - a text edit (o_texts) or a question edit (o_questions) occurred
//   - any per-user project config change (o_sf_project_user_configs) occurred
//     - editor navigation,
//     - community checking reads,
//     - user preferences,
//     - and so on
//   - the project was switched to (o_users)
//   - a setting was changed (event_metrics, see ACTIVITY_EVENT_TYPES)
//   - a draft was generated (event_metrics, see ACTIVITY_EVENT_TYPES)
//
// A project is also considered active if a draft generation happened in the DRAFT_GENERATION_LOOKBACK_MONTHS before
// periodStart. The reason for this is that an expected use case for projects is to come to SF every few months, create
// a draft for the next book, and not come back for many months. We will count these projects as being active if they
// generated a draft within the 8 months before the reporting period began. An analysis of how long projects delay
// between draft requests shows a more noticeable drop-off after 8 months compared to other lengths.
//
// However, projects are excluded if they are:
//
//   - listed in TEST_PROJECTS, or
//   - DBL resources
//
// Projects that are merely used as the source of another project, but without meaningful activity of their own, should
// not be considered active. For this reason, Sync is not counted as activity, nor are text edits not attributable to a
// user.
//
// In addition to project activity, a count of new projects is also provided. A project is new if it was created and
// active during the period. SF project IDs are examined to determine creation date. Test and resource projects are
// excluded. Projects merely used as a source are not included, since there needs to be activity. Projects no longer in
// SF DB will not be reported.
//
// A count of projects deleted during the period is also provided by looking for DeleteProjectAsync events. Test
// projects will likely be included in this, unless TEST_PROJECTS includes data on non-existent projects.
//
// Unfortunately, this script will produce different results over time, even for the same reporting period, depending on
// what projects currently exist in the SF DB. Re-running it later for the same period will report fewer new projects
// and active projects.

// Number of months to look back prior to periodStart for draft generations.
const DRAFT_GENERATION_LOOKBACK_MONTHS = 8;

const DRAFT_BUILD_EVENT_TYPES = ['StartBuildAsync', 'StartPreTranslationBuildAsync'];

// event_metrics eventTypes that count as activity. Note that SyncAsync is omitted on purpose as part of excluding
// certain kinds of projects.
const ACTIVITY_EVENT_TYPES = ['UpdateSettingsAsync', ...DRAFT_BUILD_EVENT_TYPES];

// paratextId.length for a DBL/Paratext resource
const DBL_RESOURCE_ID_LENGTH = 16;

const DELETE_PROJECT_EVENT_TYPES = ['DeleteProjectAsync'];

// Ops history collections (o_texts, o_questions, o_sf_project_user_configs) share a ShareDB schema:
// doc id `d` is "<projectId>:<restOfId>", `m.ts` is a millisecond epoch timestamp.
const PROJECT_ID_FROM_OP_DOC_ID = { $arrayElemAt: [{ $split: ['$d', ':'] }, 0] };

// --- Inputs ---

function readRequiredDate(variableName) {
  const value = process.env[variableName];
  // (Not using `foo?.trim()` because mongosh has trouble with it.)
  const trimmed = value == null ? '' : value.trim();
  if (!trimmed) throw new Error(`${variableName} is required (for example "2026-04-01")`);
  const date = new Date(trimmed);
  if (isNaN(date.getTime())) throw new Error(`${variableName} is not a valid date: "${trimmed}"`);
  return date;
}

// { periodStart, periodEnd, draftGenerationLookbackStart } - all UTC, periodEnd exclusive.
function readPeriod() {
  const periodStart = readRequiredDate('PERIOD_START');
  const periodEnd = readRequiredDate('PERIOD_END');
  if (periodEnd <= periodStart) {
    throw new Error(`PERIOD_END (${dateLabel(periodEnd)}) must be after PERIOD_START (${dateLabel(periodStart)})`);
  }
  const draftGenerationLookbackStart = new Date(periodStart);
  draftGenerationLookbackStart.setUTCMonth(
    draftGenerationLookbackStart.getUTCMonth() - DRAFT_GENERATION_LOOKBACK_MONTHS
  );
  return { periodStart, periodEnd, draftGenerationLookbackStart };
}

function readTestProjectParatextIds() {
  const paratextIds = new Set((process.env.TEST_PROJECTS ?? '').split(/\s+/).filter(Boolean));
  if (paratextIds.size === 0) {
    throw new Error('TEST_PROJECTS is required, as a white-space delimited list of PT project ids to exclude');
  }
  return paratextIds;
}

function dateLabel(date) {
  return date.toISOString().slice(0, 10);
}

// Every sf_projects id is a MongoDB ObjectId (see SFProjectService.CreateProjectAsync), which embeds
// its creation time as the first 4 bytes (seconds since the Unix epoch, big-endian hex) - so a
// project's creation date needs no extra field or query, just its id.
function objectIdCreatedAt(id) {
  return new Date(parseInt(id.substring(0, 8), 16) * 1000);
}

function wasCreatedDuring(projectId, period) {
  const createdAt = objectIdCreatedAt(projectId);
  return createdAt >= period.periodStart && createdAt < period.periodEnd;
}

// --- Fetching ---

// $match stage restricting an ops-history collection to user-attributed ops during the period.
//
// `m.uId` is the id of the user whose connection submitted the op. It is absent for anything the
// server did on its own, like data migrations and various operations done during a sync.
function userOpsInPeriodMatch(period) {
  return {
    $match: {
      'm.ts': { $gte: period.periodStart.getTime(), $lt: period.periodEnd.getTime() },
      'm.uId': { $exists: true }
    }
  };
}

function fetchProjects() {
  return db.sf_projects.find({}, { paratextId: 1 }).toArray();
}

// Project ids with at least one op in `collectionName` during the period.
function fetchOpsProjectIds(collectionName, period) {
  const rows = db[collectionName]
    // o_texts, o_questions, and o_sf_project_user_configs all have a doc id of "<projectId>:<rest>".
    .aggregate([userOpsInPeriodMatch(period), { $group: { _id: PROJECT_ID_FROM_OP_DOC_ID } }])
    .toArray();
  return rows.map(row => row._id);
}

function fetchProjectSwitchProjectIds(period) {
  const rows = db.o_users
    .aggregate([
      userOpsInPeriodMatch(period),
      { $unwind: '$op' },
      { $match: { 'op.p': ['sites', 'sf', 'currentProjectId'], 'op.oi': { $exists: true } } },
      { $group: { _id: '$op.oi' } }
    ])
    .toArray();
  return rows.map(row => row._id);
}

function fetchProjectIdsWithEventMetricsInPeriod(eventTypes, period) {
  const rows = db.event_metrics
    .find(
      { eventType: { $in: eventTypes }, timeStamp: { $gte: period.periodStart, $lt: period.periodEnd } },
      { projectId: 1 }
    )
    .toArray();
  return rows.map(row => row.projectId);
}

// Projects that requested a draft in [draftGenerationLookbackStart, periodStart).
function fetchDraftGenerationLookbackProjectIds(period) {
  const rows = db.event_metrics
    .aggregate([
      {
        $match: {
          eventType: { $in: DRAFT_BUILD_EVENT_TYPES },
          timeStamp: { $gte: period.draftGenerationLookbackStart, $lt: period.periodStart }
        }
      },
      { $group: { _id: '$projectId' } }
    ])
    .toArray();
  return new Set(rows.map(row => row._id));
}

function fetchProjectIdsWithActivity(period) {
  const textProjectIds = fetchOpsProjectIds('o_texts', period);
  const questionProjectIds = fetchOpsProjectIds('o_questions', period);
  const userConfigProjectIds = fetchOpsProjectIds('o_sf_project_user_configs', period);
  const projectSwitchProjectIds = fetchProjectSwitchProjectIds(period);
  const eventMetricProjectIds = fetchProjectIdsWithEventMetricsInPeriod(ACTIVITY_EVENT_TYPES, period);

  return new Set([
    ...textProjectIds,
    ...questionProjectIds,
    ...userConfigProjectIds,
    ...projectSwitchProjectIds,
    ...eventMetricProjectIds
  ]);
}

// Projects deleted during the period, as Map<projectId, paratextId>.
function fetchDeletedProjectParatextIdsInPeriod(period) {
  const rows = db.event_metrics
    .find(
      {
        eventType: { $in: DELETE_PROJECT_EVENT_TYPES },
        timeStamp: { $gte: period.periodStart, $lt: period.periodEnd }
      },
      { projectId: 1, 'payload.paratextId': 1 }
    )
    .toArray();
  // Keyed by project, so a deletion recorded more than once still counts once.
  const paratextIdByProjectId = new Map();
  for (const row of rows) {
    paratextIdByProjectId.set(row.projectId, row.payload == null ? undefined : row.payload.paratextId);
  }
  return paratextIdByProjectId;
}

// --- Classification ---

// Returns the reason a project is excluded from being counted as active ('resource' | 'test'), or null if it
// isn't excluded.
function exclusionReasonForParatextId(paratextId, testProjectParatextIds) {
  if (!paratextId) return null;
  if (testProjectParatextIds.has(paratextId)) return 'test';
  if (paratextId.length === DBL_RESOURCE_ID_LENGTH) return 'resource';
  return null;
}

function classifyProjects(period, projects, options) {
  const { activityProjectIds, draftGenerationLookbackProjectIds, testProjectParatextIds } = options;
  let activeCount = 0;
  let withUserActivity = 0;
  let withRecentDraftingOnly = 0;
  let inactiveCount = 0;
  let newProjectCount = 0;
  const countByExclusionReason = new Map();

  for (const project of projects) {
    const id = project._id.toString();
    const exclusionReason = exclusionReasonForParatextId(project.paratextId, testProjectParatextIds);
    if (exclusionReason) {
      countByExclusionReason.set(exclusionReason, (countByExclusionReason.get(exclusionReason) ?? 0) + 1);
      continue;
    }
    const hasActivityInPeriod = activityProjectIds.has(id);
    if (hasActivityInPeriod) {
      activeCount++;
      withUserActivity++;
      if (wasCreatedDuring(id, period)) newProjectCount++;
    } else if (draftGenerationLookbackProjectIds.has(id)) {
      activeCount++;
      withRecentDraftingOnly++;
    } else {
      // Exists, is a real translation project, and nothing happened in it during the period.
      inactiveCount++;
    }
  }

  return {
    activeCount,
    inactiveCount,
    withUserActivity,
    withRecentDraftingOnly,
    newProjectCount,
    countByExclusionReason
  };
}

// --- Output ---

function buildSummaryContent(period, totalProjectCount, classification, deletedProjectCount) {
  const {
    activeCount,
    inactiveCount,
    withUserActivity,
    withRecentDraftingOnly,
    newProjectCount,
    countByExclusionReason
  } = classification;

  const excludedCount = [...countByExclusionReason.values()].reduce((sum, count) => sum + count, 0);
  const reasonSummary = [...countByExclusionReason.entries()].map(([reason, count]) => `${count} ${reason}`).join(', ');

  return (
    [
      `# Project Activity Report (${dateLabel(period.periodStart)} to ${dateLabel(period.periodEnd)})`,
      `Period: ${period.periodStart.toISOString()} to ${period.periodEnd.toISOString()} (UTC, end exclusive).`,
      `There were ${activeCount} active projects. (${withUserActivity} with user activity and ` +
        `${withRecentDraftingOnly} that only had a draft generated in the ${DRAFT_GENERATION_LOOKBACK_MONTHS} ` +
        'months leading up to the period.)',
      `There were ${inactiveCount} inactive projects.`,
      `There were ${newProjectCount} projects that were created at SF during the period.`,
      `Excluded ${excludedCount} of ${totalProjectCount} total projects from the above. ${reasonSummary}`,
      `There were ${deletedProjectCount} projects that were deleted at SF during the period, which does not include resources but likely includes most test projects.`,
      `This report was generated on ${dateLabel(new Date())}. Only projects still in the SF DB at this time are included in the count of new or active projects.`
    ].join('\n\n') + '\n'
  );
}

function summaryFileName(period) {
  return `project_activity_${dateLabel(period.periodStart)}_${dateLabel(period.periodEnd)}.md`;
}

function assertFileDoesNotExist(fileName) {
  if (fs.existsSync(fileName)) {
    throw new Error(`${fileName} already exists. Move, rename or delete it, then run this again.`);
  }
}

function writeSummary(fileName, content) {
  // 'wx' fails rather than truncating if the file exists, so even if it appeared since the check
  // above, an existing report is never destroyed.
  fs.writeFileSync(fileName, content, { flag: 'wx' });
  print(`Wrote ${fileName}`);
}

function main() {
  const period = readPeriod();
  console.log(`Generating a report from ${period.periodStart} until ${period.periodEnd}.`);

  const testProjectParatextIds = readTestProjectParatextIds();
  const fileName = summaryFileName(period);
  assertFileDoesNotExist(fileName);

  const activityProjectIds = fetchProjectIdsWithActivity(period);
  const draftGenerationLookbackProjectIds = fetchDraftGenerationLookbackProjectIds(period);
  const projects = fetchProjects();

  const classification = classifyProjects(period, projects, {
    activityProjectIds,
    draftGenerationLookbackProjectIds,
    testProjectParatextIds
  });

  // Counted separately from classifyProjects, which walks the projects that still exist - by
  // definition none of these do.
  const deletedParatextIds = [...fetchDeletedProjectParatextIdsInPeriod(period).values()];
  const deletedProjectCount = deletedParatextIds.filter(
    paratextId => exclusionReasonForParatextId(paratextId, testProjectParatextIds) == null
  ).length;

  writeSummary(fileName, buildSummaryContent(period, projects.length, classification, deletedProjectCount));
}

main();
