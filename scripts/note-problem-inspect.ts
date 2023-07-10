#!/usr/bin/env -S deno run --allow-run

import { parse } from 'https://deno.land/x/xml/mod.ts';

// export paratextProjectIdList="<paste newline separated list of paratext project ids here>"
// for paratextProjectId in ${paratextProjectIdList}; do rsync -az scriptureforge-live:/var/lib/scriptureforge/sync/${paratextProjectId} ./; done

console.log('Start.');
if (Deno.args.length < 2) {
  console.log('Usage: ./this-script.ts SYNC_DIR MACHINE_NAME');
  console.log(
    `SYNC_DIR is the directory containing directories of paratext projects, like /var/lib/scriptureforge/sync.`
  );
  console.log(`MACHINE_NAME is the name of the computer running SF that would have authored the bad changes.`);
  Deno.exit(2);
}

const paratextProjectId = 'SFP';
const syncDir = Deno.args[0];
const sfMachineName = Deno.args[1];
const projectDir = `${syncDir}/${paratextProjectId}`;

function run(executable: string, args: string[], cwd: string): string {
  const command = new Deno.Command(executable, { args, cwd });
  const { code, stdout, stderr } = command.outputSync();
  console.assert(code === 0);
  console.assert(new TextDecoder().decode(stderr) === '');
  return new TextDecoder().decode(stdout);
}

const output = run(
  'hg',
  [
    'log',
    '--no-merges',
    '--date',
    '>2023-06-21',
    '--template',
    '{node}\n{date|date}\n\n{desc}\n\n{files % "{file}\n"}\n\n\n'
  ],
  projectDir
);

type FileDiff = {
  name: string;
  before: string;
  after: string;
};

const revisions = output
  .split('\n\n\n\n')
  .map(s => s.trim())
  .filter(s => s !== '')
  .map(rev => {
    const commitId = rev.split('\n')[0];
    const revDate = new Date(rev.split('\n')[1]);
    const revDescription = rev.split('\n\n')[1];
    const fileList = rev.split('\n\n')[2] ?? '';
    const files = fileList.split('\n').filter(f => f !== '');

    const xml = parse(revDescription);
    const fileDiffs: FileDiff[] = [];

    return { commitId, revDate, description: xml, files, fileDiffs };
  });

// Build up set of before and after snapshots of notes files, to examine.
let commitsFromLiveCount = 0;
for (const revision of revisions) {
  console.log(`Considering commit ${revision.commitId}`);
  if (revision.description.Summary.MachineName !== sfMachineName) {
    // Skip any commits that were made by Paratext on a desktop, rather than by SF on the SF server.
    continue;
  } else {
    commitsFromLiveCount++;
    console.log(`Commits from live count: ${commitsFromLiveCount}`);
  }

  for (const file of revision.files) {
    if (/^Notes_.*\.xml$/.test(file)) {
      console.log(`Examining file ${file}`);
      const fileAfterRevision = run('hg', ['cat', '-r', revision.commitId.toString(), file], projectDir);

      const fileBeforeRevision = run('hg', ['cat', '-r', revision.commitId.toString() + '^', file], projectDir);

      revision.fileDiffs = [];
      revision.fileDiffs.push({
        name: file,
        before: fileBeforeRevision,
        after: fileAfterRevision
      });
    }
  }
}

let commentDiffCount = 0;
for (const revision of revisions) {
  for (const diff of revision.fileDiffs) {
    if (diff.before !== '' && diff.after !== '') {
      let before: any;
      let after: any;
      try {
        after = parse(diff.after);
        before = parse(diff.before);
      } catch (e) {
        console.log(`Error: ${e.message}`);
        continue;
      }

      const commentsBefore = before!.CommentList!.Comment!;
      const commentsAfter = after!.CommentList!.Comment!;

      for (const commentBefore of commentsBefore) {
        const commentAfter = commentsAfter.find(
          c => c['@Thread'] === commentBefore['@Thread'] && c['@Date'] === commentBefore['@Date']
        );
        if (!commentAfter) continue;

        if (
          commentBefore.Contents != null &&
          JSON.stringify(commentBefore.Contents) !== JSON.stringify(commentAfter.Contents)
        ) {
          // We found a place where the before and after of a comment contents was different, and
          // where SF was making the change.
          console.log(`---- Problem instance ----`);
          console.log(`Revision number: ${revision.commitId}`);
          console.log(revision.description);
          console.log('Before: ', JSON.stringify(commentBefore.Contents, null, 2));
          console.log('After: ', JSON.stringify(commentAfter.Contents, null, 2));
          commentDiffCount++;
        }
      }
    }
  }
}

console.log(`Comment diff count: ${commentDiffCount}`);
