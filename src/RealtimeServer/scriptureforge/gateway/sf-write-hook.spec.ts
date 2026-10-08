import { GatewayWrite, GatewayWriteChange, WriteDecision } from '../../common/gateway/authorization';
import { JSON0_TYPE_URI, RICH_TEXT_TYPE_URI } from '../../common/gateway/protocol-config';
import { USER_PROFILES_COLLECTION, USERS_COLLECTION } from '../../common/models/user';
import { NOTE_THREAD_COLLECTION } from '../models/note-thread';
import { SF_PROJECTS_COLLECTION } from '../models/sf-project';
import { TEXT_AUDIO_COLLECTION } from '../models/text-audio';
import { TEXTS_COLLECTION } from '../models/text-data';
import { OTHER_PROJECT_ID, PROJECT_ID, sessionFor, TestUserName, TestWorld, USERS } from './test-gateway-world';
import { PresenceIdBindings } from './presence-bindings';
import { SFWriteHook } from './sf-write-hook';

const TEXT_1 = `${PROJECT_ID}:MAT:1:target`;
const TEXT_2 = `${PROJECT_ID}:MAT:2:target`;

describe('SFWriteHook', () => {
  it.each<[TestUserName, string, boolean]>([
    ['admin', TEXT_1, true],
    ['translator', TEXT_1, true],
    ['translator', TEXT_2, false],
    ['consultant', TEXT_1, false],
    ['nonMember', TEXT_1, false]
  ])('lets %s apply a rich-text op to %s: %s', async (user: TestUserName, textId: string, allowed: boolean) => {
    const env = new TestEnvironment();

    const decision: WriteDecision = await env.authorize(user, env.textEdit(textId));

    expect(decision.kind).toEqual(allowed ? 'allowed' : 'refused');
  });

  it('decides again from the current permissions each time it is asked, as on a commit retry', async () => {
    const env = new TestEnvironment();
    const write: GatewayWrite = env.textEdit(TEXT_1);

    const first: WriteDecision = await env.authorize('translator', write);
    const second: WriteDecision = await env.authorize('translator', write);

    expect(first).toEqual({ kind: 'allowed' });
    expect(second).toEqual({ kind: 'allowed' });
  });

  it('refuses every delete', async () => {
    const env = new TestEnvironment();

    const decision: WriteDecision = await env.authorize(
      'admin',
      env.write(TEXTS_COLLECTION, TEXTS_COLLECTION, TEXT_1, { kind: 'delete' })
    );

    expect(decision.kind).toEqual('refused');
  });

  it('refuses ops on collections clients only read, and through projections', async () => {
    const env = new TestEnvironment();
    const edit: GatewayWriteChange = { kind: 'edit', edit: { otType: 'json0', components: [] } };

    const project: WriteDecision = await env.authorize(
      'admin',
      env.write(SF_PROJECTS_COLLECTION, SF_PROJECTS_COLLECTION, PROJECT_ID, edit, {})
    );
    const audio: WriteDecision = await env.authorize(
      'admin',
      env.write(TEXT_AUDIO_COLLECTION, TEXT_AUDIO_COLLECTION, TEXT_1, edit, {})
    );
    const profile: WriteDecision = await env.authorize(
      'admin',
      env.write(USERS_COLLECTION, USER_PROFILES_COLLECTION, USERS.admin, edit, {})
    );
    const unknown: WriteDecision = await env.authorize(
      'admin',
      env.write('text_documents', 'text_documents', TEXT_1, edit, {})
    );

    expect([project.kind, audio.kind, profile.kind, unknown.kind]).toEqual([
      'refused',
      'refused',
      'refused',
      'refused'
    ]);
  });

  it('decides an empty op by whether the user may edit the doc at all', async () => {
    const env = new TestEnvironment();
    const empty: GatewayWriteChange = { kind: 'edit', edit: { otType: 'rich-text', ops: [] } };

    const translator: WriteDecision = await env.authorize(
      'translator',
      env.write(TEXTS_COLLECTION, TEXTS_COLLECTION, TEXT_1, empty, { ops: [] }, RICH_TEXT_TYPE_URI)
    );
    const observer: WriteDecision = await env.authorize(
      'ptObserver',
      env.write(TEXTS_COLLECTION, TEXTS_COLLECTION, TEXT_1, empty, { ops: [] }, RICH_TEXT_TYPE_URI)
    );

    expect(translator.kind).toEqual('allowed');
    expect(observer.kind).toEqual('refused');
  });

  it('decides an empty json0 op by the doc itself: the user must be able to read it, and it must be at its id', async () => {
    const env = new TestEnvironment();
    const empty: GatewayWriteChange = { kind: 'edit', edit: { otType: 'json0', components: [] } };
    const threadId = `${PROJECT_ID}:thread01`;
    const thread = (publishedToSF: boolean, projectRef: string = PROJECT_ID): unknown => ({
      projectRef: projectRef,
      ownerRef: USERS.admin,
      publishedToSF: publishedToSF,
      notes: []
    });

    // SUT
    const commenterPublished: WriteDecision = await env.authorize(
      'commenter',
      env.write(NOTE_THREAD_COLLECTION, NOTE_THREAD_COLLECTION, threadId, empty, thread(true))
    );
    const commenterUnpublished: WriteDecision = await env.authorize(
      'commenter',
      env.write(NOTE_THREAD_COLLECTION, NOTE_THREAD_COLLECTION, threadId, empty, thread(false))
    );
    const elsewhere: WriteDecision = await env.authorize(
      'admin',
      env.write(NOTE_THREAD_COLLECTION, NOTE_THREAD_COLLECTION, threadId, empty, thread(true, OTHER_PROJECT_ID))
    );
    const observer: WriteDecision = await env.authorize(
      'ptObserver',
      env.write(NOTE_THREAD_COLLECTION, NOTE_THREAD_COLLECTION, threadId, empty, thread(false))
    );

    expect(commenterPublished.kind).toEqual('allowed');
    expect(commenterUnpublished.kind).toEqual('refused');
    expect(elsewhere.kind).toEqual('refused');
    expect(observer.kind).toEqual('refused');
  });

  it('refuses an edit of a doc that does not exist, and creates of other types than json0', async () => {
    const env = new TestEnvironment();

    const edit: WriteDecision = await env.authorize('admin', {
      ...env.textEdit(TEXT_1),
      snapshot: { version: 0, type: null, data: undefined }
    });
    const create: WriteDecision = await env.authorize(
      'admin',
      env.write(TEXTS_COLLECTION, TEXTS_COLLECTION, TEXT_1, {
        kind: 'create',
        type: RICH_TEXT_TYPE_URI,
        data: { ops: [] }
      })
    );

    expect(edit.kind).toEqual('refused');
    expect(create.kind).toEqual('refused');
  });

  it('refuses when the project cannot be read', async () => {
    const env = new TestEnvironment();
    env.world.data.fail();

    const decision: WriteDecision = await env.authorize('admin', env.textEdit(TEXT_1));

    expect(decision.kind).toEqual('refused');
  });
});

/** A write hook over a TestWorld. */
class TestEnvironment {
  readonly world = new TestWorld();
  readonly hook = new SFWriteHook({
    projects: this.world.projects,
    profiles: this.world.profiles,
    data: this.world.data,
    presenceIds: new PresenceIdBindings()
  });

  authorize(user: TestUserName, write: GatewayWrite): Promise<WriteDecision> {
    return this.hook.authorize(write, sessionFor(user));
  }

  textEdit(textId: string): GatewayWrite {
    return this.write(
      TEXTS_COLLECTION,
      TEXTS_COLLECTION,
      textId,
      { kind: 'edit', edit: { otType: 'rich-text', ops: [{ kind: 'insert-text', text: 'a', attributes: null }] } },
      { ops: [] },
      RICH_TEXT_TYPE_URI
    );
  }

  write(
    collection: string,
    addressedAs: string,
    docId: string,
    change: GatewayWriteChange,
    data: unknown = undefined,
    type: string = JSON0_TYPE_URI
  ): GatewayWrite {
    return {
      collection: collection,
      addressedAs: addressedAs,
      docId: docId,
      change: change,
      snapshot:
        data === undefined ? { version: 0, type: null, data: undefined } : { version: 3, type: type, data: data }
    };
  }
}
