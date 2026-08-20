use('xforge');

const fs = require('fs');

// Exports the events recorded in event_metrics, translate_metrics and sync_metrics during a period,
// as a JSONL file.

// Example usage:
/*
  export MONGO_PORT="27017" &&
    export DATE_START="2026-01-01" &&
    export   DATE_END="2026-02-01" &&
    mongosh --port "${MONGO_PORT}" --file "${SF_REPO}"/mongodb/EventMetrics/EventsInPeriod.mongodb.js
*/
// DATE_START is inclusive and DATE_END is exclusive. Both are in UTC. Both are required.
//
// The resulting records can be different when queried from different times, because a retried Sync reuses the original
// sync_metrics doc, and with the same dateQueued time.

// --- The period ---

const DATE_LENGTH = 'YYYY-MM-DD'.length;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_EXAMPLE = '"2025-12-31"';

// DATE_START and DATE_END are both required, with no defaults, and are validated here - before any
// query runs.
function readRequiredDate(variableName) {
  const value = process.env[variableName];
  // (Not using `foo?.trim()` because mongosh has trouble with it.)
  const trimmed = value == null ? '' : value.trim();
  if (!trimmed) throw new Error(`${variableName} is required (for example ${DATE_EXAMPLE})`);
  if (!DATE_PATTERN.test(trimmed)) {
    throw new Error(`${variableName} is not a valid UTC date: "${trimmed}". Give it as ${DATE_EXAMPLE}.`);
  }
  const date = new Date(trimmed);
  if (isNaN(date.getTime())) {
    throw new Error(`${variableName} is not a real UTC date: "${trimmed}". Give it as ${DATE_EXAMPLE}.`);
  }
  // The day of the month is the one field the constructor does not reject when it is impossible: it
  // rolls the excess over into the next month, reading "2026-02-30" as 2 March. Comparing the day
  // arrived at against the day asked for catches that. Reject impossible dates that are probably typos.
  const dayArrivedAt = date.toISOString().slice(0, DATE_LENGTH);
  if (dayArrivedAt !== trimmed) {
    throw new Error(`${variableName} is not accepted: "${trimmed}" would mean ${dayArrivedAt}.`);
  }
  return date;
}

const dateStart = readRequiredDate('DATE_START');
const dateEnd = readRequiredDate('DATE_END');
// DATE_END is exclusive, so an end equal to the start would select nothing at all.
if (dateEnd <= dateStart) {
  throw new Error(
    `DATE_END (${dateEnd.toISOString()}) must be after DATE_START (${dateStart.toISOString()}), and is exclusive.`
  );
}
console.log(`Collecting events from ${dateStart.toISOString()} until before ${dateEnd.toISOString()}.`);

// --- Output file ---

// How the period is written into the output file name.
function periodLabel(date) {
  return date.toISOString().slice(0, DATE_LENGTH);
}

const fileNameBase = `events_${periodLabel(dateStart)}_${periodLabel(dateEnd)}`;

// Enough attempts to get past any plausible number of runs for one period, while still failing rather
// than looping forever if something is wrong with the directory.
const MAX_FILE_NAME_ATTEMPTS = 1000;

// Writes `content` to `baseName.extension`, or - if a file of that name is already there - to
// `baseName_1.extension`, `baseName_2.extension` and so on until an unused name is found, to not overwrite existing files. Returns the
// name written to.
//
// Flag 'wx' fails rather than truncating, which
// covers a file appearing between the existence check and the write as well.
function writeToNewFile(baseName, extension, content) {
  for (let attempt = 0; attempt <= MAX_FILE_NAME_ATTEMPTS; attempt++) {
    const fileName = attempt === 0 ? `${baseName}.${extension}` : `${baseName}_${attempt}.${extension}`;
    if (fs.existsSync(fileName)) continue;
    try {
      fs.writeFileSync(fileName, content, { flag: 'wx' });
      return fileName;
    } catch (error) {
      // Anything other than the file having just appeared is a real problem worth reporting.
      if (error.code !== 'EEXIST') throw error;
    }
  }
  throw new Error(
    `Could not find an unused name for ${baseName}.${extension} after ${MAX_FILE_NAME_ATTEMPTS} attempts.`
  );
}

// --- Reading the collections ---

// Each collection is selected by its own timestamp field, over [dateStart, dateEnd).
function inPeriod(field) {
  return { [field]: { $gte: dateStart, $lt: dateEnd } };
}

// The projection lists what to leave out rather than what to keep.
function fetchSyncMetrics() {
  return db.sync_metrics
    .find(inPeriod('dateQueued'), {
      log: 0,
      errorDetails: 0,
      'previousSyncs.log': 0,
      'previousSyncs.errorDetails': 0
    })
    .toArray();
}

function fetchTranslateMetrics() {
  return db.translate_metrics
    .find(inPeriod('timestamp'), {
      type: 1,
      sessionId: 1,
      userRef: 1,
      projectRef: 1,
      timestamp: 1,
      timeEditActive: 1,
      mouseClickCount: 1,
      keyBackspaceCount: 1,
      keyDeleteCount: 1,
      keyCharacterCount: 1,
      productiveCharacterCount: 1,
      suggestionAcceptedCount: 1,
      suggestionTotalCount: 1,
      editEndEvent: 1,
      keyNavigationCount: 1
    })
    .toArray();
}

function fetchEventMetrics() {
  return db.event_metrics
    .find(inPeriod('timeStamp'), { eventType: 1, projectId: 1, scope: 1, timeStamp: 1, userId: 1, exception: 1 })
    .toArray();
}

// --- Building the records ---

// A record holds only the fields that are actually there, omitting nulls.
function buildRecord(pairs) {
  const result = {};
  for (const [key, value] of pairs) {
    if (value != null) result[key] = value;
  }
  return result;
}

// Dates are written as ISO 8601 in UTC, which also sorts correctly as a string (see the ordering
// below). Built via the Date constructor rather than `value.toISOString()` so that a value already
// stored as a string is handled the same way.
function isoDate(value) {
  if (value == null) return undefined;
  return new Date(value).toISOString();
}

function idOf(doc) {
  return doc._id == null ? undefined : String(doc._id);
}

// The counters on a SyncMetricInfo section. NoteSyncMetricInfo (used for `notes`) adds `removed` to
// the added/deleted/updated the other sections have.
const SYNC_COUNTER_FIELDS = ['added', 'deleted', 'updated', 'removed'];

// How many changes a sync made in total, over every counter section it has - books, biblicalTerms,
// notes, noteThreads, the paratext* ones going the other way, questions, textDocs, users and so on.
function changeCountOf(syncMetric) {
  let total = 0;
  for (const value of Object.values(syncMetric)) {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const field of SYNC_COUNTER_FIELDS) {
      if (typeof value[field] === 'number') total += value[field];
    }
  }
  return total;
}

function syncMetricRecord(doc, attempt) {
  return buildRecord([
    ['source', 'sync_metrics'],
    ['id', idOf(doc)],
    ['attempt', attempt],
    ['dateStarted', isoDate(doc.dateStarted)],
    ['dateQueued', isoDate(doc.dateQueued)],
    ['dateFinished', isoDate(doc.dateFinished)],
    ['projectRef', doc.projectRef],
    ['userRef', doc.userRef],
    ['status', doc.status],
    ['changeCount', changeCountOf(doc)]
  ]);
}

// One record per attempt at the sync, numbered from 1.
//
// A sync_metrics document holds the latest attempt, with any earlier ones nested in previousSyncs,
// oldest first: on a retry, ParatextSyncRunner.InitAsync replaces the document
// under the same _id, moves what was there into previousSyncs, and keeps the original dateQueued. A
// nested attempt carries its own dateStarted, status and counters.
//
// The nested attempts carry the same _id as the document they sit in. The `attempt` number distinguishes them.
function syncMetricRecords(doc) {
  const previousSyncs = Array.isArray(doc.previousSyncs) ? doc.previousSyncs : [];
  return [...previousSyncs, doc].map((smDoc, index) => syncMetricRecord(smDoc, index + 1));
}

function translateMetricRecord(doc) {
  return buildRecord([
    ['source', 'translate_metrics'],
    ['id', idOf(doc)],
    ['type', doc.type],
    ['sessionId', doc.sessionId],
    ['userRef', doc.userRef],
    ['projectRef', doc.projectRef],
    ['timestamp', isoDate(doc.timestamp)],
    ['timeEditActive', doc.timeEditActive],
    ['mouseClickCount', doc.mouseClickCount],
    ['keyBackspaceCount', doc.keyBackspaceCount],
    ['keyDeleteCount', doc.keyDeleteCount],
    ['keyCharacterCount', doc.keyCharacterCount],
    ['productiveCharacterCount', doc.productiveCharacterCount],
    ['suggestionAcceptedCount', doc.suggestionAcceptedCount],
    ['suggestionTotalCount', doc.suggestionTotalCount],
    ['editEndEvent', doc.editEndEvent],
    ['keyNavigationCount', doc.keyNavigationCount]
  ]);
}

function eventMetricRecord(doc) {
  return buildRecord([
    ['source', 'event_metrics'],
    ['id', idOf(doc)],
    ['eventType', doc.eventType],
    ['projectId', doc.projectId],
    ['scope', doc.scope],
    ['timeStamp', isoDate(doc.timeStamp)],
    ['userId', doc.userId],
    ['failed', doc.exception != null]
  ]);
}

// Every collection is read before anything is written. A query failing part-way through
// won't leave a half-written file behind.
// A document usually yields one output record; a retried sync yields one output record per attempt.
const sources = [
  {
    name: 'event_metrics',
    docs: fetchEventMetrics(),
    timeField: 'timeStamp',
    toRecords: doc => [eventMetricRecord(doc)]
  },
  {
    name: 'translate_metrics',
    docs: fetchTranslateMetrics(),
    timeField: 'timestamp',
    toRecords: doc => [translateMetricRecord(doc)]
  },
  { name: 'sync_metrics', docs: fetchSyncMetrics(), timeField: 'dateQueued', toRecords: syncMetricRecords }
];

const events = [];
for (const source of sources) {
  for (const doc of source.docs) {
    for (const eventRecord of source.toRecords(doc)) {
      events.push({
        time: eventRecord[source.timeField],
        source: source.name,
        id: eventRecord.id,
        attempt: eventRecord.attempt == null ? 0 : eventRecord.attempt,
        record: eventRecord
      });
    }
  }
}

// In time order, so the file reads as one sequence of events rather than three. Times are compared as
// ISO 8601 UTC strings, which orders them the same way comparing the dates would. Ties are broken by
// source, then id, then attempt, so that exporting the same period twice in a row gives identical files.
function compareText(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
events.sort(
  (a, b) =>
    compareText(a.time, b.time) || compareText(a.source, b.source) || compareText(a.id, b.id) || a.attempt - b.attempt
);

// --- Writing them out ---

const lines = events.map(event => JSON.stringify(event.record));

// An empty period still produces a file, so that "nothing happened then" is recorded rather than
// being indistinguishable from a run that never completed.
const fileName = writeToNewFile(fileNameBase, 'jsonl', lines.length === 0 ? '' : lines.join('\n') + '\n');

print(`Wrote ${lines.length} events to ${fileName}`);
// Count records rather than documents, so that these add up to the total above even when a retried sync
// contributed more than one record.
for (const source of sources) {
  print(`  ${source.name}: ${events.filter(event => event.source === source.name).length}`);
}
