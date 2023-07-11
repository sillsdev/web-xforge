import { parse } from 'https://deno.land/x/xml/mod.ts';
import { run } from './utils.ts';

export type NoteFileRevision = {
  projectDir: string;
  file: string;
  revision: string;
};

self.onmessage = async evt => {
  await processNotesFile(evt.data);
  self.postMessage('done');
};

async function processNotesFile(noteFileRevision: NoteFileRevision): Promise<void> {
  const fileAfterRevision = run(
    'hg',
    ['cat', '-r', noteFileRevision.revision, noteFileRevision.file],
    noteFileRevision.projectDir
  );

  const fileBeforeRevision = run(
    'hg',
    ['cat', '-r', noteFileRevision.revision + '^', noteFileRevision.file],
    noteFileRevision.projectDir
  );

  if (fileBeforeRevision !== '' && fileAfterRevision !== '') {
    let before: any;
    let after: any;
    let firstOneParsed = false;
    try {
      after = parse(fileAfterRevision);
      firstOneParsed = true;
      before = parse(fileBeforeRevision);
    } catch (e) {
      console.log(
        `Error processing revision `,
        noteFileRevision,
        `firstOneParsed is ${firstOneParsed}. Error message:`,
        e.message
      );
      return;
    }

    const commentsBefore = before!.CommentList!.Comment!;
    const commentsAfter = after!.CommentList!.Comment!;

    for (const commentBefore of commentsBefore) {
      const commentAfter = commentsAfter.find(
        (c: any) => c['@Thread'] === commentBefore['@Thread'] && c['@Date'] === commentBefore['@Date']
      );

      if (!commentAfter) continue;

      if (
        commentBefore.Contents != null &&
        JSON.stringify(commentBefore.Contents) !== JSON.stringify(commentAfter.Contents)
      ) {
        console.log(`Problem instance. Commit id: ${noteFileRevision.revision}`);
        console.log('Before: ', JSON.stringify(commentBefore.Contents, null, 2));
        console.log('After: ', JSON.stringify(commentAfter.Contents, null, 2));
      }
    }
  }
}
