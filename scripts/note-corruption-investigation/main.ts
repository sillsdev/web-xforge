import { parse } from 'https://deno.land/x/xml/mod.ts';
import { run } from './utils.ts';
import { NoteFileRevision } from './worker.ts';
import metadata from './private-metadata.json' assert { type: 'json' };

// First fetch with: for paratextProjectId in "<space-separated list>";
// do rsync -az scriptureforge-live:/var/lib/scriptureforge/sync/${paratextProjectId} ./; done
// Then create private-metadata.json from .template.

const sfMachineName = metadata.sfMachineName;
const syncDir = metadata.syncDir;
const paratextProjectIds = metadata.paratextProjectIds.trim().split(' ');

let workerCount = 0;
const maxWorkerCount = 15;

for (const [index, projectId] of paratextProjectIds.entries()) {
  const projectDir = `${syncDir}/${projectId}/target`;

  console.log(`Processing ${projectId} (${index + 1}/${paratextProjectIds.length})`);

  const hgLogOutput = run(
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

  const revisions = hgLogOutput
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

      return { commitId, revDate, description: xml, files };
    });

  for (const [revisionIndex, revision] of revisions.entries()) {
    const machineName: string = (revision.description as any).Summary.MachineName;
    const comment: string = (revision.description as any).Summary.Comment;
    if (machineName !== sfMachineName || !/\d+ notes updated/.test(comment)) {
      continue;
    }
    console.log(`Processing revision ${revisionIndex + 1}/${revisions.length}`);

    const filesToDiff = revision.files.filter(file => /^Notes_.*\.xml$/.test(file));

    const revisionsToDiff: NoteFileRevision[] = filesToDiff.map(file => ({
      projectDir,
      file,
      revision: revision.commitId
    }));

    while (workerCount >= maxWorkerCount) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    console.log(`Starting comparison of ${revisionsToDiff.length} files`);
    Promise.all(revisionsToDiff.map(invokeWorker));
  }
}

async function invokeWorker(noteFileRevision: NoteFileRevision): Promise<void> {
  const worker = new Worker(new URL('./worker.ts', import.meta.url).href, {
    type: 'module'
  });
  workerCount++;
  return await new Promise(resolve => {
    worker.addEventListener('message', event => {
      worker.terminate();
      workerCount--;
      resolve();
    });
    worker.addEventListener('error', event => {
      console.log('error');
      console.log(event);
      worker.terminate();
      workerCount--;
      resolve();
    });
    worker.postMessage(noteFileRevision);
  });
}
