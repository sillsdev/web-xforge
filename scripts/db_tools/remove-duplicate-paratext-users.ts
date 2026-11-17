#!/usr/bin/env -S bash -c '"$(dirname "$0")"/node_modules/.bin/ts-node "$(dirname "$0")/$(basename "$0")" "$@"'
// The above causes the local ts-node to be used even if run from another directory. Setup: pnpm ci
//
// Remove duplicate Paratext users from projects
//
// A project's paratextUsers list should have one entry for each Paratext username. Two requests that added the same
// user at the same time could each add an entry, and every sync of such a project then fails with "An item with the
// same key has already been added".
//
// For each project with such duplicates, this script prints the entries, which of them it would remove, and the op
// that removes them. It then asks whether to submit the op, and submits it only if the answer is "y".
//
// Which entries it removes: notes and answers refer to an entry by its opaqueUserId, and an entry that something
// refers to is never removed. For the entries of one username:
//   - If one of them is referred to, the others are removed.
//   - If none of them is referred to and they are the same apart from their opaqueUserId, all but one are removed.
//   - Otherwise it is not clear which to remove, and the project is left alone.
//
// The script fetches each project from the running realtime server, and submits the op to it, as a system
// administrator. The realtime server does not let a system administrator read a project's notes and answers, so which
// projects have duplicates, and which entries are referred to, are read from MongoDB.
//
// Before running:
//   - Set SERVER below.
//   - Forward that server's MongoDB port and realtime server websocket port to the ports in utils.js.
//   - Put a system administrator's access token in the environment variable SF_ACCESS_TOKEN. The web app's own
//     websocket address, shown in the browser's developer tools, ends in "?access_token=" followed by the token.

import { Db, MongoClient } from 'mongodb';
import readline from 'readline';
import { Doc } from 'sharedb/lib/client';
import { ParatextUserProfile } from '../../src/RealtimeServer/scriptureforge/models/paratext-user-profile';
import { ConnectionSettings, createUserConnection, databaseConfigs, fetchDoc, submitDocOp } from './utils';

/** The server to work on: 'dev', 'qa' or 'live'. */
const SERVER: string = 'dev';

async function main(): Promise<void> {
  const connectionConfig: ConnectionSettings | undefined = databaseConfigs.get(SERVER);
  const accessToken: string | undefined = process.env.SF_ACCESS_TOKEN;
  if (connectionConfig == null || accessToken == null) {
    throw new Error('Set SERVER in this script, and SF_ACCESS_TOKEN in the environment.');
  }
  const mongoClient: MongoClient = await MongoClient.connect(connectionConfig.dbLocation);
  const db: Db = mongoClient.db();
  const { conn, close } = await createUserConnection(connectionConfig, accessToken);
  const terminal: readline.Interface = readline.createInterface({ input: process.stdin, output: process.stdout });

  for (const projectId of await findProjectsWithDuplicates(db)) {
    const projectDoc: Doc = conn.get('sf_projects', projectId);
    await fetchDoc(projectDoc);
    const paratextUsers: ParatextUserProfile[] = projectDoc.data.paratextUsers;
    const referencedIds: Set<string | undefined> = await findReferencedOpaqueUserIds(db, projectId);

    console.log(`\nProject ${projectDoc.data.shortName}, SF id ${projectId}. Its paratextUsers entries:`);
    paratextUsers.forEach((user: ParatextUserProfile, index: number) => {
      const isReferredTo: string = referencedIds.has(user.opaqueUserId) ? 'referred to' : 'not referred to';
      console.log(
        `  ${index}: ${user.username}, ${user.opaqueUserId}, ${user.sfUserId}, ${user.role}, ${isReferredTo}`
      );
    });

    const indexesToRemove: number[] | string = chooseEntriesToRemove(paratextUsers, referencedIds);
    if (typeof indexesToRemove === 'string') {
      console.log(`Not changing this project: ${indexesToRemove}`);
      continue;
    }

    // Remove from the end of the list first, so that removing an entry does not move the entries still to be removed.
    indexesToRemove.sort((a: number, b: number) => b - a);
    const op = indexesToRemove.map((index: number) => ({ p: ['paratextUsers', index], ld: paratextUsers[index] }));
    console.log(`Op that removes the entries at ${indexesToRemove.join(', ')}:`);
    console.log(JSON.stringify(op, null, 2));

    const answer: string = await new Promise(resolve => terminal.question('Submit this op? [y/N] ', resolve));
    if (answer === 'y') {
      await submitDocOp(projectDoc, op);
      console.log('Submitted.');
    } else {
      console.log('Not submitted.');
    }
  }

  terminal.close();
  close();
  await mongoClient.close();
}

/** Finds the IDs of the projects that have more than one paratextUsers entry for some username. */
async function findProjectsWithDuplicates(db: Db): Promise<string[]> {
  const projects: { _id: string; paratextUsers?: { username: string }[] }[] = await db
    .collection<{ _id: string; paratextUsers?: { username: string }[] }>('sf_projects')
    .find({}, { projection: { 'paratextUsers.username': 1 } })
    .toArray();
  const projectsWithDuplicates = projects.filter(project => {
    const usernames: string[] = (project.paratextUsers ?? []).map(user => user.username);
    return new Set(usernames).size < usernames.length;
  });
  return projectsWithDuplicates.map(project => project._id);
}

/**
 * Finds every opaqueUserId that the project's notes and answers refer to. A note thread, a note, an answer, and a
 * comment on an answer can each refer to a paratextUsers entry by its opaqueUserId.
 */
async function findReferencedOpaqueUserIds(db: Db, projectId: string): Promise<Set<string | undefined>> {
  const referencedIds = new Set<string | undefined>();

  const noteThreads = await db
    .collection<{ assignment?: string; notes?: { syncUserRef?: string; assignment?: string }[] }>('note_threads')
    .find({ projectRef: projectId })
    .toArray();
  for (const noteThread of noteThreads) {
    referencedIds.add(noteThread.assignment);
    for (const note of noteThread.notes ?? []) {
      referencedIds.add(note.syncUserRef);
      referencedIds.add(note.assignment);
    }
  }

  const questions = await db
    .collection<{ answers?: { syncUserRef?: string; comments?: { syncUserRef?: string }[] }[] }>('questions')
    .find({ projectRef: projectId })
    .toArray();
  for (const question of questions) {
    for (const answer of question.answers ?? []) {
      referencedIds.add(answer.syncUserRef);
      for (const comment of answer.comments ?? []) {
        referencedIds.add(comment.syncUserRef);
      }
    }
  }

  return referencedIds;
}

/**
 * Chooses which entries to remove from a paratextUsers list, so that each username is left with one entry.
 * @returns The indexes of the entries to remove, or the reason that it is not clear which to remove.
 */
function chooseEntriesToRemove(
  paratextUsers: ParatextUserProfile[],
  referencedIds: Set<string | undefined>
): number[] | string {
  const indexesToRemove: number[] = [];
  for (const username of new Set(paratextUsers.map(user => user.username))) {
    // The indexes of the entries that have this username
    const indexes: number[] = [];
    paratextUsers.forEach((user: ParatextUserProfile, index: number) => {
      if (user.username === username) indexes.push(index);
    });
    if (indexes.length === 1) continue;

    const referredTo: number[] = indexes.filter(index => referencedIds.has(paratextUsers[index].opaqueUserId));
    const first: ParatextUserProfile = paratextUsers[indexes[0]];
    const areSameApartFromOpaqueUserId: boolean = indexes.every(
      index => paratextUsers[index].sfUserId === first.sfUserId && paratextUsers[index].role === first.role
    );

    let indexToKeep: number;
    if (referredTo.length === 1) {
      // Only one entry is in use. Keep it.
      indexToKeep = referredTo[0];
    } else if (referredTo.length === 0 && areSameApartFromOpaqueUserId) {
      // No entry is in use, and the entries are copies of each other, so it makes no difference which one is kept.
      indexToKeep = indexes[0];
    } else {
      return `${referredTo.length} of the entries for ${username} are referred to, so it is not clear which to remove.`;
    }
    indexesToRemove.push(...indexes.filter(index => index !== indexToKeep));
  }
  return indexesToRemove;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
