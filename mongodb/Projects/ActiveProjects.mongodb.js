use('xforge');

const fs = require('fs');

// List active projects during period.
// Example usage, where CONNECTION can be empty for local or "ssh scriptureforge-foo" for a remote:
/*
  export CONNECTION="" &&
    export MONGO_PORT="27017" &&
    export PERIOD_START="2026-04-01" &&
    export   PERIOD_END="2026-07-01" &&
    export PROJECT_METADATA="$(mktemp)" &&
    cat "${SF_REPO}"/mongodb/Projects/determine-project-metadata.py | ${CONNECTION} python3 > "${PROJECT_METADATA}" &&
    mongosh --port "${MONGO_PORT}" --file "${SF_REPO}"/mongodb/Projects/ActiveProjects.mongodb.js
*/
// PERIOD_START is inclusive. PERIOD_END is exclusive. Start and End are in UTC. PROJECT_METADATA is a path to a JSON
// file with Visibility metadata. All three are required. ${CONNECTION} is intentionally un-quoted.

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
//   - DBL resources,
//   - marked as test projects by Visibility, or
//   - deemed test projects based on their name
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
// A count of projects deleted during the period is also provided by looking for DeleteProjectAsync events. Resources
// are not included in this count. Few if any test projects will be included in this count.
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

// Paratext project Visibility settings, as determine-project-metadata.py emits them, keyed by PT project id:
// Map<paratextId, visibility>.
//
// Visibility comes from project repo Settings.xml files rather than from the DB since older projects do not have
// visibility set in the DB.
function readProjectMetadata() {
  const fileName = process.env.PROJECT_METADATA;
  // (Not using `foo?.trim()` because mongosh has trouble with it.)
  const trimmed = fileName == null ? '' : fileName.trim();
  if (!trimmed) {
    throw new Error(
      'PROJECT_METADATA is required: the path to a local file holding the JSON output of ' +
        'determine-project-metadata.py'
    );
  }

  let contents;
  try {
    contents = fs.readFileSync(trimmed, 'utf8');
  } catch (error) {
    throw new Error(`PROJECT_METADATA file "${trimmed}" could not be read: ${error.message}`);
  }

  let entries;
  try {
    entries = JSON.parse(contents);
  } catch (error) {
    throw new Error(`PROJECT_METADATA file "${trimmed}" is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`PROJECT_METADATA file "${trimmed}" should be a non-empty JSON array of project metadata`);
  }

  const visibilityByParatextId = new Map();
  for (const entry of entries) {
    if (entry != null && entry.guid) visibilityByParatextId.set(entry.guid, entry.visibility);
  }
  if (visibilityByParatextId.size === 0) {
    throw new Error(`PROJECT_METADATA file "${trimmed}" has no entries with a guid`);
  }
  return visibilityByParatextId;
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
  return db.sf_projects.find({}, { paratextId: 1, name: 1 }).toArray();
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

// This section regards identifying projects as active, test projects, etc.

// Continuations that mean the "test" just matched is really a Testament-like word. Written out with explicit character
// classes rather than relying on a case-insensitive flag, because the second pattern below must stay case-sensitive on
// its leading capital T while still rejecting these continuations in any case.
const NOT_A_TEST_CONTINUATION = '(?![Aa][Mm][Ee][Nn][Tt]|[Aa][Mm][Aa][Nn](?![\\p{L}\\p{N}_])|[Mm][Ee][Nn][Tt])';

// Names that say a project is a test project, like "My Test Project" or "Back translation zzTEST", without
// catching a real project like "New Testament Revised Edition" or "The Protestant Bible".
//
// These are two patterns rather than one because they need different case sensitivity.
const TEST_NAME_PATTERNS = [
  // "test" standing as its own word, in any case: Test, TEST, Testing, test.
  new RegExp(`(?<![a-zA-Z])test${NOT_A_TEST_CONTINUATION}`, 'iu'),
  // "TEST" glued onto the end of a preceding word, as in zzTESTAB or FooBazTest. Deliberately case-sensitive on the
  // capital T: that capital is the only signal that a new word starts here, since there is no space to make a word
  // boundary. Ordinary lowercase like "attest" keeps its t lowercase and so never matches.
  new RegExp(`(?<=[a-z])T[Ee][Ss][Tt]${NOT_A_TEST_CONTINUATION}`, 'u')
];

// Why a project looks like a test project, as a comma-separated list of reasons, or null if it doesn't look like one.
function computeReasonIsTest(visibility, fullName) {
  const name = fullName || '';
  const reasons = [];
  if (visibility === 'Test') reasons.push('projectSetting');
  if (TEST_NAME_PATTERNS.some(pattern => pattern.test(name))) reasons.push('testName');
  // Deliberately plain substring checks. Examining production project names turned up no unwanted matches.
  if (name.toLowerCase().includes('demo')) reasons.push('demoName');
  if (name.toLowerCase().includes('sample')) reasons.push('sampleName');
  return reasons.length > 0 ? reasons.join(',') : null;
}

// Returns the reason a project is excluded from being counted as active ('resource' | 'test'), or null if it isn't
// excluded.
function exclusionReasonForParatextId(paratextId, visibilityByParatextId, projectName) {
  if (isResourceParatextId(paratextId)) return 'resource';
  if (computeReasonIsTest(visibilityByParatextId.get(paratextId), projectName) != null) return 'test';
  return null;
}

function isResourceParatextId(paratextId) {
  return paratextId != null && paratextId.length === DBL_RESOURCE_ID_LENGTH;
}

function classifyProjects(period, projects, options) {
  const { activityProjectIds, draftGenerationLookbackProjectIds, visibilityByParatextId } = options;
  let activeCount = 0;
  let withUserActivity = 0;
  let withRecentDraftingOnly = 0;
  let inactiveCount = 0;
  let newProjectCount = 0;
  let withoutMetadataCount = 0;
  const countByExclusionReason = new Map();

  for (const project of projects) {
    const id = project._id.toString();
    if (!isResourceParatextId(project.paratextId) && !visibilityByParatextId.has(project.paratextId)) {
      withoutMetadataCount++;
    }
    const exclusionReason = exclusionReasonForParatextId(project.paratextId, visibilityByParatextId, project.name);
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
    withoutMetadataCount,
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
    withoutMetadataCount,
    countByExclusionReason
  } = classification;

  const excludedCount = [...countByExclusionReason.values()].reduce((sum, count) => sum + count, 0);
  // Sorted by reason, so the line reads the same way from one run to the next. Insertion order would
  // otherwise depend on which excluded project happened to come first in the project list.
  const reasonSummary = [...countByExclusionReason.entries()]
    .sort(([reasonA], [reasonB]) => reasonA.localeCompare(reasonB))
    .map(([reason, count]) => `${count} ${reason}`)
    .join(', ');

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
      `${withoutMetadataCount} ${withoutMetadataCount === 1 ? 'project had' : 'projects had'} no entry in the ` +
        'project metadata, and so were not judged by a Visibility setting.',
      `There were ${deletedProjectCount} projects that were deleted at SF during the period, which does not include resources, but would include test projects.`,
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

  const visibilityByParatextId = readProjectMetadata();
  const fileName = summaryFileName(period);
  assertFileDoesNotExist(fileName);

  const activityProjectIds = fetchProjectIdsWithActivity(period);
  const draftGenerationLookbackProjectIds = fetchDraftGenerationLookbackProjectIds(period);
  const projects = fetchProjects();

  const classification = classifyProjects(period, projects, {
    activityProjectIds,
    draftGenerationLookbackProjectIds,
    visibilityByParatextId
  });

  // Counted separately from classifyProjects, which walks the projects that still exist - by
  // definition none of these do.
  const deletedParatextIds = [...fetchDeletedProjectParatextIdsInPeriod(period).values()];
  const deletedProjectCount = deletedParatextIds.filter(
    // We can see if a PT project ID is for a resource (which may or may not make sense to look for when looking for
    // deleted projects). Also checking for whether a PT project ID was found to have Visibility of Test is merely done
    // just in case; as normally a deleted project will not leave behind a PT repo from which to learn its Visibility.
    paratextId => exclusionReasonForParatextId(paratextId, visibilityByParatextId) == null
  ).length;

  writeSummary(fileName, buildSummaryContent(period, projects.length, classification, deletedProjectCount));
}

main();
