import 'jest-expect-message';
import { Json0Component, Json0Path } from '../../../common/gateway/inbound-messages';
import { JsonObject, JsonValue } from '../../../common/gateway/json';
import { USERS_COLLECTION } from '../../../common/models/user';
import { BIBLICAL_TERM_COLLECTION } from '../../models/biblical-term';
import { NOTE_THREAD_COLLECTION } from '../../models/note-thread';
import { QUESTIONS_COLLECTION } from '../../models/question';
import { SF_PROJECT_USER_CONFIGS_COLLECTION } from '../../models/sf-project-user-config';
import { TRAINING_DATA_COLLECTION } from '../../models/training-data';
import { PROJECT_ID, testProjectData, TestUserName, TestWorld, USERS } from '../test-gateway-world';
import { SF_COLLECTION_POLICIES } from '../sf-collection-policies';
import { CollectionPolicy, PolicyDecision } from '../sf-collection-policy';

const ALL_USERS: readonly TestUserName[] = Object.keys(USERS) as TestUserName[];
const MEMBERS: readonly TestUserName[] = [
  'admin',
  'translator',
  'consultant',
  'ptObserver',
  'checker',
  'commenter',
  'sfObserver'
];
/** Who may read questions: every role with view in all the checking domains. */
const QUESTION_READERS: readonly TestUserName[] = ['admin', 'translator', 'consultant', 'ptObserver', 'checker'];
/** Who may add answers, comments and likes. */
const ANSWERERS: readonly TestUserName[] = ['admin', 'translator', 'consultant', 'checker'];
/** Who may edit note threads (PT or SF) and add notes to PT threads. */
const THREAD_EDITORS: readonly TestUserName[] = ['admin', 'translator', 'consultant'];

const DATE = '2026-10-08T12:00:00.000Z';
const LATER = '2026-10-08T12:30:00.123Z';
const QUESTION_ID = 'c00000000000000000000001';
const ANSWER_1 = 'd00000000000000000000001';
const ANSWER_2 = 'd00000000000000000000002';
const NEW_ID = 'e00000000000000000000001';
const COMMENT_1 = 'f00000000000000000000001';
const THREAD_ID = 'c10000000000000000000001';
const PT_THREAD_ID = 'c10000000000000000000002';
const CHAPTER_2_THREAD_ID = 'c10000000000000000000003';
const PT_THREAD_THREAD_ID = 'abcdef0123456789';
const NOTE_1 = 'f10000000000000000000001';
const NOTE_2 = 'f10000000000000000000002';
const NOTE_3 = 'f10000000000000000000003';
const TERM_ID = 'c20000000000000000000001';
const AUDIO_URL = `/${PROJECT_ID}/${USERS.checker}_${ANSWER_1}.mp3?t=134044416000000000`;

describe('write policies', () => {
  describe('users', () => {
    it('lets users set their display name and current project, and nothing else', async () => {
      const env = new TestEnvironment();
      const user: JsonObject = env.user('translator');

      for (const components of [
        [
          TestEnvironment.set(['displayName'], 'New name', 'Old'),
          TestEnvironment.set(['isDisplayNameConfirmed'], true)
        ],
        [TestEnvironment.set(['sites', 'sf', 'currentProjectId'], PROJECT_ID)],
        [TestEnvironment.unset(['sites', 'sf', 'currentProjectId'], PROJECT_ID)]
      ]) {
        // Each user edits their own doc.
        expect(await env.editors(USERS_COLLECTION, (u: TestUserName) => USERS[u], user, components)).toEqual(ALL_USERS);
      }
      for (const components of [
        [TestEnvironment.set([], { ...user, roles: ['system_admin'] }, user)],
        [TestEnvironment.set(['roles'], ['system_admin'], ['user'])],
        [TestEnvironment.set(['email'], 'x@example.com', 'old@example.com')],
        [TestEnvironment.set(['displayName'], '   ', 'Old')],
        [TestEnvironment.set(['displayName'], 'x'.repeat(1001), 'Old')],
        [TestEnvironment.set(['sites', 'sf', 'currentProjectId'], 'not-a-project')],
        [TestEnvironment.set(['sites', 'sf', 'projects'], [PROJECT_ID], [])],
        [TestEnvironment.set(['sites', 'other', 'currentProjectId'], PROJECT_ID)],
        [TestEnvironment.set(['sites', 'sf'], { projects: [] }, { projects: [] })]
      ]) {
        expect(await env.editors(USERS_COLLECTION, (u: TestUserName) => USERS[u], user, components)).toEqual([]);
      }
    });

    it("refuses edits of another user's doc, even by a system administrator", async () => {
      const env = new TestEnvironment();

      const decision: PolicyDecision = await env.edit(
        USERS_COLLECTION,
        'systemAdmin',
        USERS.translator,
        env.user('translator'),
        [TestEnvironment.set(['displayName'], 'New name', 'Old')]
      );

      expect(decision.allowed).toBe(false);
    });
  });

  describe('sf_project_user_configs', () => {
    it('lets every member make every edit the client makes to their own config', async () => {
      const env = new TestEnvironment();
      const accepted: Json0Component[][] = [
        [TestEnvironment.set(['selectedTask'], 'checking', 'translate')],
        [TestEnvironment.unset(['selectedTask'], 'translate')],
        [TestEnvironment.set(['selectedBookNum'], 40, 41), TestEnvironment.set(['selectedChapterNum'], 3, 1)],
        [TestEnvironment.set(['selectedChapterNum'], null, 1)],
        [
          TestEnvironment.set(['selectedQuestionRef'], `${PROJECT_ID}:${QUESTION_ID}`),
          TestEnvironment.unset(['selectedSegment'], 'verse_1_1'),
          TestEnvironment.unset(['selectedSegmentChecksum'], 12345)
        ],
        [TestEnvironment.unset(['selectedQuestionRef'], `${PROJECT_ID}:${QUESTION_ID}`)],
        [
          TestEnvironment.set(['selectedSegment'], 'verse_1_2', 'verse_1_1'),
          TestEnvironment.set(['selectedSegmentChecksum'], -1234567, 12345)
        ],
        [TestEnvironment.set(['isTargetTextRight'], false, true)],
        [TestEnvironment.unset(['biblicalTermsEnabled'], true)],
        [TestEnvironment.set(['selectedBiblicalTermsCategory'], 'Names of people')],
        [TestEnvironment.set(['selectedBiblicalTermsFilter'], 'current_book')],
        [TestEnvironment.unset(['selectedBiblicalTermsFilter'], 'current_chapter')],
        [TestEnvironment.set(['transliterateBiblicalTerms'], true, false)],
        [TestEnvironment.set(['showEditorTabsInSinglePane'], true)],
        [TestEnvironment.set(['selectedDraftTargetParatextId'], '0123456789abcdef0123456789abcdef01234567')],
        [
          TestEnvironment.set(
            ['editorTabsOpen'],
            [
              { tabType: 'project-resource', groupId: 'source', isSelected: true, projectId: PROJECT_ID },
              { tabType: 'biblical-terms', groupId: 'target' },
              { tabType: 'history', groupId: 'target', projectId: PROJECT_ID }
            ],
            []
          )
        ],
        [TestEnvironment.set(['lynxInsightState', 'assessmentsEnabled'], true)],
        [
          TestEnvironment.set(['lynxInsightState', 'assessmentsEnabled'], false),
          TestEnvironment.set(['lynxInsightState', 'autoCorrectionsEnabled'], false)
        ],
        [TestEnvironment.set(['lynxInsightState', 'panelData'], env.panelData())],
        [
          TestEnvironment.set(['lynxInsightState', 'panelData'], {
            isOpen: true,
            filter: { types: [], scope: 'project', includeDismissed: true },
            sortOrder: 'appearance'
          })
        ],
        // Clients before 2026-08-05 set the whole object.
        [TestEnvironment.set(['lynxInsightState'], { panelData: env.panelData() }, {})],
        // Clients before 2026-09-08 still write the suggestion settings.
        [TestEnvironment.set(['confidenceThreshold'], 0.35, 0.2)],
        [TestEnvironment.set(['numSuggestions'], 2, 1)],
        [TestEnvironment.set(['translationSuggestionsEnabled'], false)],
        // Several reads marked by one builder all insert at the list's length as the client saw it.
        [
          TestEnvironment.insert(['answerRefsRead', 1], ANSWER_1),
          TestEnvironment.insert(['answerRefsRead', 1], ANSWER_2),
          TestEnvironment.insert(['questionRefsRead', 0], QUESTION_ID)
        ],
        [TestEnvironment.insert(['commentRefsRead', 0], COMMENT_1)],
        [TestEnvironment.insert(['noteRefsRead', 0], NOTE_1), TestEnvironment.insert(['noteRefsRead', 0], 'legacy_id')],
        // Ops from several call sites, composed by ShareDB into one.
        [
          TestEnvironment.insert(['noteRefsRead', 0], NOTE_1),
          TestEnvironment.set(['selectedSegment'], 'verse_1_2', 'verse_1_1'),
          TestEnvironment.set(['selectedSegmentChecksum'], 0, 12345)
        ]
      ];

      for (const components of accepted) {
        expect(await env.configEditors(components), JSON.stringify(components)).toEqual(MEMBERS);
      }
    });

    it('refuses other edits of a config', async () => {
      const env = new TestEnvironment();
      const config: JsonObject = env.config('checker');
      const refused: Json0Component[][] = [
        [TestEnvironment.set([], { ...config, isTargetTextRight: false }, config)],
        [TestEnvironment.set(['ownerRef'], USERS.admin, USERS.checker)],
        [TestEnvironment.set(['projectRef'], PROJECT_ID, PROJECT_ID)],
        [TestEnvironment.set(['selectedTask'], 'admin', 'translate')],
        [TestEnvironment.set(['selectedBookNum'], 0, 41)],
        [TestEnvironment.set(['selectedChapterNum'], 1.5, 1)],
        [TestEnvironment.set(['selectedSegment'], '', 'verse_1_1')],
        [TestEnvironment.set(['biblicalTermsEnabled'], true, true)],
        [TestEnvironment.set(['selectedBiblicalTermsFilter'], 'current_verse')],
        [TestEnvironment.set(['confidenceThreshold'], 1.5, 0.2)],
        [TestEnvironment.set(['editorTabsOpen'], [{ tabType: 'project-resource', groupId: 'middle' }], [])],
        [TestEnvironment.set(['editorTabsOpen'], [{ tabType: 'history', groupId: 'target', title: 'x' }], [])],
        [TestEnvironment.set(['lynxInsightState', 'panelData'], { ...env.panelData(), extra: true })],
        [TestEnvironment.set(['lynxInsightState'], { panelData: env.panelData(), other: 1 }, {})],
        [TestEnvironment.set(['lynxInsightState', 'otherSwitch'], true)],
        [TestEnvironment.set(['answerRefsRead'], [ANSWER_1], [ANSWER_1])],
        [TestEnvironment.remove(['answerRefsRead', 0], ANSWER_1)],
        [TestEnvironment.set(['answerRefsRead', 0], ANSWER_2)],
        [TestEnvironment.insert(['answerRefsRead', 5], ANSWER_2)],
        [TestEnvironment.insert(['answerRefsRead', 0], 'not an id!')],
        [TestEnvironment.insert(['answerRefsRead', 0], { id: ANSWER_1 })],
        [TestEnvironment.set(['somethingNew'], true)]
      ];

      for (const components of refused) {
        const decision: PolicyDecision = await env.edit(
          SF_PROJECT_USER_CONFIGS_COLLECTION,
          'checker',
          `${PROJECT_ID}:${USERS.checker}`,
          config,
          components
        );
        expect(decision.allowed, JSON.stringify(components)).toBe(false);
      }
    });
  });

  describe('questions', () => {
    it('lets only those with the questions edit right change and archive questions', async () => {
      const env = new TestEnvironment();
      const question: JsonObject = env.question();
      const archived: JsonObject = { ...question, isArchived: true, dateArchived: DATE };

      expect(
        await env.questionEditors(question, [
          TestEnvironment.set(
            ['verseRef'],
            { bookNum: 40, chapterNum: 1, verseNum: 3, verse: '3-4' },
            question.verseRef
          ),
          TestEnvironment.set(['text'], '', 'What?'),
          TestEnvironment.set(['audioUrl'], `blob:https://scriptureforge.org/4b1c-11`),
          TestEnvironment.set(['dateModified'], LATER, DATE)
        ])
      ).toEqual(['admin']);
      expect(
        await env.questionEditors(question, [
          TestEnvironment.set(['isArchived'], true, false),
          TestEnvironment.set(['dateArchived'], LATER)
        ])
      ).toEqual(['admin']);
      expect(
        await env.questionEditors(archived, [
          TestEnvironment.set(['isArchived'], false, true),
          TestEnvironment.unset(['dateArchived'], DATE)
        ])
      ).toEqual(['admin']);
      expect(await env.questionEditors(question, [TestEnvironment.unset(['text'], 'What?')])).toEqual(['admin']);
    });

    it('lets those who may answer add answers, comments and likes of their own', async () => {
      const env = new TestEnvironment();
      const question: JsonObject = env.question();

      expect(
        await env.questionEditorsBy(question, (user: TestUserName) => [
          TestEnvironment.insert(
            ['answers', 0],
            env.answer(user, NEW_ID, { text: 'An answer', verseRef: env.verseRef() })
          )
        ])
      ).toEqual(ANSWERERS);
      expect(
        await env.questionEditorsBy(question, (user: TestUserName) => [
          TestEnvironment.insert(['answers', 1, 'comments', 0], env.comment(user, NEW_ID))
        ])
      ).toEqual(ANSWERERS);
      expect(
        await env.questionEditorsBy(question, (user: TestUserName) => [
          TestEnvironment.insert(['answers', 1, 'likes', 0], { ownerRef: USERS[user] })
        ])
      ).toEqual(ANSWERERS);
      // An answer inserted further down the list, as can happen after ShareDB transforms the op.
      expect(
        await env.questionEditorsBy(question, (user: TestUserName) => [
          TestEnvironment.insert(['answers', 2], env.answer(user, NEW_ID))
        ])
      ).toEqual(ANSWERERS);
    });

    it('lets answer owners edit their answers, and owners and administrators delete them', async () => {
      const env = new TestEnvironment();
      const question: JsonObject = env.question();

      // saveAnswer sets every field; only the changed ones reach the wire.
      expect(
        await env.questionEditors(question, [
          TestEnvironment.set(['answers', 0, 'text'], 'Edited', 'An answer'),
          TestEnvironment.set(['answers', 0, 'scriptureText'], 'In the beginning'),
          TestEnvironment.set(['answers', 0, 'verseRef'], env.verseRef()),
          TestEnvironment.set(['answers', 0, 'selectionStartClipped'], true),
          TestEnvironment.set(['answers', 0, 'selectionEndClipped'], false),
          TestEnvironment.set(['answers', 0, 'audioUrl'], AUDIO_URL),
          TestEnvironment.set(['answers', 0, 'dateModified'], LATER, DATE)
        ])
      ).toEqual(['checker']);
      expect(
        await env.questionEditors(env.question({ answer1: { verseRef: env.verseRef(), audioUrl: AUDIO_URL } }), [
          TestEnvironment.unset(['answers', 0, 'verseRef'], env.verseRef()),
          TestEnvironment.unset(['answers', 0, 'audioUrl'], AUDIO_URL)
        ])
      ).toEqual(['checker']);
      expect(
        await env.questionEditors(question, [TestEnvironment.set(['answers', 0, 'deleted'], true, false)])
      ).toEqual(['admin', 'checker']);
    });

    it('lets only those with the answer status right set an answer status', async () => {
      const env = new TestEnvironment();
      const question: JsonObject = env.question();

      for (const status of ['resolved', 'export']) {
        expect(
          await env.questionEditors(question, [TestEnvironment.set(['answers', 0, 'status'], status, '')])
        ).toEqual(['admin']);
      }
      expect(
        await env.questionEditors(env.question({ answer1: { status: 'resolved' } }), [
          TestEnvironment.set(['answers', 0, 'status'], '', 'resolved')
        ])
      ).toEqual(['admin']);
      expect(await env.questionEditors(question, [TestEnvironment.set(['answers', 0, 'status'], 'bogus', '')])).toEqual(
        []
      );
    });

    it('allows a set of an answer field that leaves it as it is, without the right to change it', async () => {
      const env = new TestEnvironment();
      const question: JsonObject = env.question();

      // An administrator's status change from a stale copy also names the owner's unchanged text.
      expect(
        await env.questionEditors(question, [
          TestEnvironment.set(['answers', 0, 'text'], 'An answer', 'Older'),
          TestEnvironment.unset(['answers', 0, 'scriptureText'], 'Older'),
          TestEnvironment.set(['answers', 0, 'status'], 'resolved', '')
        ])
      ).toEqual(['admin']);
      expect(
        await env.questionEditors(question, [TestEnvironment.set(['answers', 0, 'text'], 'An answer', 'Older')])
      ).toEqual(QUESTION_READERS);
      // An owner's edit that changes the status back is refused, as the owner may not change the status.
      expect(
        await env.questionEditors(env.question({ answer1: { status: 'resolved' } }), [
          TestEnvironment.set(['answers', 0, 'text'], 'Edited', 'An answer'),
          TestEnvironment.set(['answers', 0, 'status'], '', 'resolved')
        ])
      ).toEqual([]);
    });

    it('lets comment owners edit their comments, and owners and administrators delete them', async () => {
      const env = new TestEnvironment();
      const question: JsonObject = env.question();

      expect(
        await env.questionEditors(question, [
          TestEnvironment.set(['answers', 0, 'comments', 0, 'text'], 'Edited', 'A comment'),
          TestEnvironment.set(['answers', 0, 'comments', 0, 'audioUrl'], 'blob:https://scriptureforge.org/1'),
          TestEnvironment.set(['answers', 0, 'comments', 0, 'dateModified'], LATER, DATE)
        ])
      ).toEqual(['checker']);
      expect(
        await env.questionEditors(question, [
          TestEnvironment.set(['answers', 0, 'comments', 0, 'deleted'], true, false)
        ])
      ).toEqual(['admin', 'checker']);
    });

    it('lets users remove only their own likes, as the doc has them', async () => {
      const env = new TestEnvironment();
      const question: JsonObject = env.question();
      const translatorsLike: JsonValue = { ownerRef: USERS.translator };

      expect(
        await env.questionEditors(question, [TestEnvironment.remove(['answers', 0, 'likes', 0], translatorsLike)])
      ).toEqual(['translator']);
      // The op's ld claims the checker's own like, but the like at that index is the translator's.
      const decision: PolicyDecision = await env.edit(QUESTIONS_COLLECTION, 'checker', env.questionDocId(), question, [
        TestEnvironment.remove(['answers', 0, 'likes', 0], { ownerRef: USERS.checker })
      ]);
      expect(decision.allowed).toBe(false);
      expect(
        await env.questionEditors(question, [TestEnvironment.remove(['answers', 0, 'likes', 3], translatorsLike)])
      ).toEqual([]);
      // ShareDB can turn a removal and an insert at one index into a replacement.
      expect(
        await env.questionEditors(question, [
          TestEnvironment.replace(['answers', 0, 'likes', 0], translatorsLike, translatorsLike)
        ])
      ).toEqual(['translator']);
      expect(
        await env.questionEditorsBy(question, (user: TestUserName) => [
          TestEnvironment.replace(['answers', 0, 'likes', 0], { ownerRef: USERS[user] }, translatorsLike)
        ])
      ).toEqual(['translator']);
    });

    it('refuses a like from a user who already likes the answer, and a data id already in the list', async () => {
      const env = new TestEnvironment();
      const question: JsonObject = env.question();
      const like = (user: TestUserName): JsonValue => ({ ownerRef: USERS[user] });

      // The translator already likes answer 0.
      expect(
        await env.questionEditorsBy(question, (user: TestUserName) => [
          TestEnvironment.insert(['answers', 0, 'likes', 1], like(user))
        ])
      ).toEqual(ANSWERERS.filter((user: TestUserName) => user !== 'translator'));
      // Two likes from the same user in one op, and a like removed and given again, which leaves one.
      expect(
        await env.questionEditorsBy(question, (user: TestUserName) => [
          TestEnvironment.insert(['answers', 1, 'likes', 0], like(user)),
          TestEnvironment.insert(['answers', 1, 'likes', 1], like(user))
        ])
      ).toEqual([]);
      expect(
        await env.questionEditors(question, [
          TestEnvironment.remove(['answers', 0, 'likes', 0], like('translator')),
          TestEnvironment.insert(['answers', 0, 'likes', 0], like('translator'))
        ])
      ).toEqual(['translator']);
      // An answer or comment whose data id is already in its list, also when an earlier component put it there.
      expect(
        await env.questionEditorsBy(question, (user: TestUserName) => [
          TestEnvironment.insert(['answers', 0], env.answer(user, ANSWER_2))
        ])
      ).toEqual([]);
      expect(
        await env.questionEditorsBy(question, (user: TestUserName) => [
          TestEnvironment.insert(['answers', 0], env.answer(user, NEW_ID)),
          TestEnvironment.insert(['answers', 0], env.answer(user, NEW_ID))
        ])
      ).toEqual([]);
      expect(
        await env.questionEditorsBy(question, (user: TestUserName) => [
          TestEnvironment.insert(['answers', 0, 'comments', 1], env.comment(user, COMMENT_1))
        ])
      ).toEqual([]);
    });

    it('checks each component against the doc as the components before it left it', async () => {
      const env = new TestEnvironment();
      const question: JsonObject = env.question();
      const newAnswer: JsonValue = env.answer('checker', NEW_ID);

      // An answer inserted, then edited and liked by another call site, in one composed op.
      expect(
        await env.questionEditors(question, [
          TestEnvironment.insert(['answers', 0], newAnswer),
          TestEnvironment.set(['answers', 0, 'text'], 'Typed later'),
          TestEnvironment.insert(['answers', 2, 'likes', 0], { ownerRef: USERS.checker })
        ])
      ).toEqual(['checker']);
      // After the insert, the checker's original answer is at index 1, and the translator's at index 2.
      expect(
        await env.questionEditors(question, [
          TestEnvironment.insert(['answers', 0], newAnswer),
          TestEnvironment.set(['answers', 1, 'text'], 'Edited', 'An answer')
        ])
      ).toEqual(['checker']);
      expect(
        await env.questionEditors(question, [
          TestEnvironment.insert(['answers', 0], newAnswer),
          TestEnvironment.set(['answers', 2, 'text'], 'Edited', 'Another answer')
        ])
      ).toEqual([]);
      // An op transformed past a concurrent answer insert: the checker's answer is now at index 1.
      const shifted: JsonObject = env.question({ extraAnswerFirst: true });
      expect(
        await env.questionEditors(shifted, [TestEnvironment.set(['answers', 1, 'text'], 'Edited', 'An answer')])
      ).toEqual(['checker']);
      expect(
        await env.questionEditors(shifted, [TestEnvironment.set(['answers', 0, 'text'], 'Edited', 'An answer')])
      ).toEqual(['translator']);
    });

    it('refuses edits clients never make', async () => {
      const env = new TestEnvironment();
      const question: JsonObject = env.question();
      const answers: JsonValue = question.answers;
      const answer: JsonObject = env.answer('admin', NEW_ID);
      const refused: Json0Component[][] = [
        [TestEnvironment.set([], { ...question, text: 'x' }, question)],
        [TestEnvironment.set(['ownerRef'], USERS.admin, USERS.admin)],
        [TestEnvironment.set(['projectRef'], PROJECT_ID, PROJECT_ID)],
        [TestEnvironment.set(['dataId'], NEW_ID, QUESTION_ID)],
        [TestEnvironment.set(['dateCreated'], LATER, DATE)],
        [TestEnvironment.set(['transceleratorQuestionId'], '1')],
        [TestEnvironment.set(['answers'], [], answers)],
        [TestEnvironment.remove(['answers', 1], env.answer('translator', ANSWER_2))],
        [TestEnvironment.replace(['answers', 0], answer, env.answer('checker', ANSWER_1))],
        [TestEnvironment.set(['answers', 0, 'ownerRef'], USERS.admin, USERS.checker)],
        [TestEnvironment.set(['answers', 0, 'syncUserRef'], 'pt01')],
        [TestEnvironment.set(['answers', 0, 'likes'], [], [{ ownerRef: USERS.translator }])],
        [TestEnvironment.set(['answers', 0, 'comments'], [])],
        [TestEnvironment.set(['answers', 0, 'deleted'], false, false)],
        [TestEnvironment.set(['answers', 0, 'comments', 0, 'ownerRef'], USERS.admin, USERS.checker)],
        [TestEnvironment.remove(['answers', 0, 'comments', 0], env.comment('checker', COMMENT_1))],
        [TestEnvironment.insert(['answers', 0], env.answer('checker', NEW_ID))],
        [TestEnvironment.insert(['answers', 0], { ...answer, syncUserRef: 'pt01' })],
        [TestEnvironment.insert(['answers', 0], { ...answer, extra: 1 })],
        [TestEnvironment.insert(['answers', 0], { ...answer, status: 'resolved' })],
        [TestEnvironment.insert(['answers', 0], { ...answer, deleted: true })],
        [TestEnvironment.insert(['answers', 0], { ...answer, likes: [{ ownerRef: USERS.admin }] })],
        [TestEnvironment.insert(['answers', 0], { ...answer, dataId: 'answer01' })],
        [TestEnvironment.insert(['answers', 0], { ...answer, text: 'x'.repeat(100_001) })],
        [TestEnvironment.insert(['answers', 0], { ...answer, audioUrl: 'https://example.com/a.mp3' })],
        [TestEnvironment.insert(['answers', 0], { ...answer, audioUrl: '//example.com/a.mp3' })],
        [TestEnvironment.insert(['answers', 0], { ...answer, dateCreated: 'yesterday' })],
        [TestEnvironment.insert(['answers', 3], answer)],
        [TestEnvironment.insert(['answers', 0, 'comments', 0], { ...env.comment('admin', NEW_ID), deleted: true })],
        [TestEnvironment.insert(['answers', 0, 'comments', 0], env.comment('checker', NEW_ID))],
        [TestEnvironment.insert(['answers', 0, 'likes', 0], { ownerRef: USERS.admin, extra: 1 })],
        [TestEnvironment.insert(['answers', 0, 'likes', 0], { ownerRef: USERS.translator })],
        [TestEnvironment.set(['answers', 0, 'likes', 0, 'ownerRef'], USERS.admin, USERS.translator)],
        [TestEnvironment.set(['verseRef'], { bookNum: 40, chapterNum: 1, verseNum: 1, extra: 1 }, question.verseRef)],
        [TestEnvironment.set(['verseRef', 'verseNum'], 2, 1)],
        [TestEnvironment.set(['isArchived'], 'yes', false)]
      ];

      for (const components of refused) {
        const decision: PolicyDecision = await env.edit(
          QUESTIONS_COLLECTION,
          'admin',
          env.questionDocId(),
          question,
          components
        );
        expect(decision.allowed, JSON.stringify(components)).toBe(false);
      }
    });

    it('lets only those with the questions create right create questions as the client makes them', async () => {
      const env = new TestEnvironment();

      expect(await env.questionCreators((user: TestUserName) => env.newQuestion(user))).toEqual(['admin']);
      expect(
        await env.questionCreators((user: TestUserName) => ({
          ...env.newQuestion(user),
          audioUrl: `/${PROJECT_ID}/${USERS[user]}_${NEW_ID}.mp3?t=1`
        }))
      ).toEqual(['admin']);
      for (const importId of [
        { transceleratorQuestionId: '1-2' },
        { paratextNoteId: PT_THREAD_THREAD_ID }
      ] as JsonObject[]) {
        const imported: JsonObject = { ...env.newQuestion('admin'), ...importId };
        delete (imported as Record<string, JsonValue>).audioUrl;
        expect(await env.questionCreators((user: TestUserName) => ({ ...imported, ownerRef: USERS[user] }))).toEqual([
          'admin'
        ]);
      }
    });

    it('accepts edits folded into a question create, as the user could have made them', async () => {
      const env = new TestEnvironment();
      const answer: JsonObject = {
        ...env.answer('admin', ANSWER_1, { text: 'Answered offline' }),
        deleted: true,
        status: 'resolved',
        likes: [{ ownerRef: USERS.admin }],
        comments: [{ ...env.comment('admin', COMMENT_1), deleted: true }]
      };

      expect(
        await env.questionCreators((user: TestUserName) => ({
          ...env.newQuestion(user),
          isArchived: true,
          dateArchived: LATER,
          answers: [answer, env.answer('admin', ANSWER_2)]
        }))
      ).toEqual(['admin']);

      // A translator who has the questions create right, but not the edit or answer status rights.
      const granted = new TestEnvironment({
        projectData: testProjectData({ userPermissions: { [USERS.translator]: ['questions.create'] } })
      });
      const translatorsAnswer: JsonObject = env.answer('translator', ANSWER_1);
      expect(
        await granted.createAs(QUESTIONS_COLLECTION, 'translator', env.questionDocId(NEW_ID), {
          ...env.newQuestion('translator'),
          answers: [translatorsAnswer]
        })
      ).toEqual({ allowed: true });
      for (const folded of [
        { isArchived: true, dateArchived: LATER },
        { answers: [{ ...translatorsAnswer, status: 'resolved' }] }
      ] as JsonObject[]) {
        const decision: PolicyDecision = await granted.createAs(
          QUESTIONS_COLLECTION,
          'translator',
          env.questionDocId(NEW_ID),
          { ...env.newQuestion('translator'), ...folded }
        );
        expect(decision.allowed, JSON.stringify(folded)).toBe(false);
      }
    });

    it('refuses question creates clients never make', async () => {
      const env = new TestEnvironment();
      const question: JsonObject = env.newQuestion('admin');
      const refused: JsonObject[] = [
        { ...question, ownerRef: USERS.translator },
        { ...question, dataId: QUESTION_ID },
        { ...question, extra: true },
        { ...question, dateArchived: DATE },
        { ...question, transceleratorQuestionId: '1', paratextNoteId: '2' },
        { ...question, answers: [env.answer('checker', ANSWER_1)] },
        { ...question, answers: [{ ...env.answer('admin', ANSWER_1), syncUserRef: 'pt01' }] },
        { ...question, answers: [{ ...env.answer('admin', ANSWER_1), likes: [{ ownerRef: USERS.checker }] }] },
        { ...question, answers: [{ ...env.answer('admin', ANSWER_1), comments: [env.comment('checker', COMMENT_1)] }] },
        { ...question, verseRef: { bookNum: 40, chapterNum: 1 } },
        { ...question, text: 'x'.repeat(100_001) },
        { ...question, answers: [env.answer('admin', ANSWER_1), env.answer('admin', ANSWER_1)] },
        {
          ...question,
          answers: [{ ...env.answer('admin', ANSWER_1), likes: [{ ownerRef: USERS.admin }, { ownerRef: USERS.admin }] }]
        },
        {
          ...question,
          answers: [
            {
              ...env.answer('admin', ANSWER_1),
              comments: [env.comment('admin', COMMENT_1), env.comment('admin', COMMENT_1)]
            }
          ]
        }
      ];

      for (const data of refused) {
        const decision: PolicyDecision = await env.createAs(
          QUESTIONS_COLLECTION,
          'admin',
          env.questionDocId(NEW_ID),
          data
        );
        expect(decision.allowed, JSON.stringify(data).slice(0, 300)).toBe(false);
      }
      const nonHex: PolicyDecision = await env.createAs(
        QUESTIONS_COLLECTION,
        'admin',
        env.questionDocId('question02'),
        {
          ...question,
          dataId: 'question02'
        }
      );
      expect(nonHex.allowed).toBe(false);
    });
  });

  describe('note_threads', () => {
    it('lets thread editors set any status, and those who may add notes reopen or resolve', async () => {
      const env = new TestEnvironment();

      expect(await env.threadEditors(env.thread(), [TestEnvironment.set(['status'], 'done', 'todo')])).toEqual(
        THREAD_EDITORS
      );
      for (const status of ['todo', 'deleted']) {
        expect(await env.threadEditors(env.thread(), [TestEnvironment.set(['status'], status, 'todo')])).toEqual([
          ...THREAD_EDITORS,
          'commenter'
        ]);
        expect(await env.threadEditors(env.ptThread(), [TestEnvironment.set(['status'], status, 'todo')])).toEqual(
          THREAD_EDITORS
        );
      }
      expect(await env.threadEditors(env.thread(), [TestEnvironment.set(['status'], 'open', 'todo')])).toEqual([]);
    });

    it('lets thread editors move a thread, and those who may edit its chapter', async () => {
      const env = new TestEnvironment();
      const position: JsonValue = { start: 3, length: 7 };

      for (const thread of [env.thread(), env.ptThread()]) {
        expect(await env.threadEditors(thread, [TestEnvironment.set(['position'], position, thread.position)])).toEqual(
          THREAD_EDITORS
        );
        expect(await env.threadEditors(thread, [TestEnvironment.unset(['position'], thread.position)])).toEqual(
          THREAD_EDITORS
        );
      }
      expect(
        await env.threadEditors(env.thread(), [TestEnvironment.set(['position'], { start: -1, length: 0 })])
      ).toEqual([]);

      // A commenter given the texts edit right and write permission on chapter 1 edits that chapter's text.
      const projectData: Record<string, unknown> = testProjectData({
        userPermissions: { [USERS.commenter]: ['texts.edit'] }
      });
      const texts = projectData.texts as {
        permissions: Record<string, string>;
        chapters: { permissions: Record<string, string> }[];
      }[];
      texts[0].permissions[USERS.commenter] = 'write';
      texts[0].chapters[1].permissions[USERS.commenter] = 'read';
      const writer = new TestEnvironment({ projectData: projectData });
      const chapter2: JsonObject = env.thread({ dataId: CHAPTER_2_THREAD_ID, chapterNum: 2 });
      expect(await writer.threadEditors(env.thread(), [TestEnvironment.set(['position'], position)])).toEqual([
        ...THREAD_EDITORS,
        'commenter'
      ]);
      // In chapter 2 the commenter may only read.
      const decision: PolicyDecision = await writer.edit(
        NOTE_THREAD_COLLECTION,
        'commenter',
        env.threadDocId(CHAPTER_2_THREAD_ID),
        chapter2,
        [TestEnvironment.set(['position'], position)]
      );
      expect(decision.allowed).toBe(false);
    });

    it('lets those who may add notes add their own notes to threads they can read', async () => {
      const env = new TestEnvironment();

      expect(
        await env.threadEditorsBy(env.thread(), (user: TestUserName) => [
          TestEnvironment.insert(['notes', 3], env.note(user, NEW_ID, { content: 'A reply' })),
          TestEnvironment.set(['status'], 'todo', 'deleted')
        ])
      ).toEqual([...THREAD_EDITORS, 'commenter']);
      // Resolving with no text adds a resolving note without content.
      expect(
        await env.threadEditorsBy(env.thread(), (user: TestUserName) => [
          TestEnvironment.insert(['notes', 3], env.note(user, NEW_ID, { status: 'deleted' })),
          TestEnvironment.set(['status'], 'deleted', 'todo')
        ])
      ).toEqual([...THREAD_EDITORS, 'commenter']);
      // Biblical Terms replies carry the Biblical Terms tag.
      expect(
        await env.threadEditorsBy(env.ptThread(), (user: TestUserName) => [
          TestEnvironment.insert(['notes', 1], env.note(user, NEW_ID, { threadId: PT_THREAD_THREAD_ID, tagId: -3 }))
        ])
      ).toEqual(THREAD_EDITORS);
    });

    it('lets users edit and delete only their own notes made in Scripture Forge', async () => {
      const env = new TestEnvironment();
      const thread: JsonObject = env.thread();

      expect(
        await env.threadEditors(thread, [
          TestEnvironment.set(['notes', 0, 'content'], 'Edited', 'A note'),
          TestEnvironment.set(['notes', 0, 'dateModified'], LATER, DATE),
          TestEnvironment.set(['notes', 0, 'status'], 'deleted', 'todo'),
          TestEnvironment.set(['status'], 'deleted', 'todo')
        ])
      ).toEqual(['translator']);
      expect(
        await env.threadEditors(thread, [
          TestEnvironment.unset(['notes', 2, 'content'], 'A comment'),
          TestEnvironment.set(['notes', 2, 'status'], 'deleted', 'todo'),
          TestEnvironment.set(['status'], 'deleted', 'todo')
        ])
      ).toEqual(['commenter']);
      expect(await env.threadEditors(thread, [TestEnvironment.set(['notes', 0, 'deleted'], true, false)])).toEqual([
        'admin',
        'translator'
      ]);
      expect(await env.threadEditors(thread, [TestEnvironment.set(['notes', 2, 'deleted'], true, false)])).toEqual([
        'admin',
        'commenter'
      ]);
      // Note 1 came from Paratext.
      expect(await env.threadEditors(thread, [TestEnvironment.set(['notes', 1, 'deleted'], true, false)])).toEqual([]);
      expect(
        await env.threadEditors(thread, [TestEnvironment.set(['notes', 1, 'content'], 'Edited', 'From Paratext')])
      ).toEqual([]);
    });

    it('checks each component against the doc as the components before it left it', async () => {
      const env = new TestEnvironment();

      // A reply, then edited while still pending, in one composed op.
      expect(
        await env.threadEditorsBy(env.thread(), (user: TestUserName) => [
          TestEnvironment.insert(['notes', 3], env.note(user, NEW_ID, { content: 'A reply' })),
          TestEnvironment.set(['status'], 'todo', 'todo'),
          TestEnvironment.set(['notes', 3, 'content'], 'A better reply', 'A reply'),
          TestEnvironment.set(['notes', 3, 'dateModified'], LATER, DATE)
        ])
      ).toEqual([...THREAD_EDITORS, 'commenter']);
      // A reply transformed past a concurrent reply lands one further down the list.
      expect(
        await env.threadEditorsBy(env.thread(), (user: TestUserName) => [
          TestEnvironment.insert(['notes', 2], env.note(user, NEW_ID))
        ])
      ).toEqual([...THREAD_EDITORS, 'commenter']);
    });

    it('refuses edits clients never make', async () => {
      const env = new TestEnvironment();
      const thread: JsonObject = env.thread();
      const note: JsonObject = env.note('admin', NEW_ID);
      const refused: Json0Component[][] = [
        [TestEnvironment.set([], { ...thread, status: 'done' }, thread)],
        [TestEnvironment.set(['publishedToSF'], false, true)],
        [TestEnvironment.unset(['publishedToSF'], true)],
        [TestEnvironment.set(['ownerRef'], USERS.admin, USERS.translator)],
        [TestEnvironment.set(['threadId'], NEW_ID, THREAD_ID)],
        [TestEnvironment.set(['verseRef'], { bookNum: 40, chapterNum: 2, verseNum: 1 }, thread.verseRef)],
        [TestEnvironment.set(['originalSelectedText'], 'x', 'In the beginning')],
        [TestEnvironment.set(['assignment'], 'Team')],
        [TestEnvironment.set(['notes'], [], thread.notes)],
        [TestEnvironment.remove(['notes', 0], env.note('translator', NOTE_1))],
        [TestEnvironment.replace(['notes', 0], note, env.note('translator', NOTE_1))],
        [TestEnvironment.insert(['notes', 3], env.note('translator', NEW_ID))],
        [TestEnvironment.insert(['notes', 3], { ...note, editable: false })],
        [TestEnvironment.insert(['notes', 3], { ...note, versionNumber: 2 })],
        [TestEnvironment.insert(['notes', 3], { ...note, deleted: true })],
        [TestEnvironment.insert(['notes', 3], { ...note, syncUserRef: 'pt01' })],
        [TestEnvironment.insert(['notes', 3], { ...note, assignment: 'Team' })],
        [TestEnvironment.insert(['notes', 3], { ...note, threadId: PT_THREAD_THREAD_ID })],
        [TestEnvironment.insert(['notes', 3], { ...note, type: 'conflict' })],
        [TestEnvironment.insert(['notes', 3], { ...note, status: 'done' })],
        [TestEnvironment.insert(['notes', 5], note)],
        [TestEnvironment.set(['notes', 0, 'ownerRef'], USERS.admin, USERS.translator)],
        [TestEnvironment.set(['notes', 0, 'editable'], true, true)],
        [TestEnvironment.set(['notes', 1, 'editable'], true, false)],
        [TestEnvironment.set(['position'], { start: 0, length: 0, extra: 1 }, thread.position)],
        [TestEnvironment.set(['status'], 'bogus', 'todo')]
      ];

      for (const components of refused) {
        const decision: PolicyDecision = await env.edit(
          NOTE_THREAD_COLLECTION,
          'admin',
          env.threadDocId(THREAD_ID),
          thread,
          components
        );
        expect(decision.allowed, JSON.stringify(components)).toBe(false);
      }
    });

    it('lets those who may create threads and notes create threads as the client makes them', async () => {
      const env = new TestEnvironment();

      expect(await env.threadCreators((user: TestUserName) => env.newThread(user))).toEqual([
        ...THREAD_EDITORS,
        'commenter'
      ]);
      expect(await env.threadCreators((user: TestUserName) => env.newBiblicalTermThread(user))).toEqual([
        ...THREAD_EDITORS,
        'commenter'
      ]);
      // The editor leaves out the selected text when it has no segment.
      expect(
        await env.threadCreators((user: TestUserName) => {
          const thread: Record<string, JsonValue> = { ...env.newThread(user) };
          delete thread.originalSelectedText;
          return thread;
        })
      ).toEqual([...THREAD_EDITORS, 'commenter']);
      // Edits made while the create was pending: a resolved first note, a reply, a deleted note, a moved anchor.
      expect(
        await env.threadCreators((user: TestUserName) => ({
          ...env.newThread(user),
          status: 'deleted',
          position: { start: 4, length: 2 },
          notes: [
            env.note(user, NOTE_1, { threadId: NEW_ID, status: 'deleted', content: 'Edited' }),
            { ...env.note(user, NOTE_2, { threadId: NEW_ID }), deleted: true }
          ]
        }))
      ).toEqual([...THREAD_EDITORS, 'commenter']);
    });

    it('refuses thread creates clients never make', async () => {
      const env = new TestEnvironment();
      const thread: JsonObject = env.newThread('commenter');
      const note: JsonObject = env.note('commenter', NOTE_1, { threadId: NEW_ID });
      const btThread: JsonObject = env.newBiblicalTermThread('commenter');
      const refused: JsonObject[] = [
        { ...thread, publishedToSF: false },
        { ...thread, ownerRef: USERS.admin },
        { ...thread, dataId: THREAD_ID },
        { ...thread, threadId: 'BT_term' },
        { ...thread, threadId: PT_THREAD_THREAD_ID },
        { ...thread, status: 'done' },
        { ...thread, assignment: 'Team' },
        { ...thread, notes: [] },
        { ...thread, notes: [env.note('admin', NOTE_1, { threadId: NEW_ID })] },
        { ...thread, notes: [{ ...note, threadId: THREAD_ID }] },
        { ...thread, notes: [{ ...note, editable: false }] },
        { ...thread, notes: [{ ...note, syncUserRef: 'pt01' }] },
        { ...thread, notes: [{ ...note, reattached: 'x' }] },
        { ...thread, notes: [note, note] },
        { ...thread, extraHeadingInfo: btThread.extraHeadingInfo },
        { ...btThread, threadId: NEW_ID },
        { ...btThread, extraHeadingInfo: { gloss: 'word', language: 'greek', lemma: TERM_ID } }
      ];
      const withoutPublished: Record<string, JsonValue> = { ...thread };
      delete withoutPublished.publishedToSF;
      refused.push(withoutPublished);

      for (const data of refused) {
        const decision: PolicyDecision = await env.createAs(
          NOTE_THREAD_COLLECTION,
          'commenter',
          env.threadDocId(NEW_ID),
          data
        );
        expect(decision.allowed, JSON.stringify(data).slice(0, 300)).toBe(false);
      }
    });
  });

  describe('biblical_terms', () => {
    it('lets those with the biblical terms edit right set descriptions and renderings', async () => {
      const env = new TestEnvironment();
      const term: JsonObject = env.term();

      expect(await env.termEditors(term, [TestEnvironment.set(['description'], 'New', 'Old')])).toEqual([
        'admin',
        'translator'
      ]);
      expect(
        await env.termEditors(term, [
          TestEnvironment.set(['renderings'], ['word', 'other word'], ['word']),
          TestEnvironment.set(['description'], '', 'Old')
        ])
      ).toEqual(['admin', 'translator']);
      expect(await env.termEditors(term, [TestEnvironment.set(['renderings'], [], ['word'])])).toEqual([
        'admin',
        'translator'
      ]);
      for (const components of [
        [TestEnvironment.set(['renderings'], [''], ['word'])],
        [TestEnvironment.insert(['renderings', 1], 'word')],
        [TestEnvironment.set(['renderings', 0], 'word', 'word')],
        [TestEnvironment.set(['termId'], 'other', 'λόγος')],
        [TestEnvironment.set([], { ...term, description: 'x' }, term)]
      ]) {
        expect(await env.termEditors(term, components), JSON.stringify(components)).toEqual([]);
      }
    });
  });

  describe('training_data', () => {
    it('lets those with the training data create right create training data as the client makes it', async () => {
      const env = new TestEnvironment();

      expect(await env.trainingDataCreators((user: TestUserName) => env.trainingData(user))).toEqual([
        'admin',
        'translator'
      ]);
      expect(
        await env.trainingDataCreators((user: TestUserName) => ({ ...env.trainingData(user), skipRows: 1 }))
      ).toEqual(['admin', 'translator']);
    });

    it('refuses training data creates clients never make', async () => {
      const env = new TestEnvironment();
      const data: JsonObject = env.trainingData('translator');
      const fileUrl = (projectId: string, userId: string, dataId: string): string =>
        `/${projectId}/${userId}_${dataId}.csv?t=134044416000000000`;
      const refused: JsonObject[] = [
        { ...data, ownerRef: USERS.admin },
        { ...data, dataId: QUESTION_ID },
        { ...data, extra: 1 },
        { ...data, deleted: true },
        { ...data, mimeType: 'text/html' },
        { ...data, skipRows: 2 },
        { ...data, fileUrl: fileUrl('bbbbbbbbbbbbbbbbbbbbbbbb', USERS.translator, NEW_ID) },
        { ...data, fileUrl: fileUrl(PROJECT_ID, USERS.admin, NEW_ID) },
        { ...data, fileUrl: fileUrl(PROJECT_ID, USERS.translator, QUESTION_ID) },
        { ...data, fileUrl: 'https://example.com/data.csv' }
      ];

      for (const created of refused) {
        const decision: PolicyDecision = await env.createAs(
          TRAINING_DATA_COLLECTION,
          'translator',
          `${PROJECT_ID}:${NEW_ID}`,
          created
        );
        expect(decision.allowed, JSON.stringify(created)).toBe(false);
      }
    });
  });
});

/** Options for the answer of a test question. */
interface AnswerOverrides {
  readonly text?: string;
  readonly verseRef?: JsonValue;
  readonly audioUrl?: string;
  readonly status?: string;
}

/**
 * A test world with the project's docs, and helpers that ask the collections' policies which users may make an edit or
 * a create.
 */
class TestEnvironment {
  readonly world: TestWorld;

  constructor({ projectData = testProjectData() }: { projectData?: Record<string, unknown> } = {}) {
    this.world = new TestWorld(projectData);
  }

  static set(path: Json0Path, inserted: JsonValue, deleted?: JsonValue): Json0Component {
    return deleted === undefined
      ? { kind: 'object-insert', path: path, inserted: inserted }
      : { kind: 'object-replace', path: path, inserted: inserted, deleted: deleted };
  }

  static unset(path: Json0Path, deleted: JsonValue): Json0Component {
    return { kind: 'object-delete', path: path, deleted: deleted };
  }

  static insert(path: Json0Path, inserted: JsonValue): Json0Component {
    return { kind: 'list-insert', path: path, inserted: inserted };
  }

  static remove(path: Json0Path, deleted: JsonValue): Json0Component {
    return { kind: 'list-delete', path: path, deleted: deleted };
  }

  static replace(path: Json0Path, inserted: JsonValue, deleted: JsonValue): Json0Component {
    return { kind: 'list-replace', path: path, inserted: inserted, deleted: deleted };
  }

  policy(collection: string): CollectionPolicy {
    return SF_COLLECTION_POLICIES.get(collection)!;
  }

  edit(
    collection: string,
    user: TestUserName,
    docId: string,
    data: JsonObject,
    components: readonly Json0Component[]
  ): Promise<PolicyDecision> {
    return this.policy(collection).edit(
      docId,
      data,
      { otType: 'json0', components: components },
      this.world.contextFor(user)
    );
  }

  createAs(collection: string, user: TestUserName, docId: string, data: JsonObject): Promise<PolicyDecision> {
    return this.policy(collection).create(docId, data, this.world.contextFor(user));
  }

  /** The users who may make the edit to the doc, whose id may depend on the user (as for their own configs). */
  async editors(
    collection: string,
    docIdFor: (user: TestUserName) => string,
    data: JsonObject,
    components: readonly Json0Component[]
  ): Promise<TestUserName[]> {
    return this.editorsBy(
      collection,
      docIdFor,
      () => data,
      () => components
    );
  }

  async editorsBy(
    collection: string,
    docIdFor: (user: TestUserName) => string,
    dataFor: (user: TestUserName) => JsonObject,
    componentsFor: (user: TestUserName) => readonly Json0Component[]
  ): Promise<TestUserName[]> {
    const allowed: TestUserName[] = [];
    for (const user of ALL_USERS) {
      const decision: PolicyDecision = await this.edit(
        collection,
        user,
        docIdFor(user),
        dataFor(user),
        componentsFor(user)
      );
      if (decision.allowed) {
        allowed.push(user);
      }
    }
    return allowed;
  }

  async creators(
    collection: string,
    docId: string,
    dataFor: (user: TestUserName) => JsonObject
  ): Promise<TestUserName[]> {
    const allowed: TestUserName[] = [];
    for (const user of ALL_USERS) {
      if ((await this.createAs(collection, user, docId, dataFor(user))).allowed) {
        allowed.push(user);
      }
    }
    return allowed;
  }

  configEditors(components: readonly Json0Component[]): Promise<TestUserName[]> {
    return this.editorsBy(
      SF_PROJECT_USER_CONFIGS_COLLECTION,
      (user: TestUserName) => `${PROJECT_ID}:${USERS[user]}`,
      (user: TestUserName) => this.config(user),
      () => components
    );
  }

  questionEditors(question: JsonObject, components: readonly Json0Component[]): Promise<TestUserName[]> {
    return this.editors(QUESTIONS_COLLECTION, () => this.questionDocId(), question, components);
  }

  questionEditorsBy(
    question: JsonObject,
    componentsFor: (user: TestUserName) => readonly Json0Component[]
  ): Promise<TestUserName[]> {
    return this.editorsBy(
      QUESTIONS_COLLECTION,
      () => this.questionDocId(),
      () => question,
      componentsFor
    );
  }

  questionCreators(dataFor: (user: TestUserName) => JsonObject): Promise<TestUserName[]> {
    return this.creators(QUESTIONS_COLLECTION, this.questionDocId(NEW_ID), dataFor);
  }

  threadEditors(thread: JsonObject, components: readonly Json0Component[]): Promise<TestUserName[]> {
    return this.editors(NOTE_THREAD_COLLECTION, () => this.threadDocId(String(thread.dataId)), thread, components);
  }

  threadEditorsBy(
    thread: JsonObject,
    componentsFor: (user: TestUserName) => readonly Json0Component[]
  ): Promise<TestUserName[]> {
    return this.editorsBy(
      NOTE_THREAD_COLLECTION,
      () => this.threadDocId(String(thread.dataId)),
      () => thread,
      componentsFor
    );
  }

  threadCreators(dataFor: (user: TestUserName) => JsonObject): Promise<TestUserName[]> {
    return this.creators(NOTE_THREAD_COLLECTION, this.threadDocId(NEW_ID), dataFor);
  }

  termEditors(term: JsonObject, components: readonly Json0Component[]): Promise<TestUserName[]> {
    return this.editors(BIBLICAL_TERM_COLLECTION, () => `${PROJECT_ID}:${TERM_ID}`, term, components);
  }

  trainingDataCreators(dataFor: (user: TestUserName) => JsonObject): Promise<TestUserName[]> {
    return this.creators(TRAINING_DATA_COLLECTION, `${PROJECT_ID}:${NEW_ID}`, dataFor);
  }

  questionDocId(dataId: string = QUESTION_ID): string {
    return `${PROJECT_ID}:${dataId}`;
  }

  threadDocId(dataId: string): string {
    return `${PROJECT_ID}:${dataId}`;
  }

  user(_user: TestUserName): JsonObject {
    return {
      name: 'User',
      displayName: 'Old',
      email: 'old@example.com',
      roles: ['user'],
      isDisplayNameConfirmed: false,
      avatarUrl: '',
      authId: 'auth0|1',
      sites: { sf: { projects: [PROJECT_ID], currentProjectId: PROJECT_ID } }
    };
  }

  config(user: TestUserName): JsonObject {
    return {
      projectRef: PROJECT_ID,
      ownerRef: USERS[user],
      selectedTask: 'translate',
      selectedBookNum: 41,
      selectedChapterNum: 1,
      selectedSegment: 'verse_1_1',
      selectedSegmentChecksum: 12345,
      isTargetTextRight: true,
      confidenceThreshold: 0.2,
      biblicalTermsEnabled: true,
      transliterateBiblicalTerms: false,
      numSuggestions: 1,
      noteRefsRead: [],
      questionRefsRead: [],
      answerRefsRead: [ANSWER_1],
      commentRefsRead: [],
      editorTabsOpen: [],
      lynxInsightState: {}
    };
  }

  panelData(): JsonObject {
    return { isOpen: false, filter: { types: ['info', 'warning', 'error'], scope: 'chapter' }, sortOrder: 'severity' };
  }

  verseRef(): JsonObject {
    return { bookNum: 40, chapterNum: 1, verseNum: 1, verse: '1' };
  }

  answer(user: TestUserName, dataId: string, overrides: AnswerOverrides = {}): JsonObject {
    return {
      dataId: dataId,
      ownerRef: USERS[user],
      likes: [],
      dateCreated: DATE,
      dateModified: DATE,
      deleted: false,
      comments: [],
      status: '',
      ...overrides
    };
  }

  comment(user: TestUserName, dataId: string): JsonObject {
    return {
      dataId: dataId,
      ownerRef: USERS[user],
      text: 'A comment',
      dateCreated: DATE,
      dateModified: DATE,
      deleted: false
    };
  }

  /**
   * A question by the administrator, with an answer by the checker (with a comment by the checker and a like by the
   * translator) and an answer by the translator.
   */
  question({
    answer1 = {},
    extraAnswerFirst = false
  }: { answer1?: AnswerOverrides; extraAnswerFirst?: boolean } = {}): JsonObject {
    const answers: JsonObject[] = [
      {
        ...this.answer('checker', ANSWER_1, { text: 'An answer', ...answer1 }),
        comments: [this.comment('checker', COMMENT_1)],
        likes: [{ ownerRef: USERS.translator }]
      },
      this.answer('translator', ANSWER_2, { text: 'Another answer' })
    ];
    if (extraAnswerFirst) {
      answers.unshift(this.answer('translator', 'd00000000000000000000003', { text: 'An answer' }));
    }
    return {
      dataId: QUESTION_ID,
      projectRef: PROJECT_ID,
      ownerRef: USERS.admin,
      verseRef: { bookNum: 40, chapterNum: 1, verseNum: 1 },
      text: 'What?',
      answers: answers,
      isArchived: false,
      dateCreated: DATE,
      dateModified: DATE
    };
  }

  /** A question as the question dialog creates it. */
  newQuestion(user: TestUserName): JsonObject {
    return {
      dataId: NEW_ID,
      projectRef: PROJECT_ID,
      ownerRef: USERS[user],
      verseRef: { bookNum: 40, chapterNum: 1, verseNum: 1 },
      text: 'What?',
      answers: [],
      isArchived: false,
      dateCreated: DATE,
      dateModified: DATE
    };
  }

  note(
    user: TestUserName,
    dataId: string,
    {
      content,
      status = 'todo',
      threadId = THREAD_ID,
      tagId
    }: {
      content?: string;
      status?: string;
      threadId?: string;
      tagId?: number;
    } = {}
  ): JsonObject {
    const note: Record<string, JsonValue> = {
      dateCreated: DATE,
      dateModified: DATE,
      threadId: threadId,
      dataId: dataId,
      ownerRef: USERS[user],
      conflictType: 'unknownConflictType',
      type: '',
      status: status,
      deleted: false,
      editable: true,
      versionNumber: 1
    };
    if (content != null) note.content = content;
    if (tagId != null) note.tagId = tagId;
    return note;
  }

  /**
   * A thread published to Scripture Forge, owned by the translator, in Matthew 1: a note by the translator, a note from
   * Paratext by the administrator, and a note by the commenter.
   */
  thread({ dataId = THREAD_ID, chapterNum = 1 }: { dataId?: string; chapterNum?: number } = {}): JsonObject {
    return {
      dataId: dataId,
      threadId: THREAD_ID,
      verseRef: { bookNum: 40, chapterNum: chapterNum, verseNum: 1 },
      projectRef: PROJECT_ID,
      ownerRef: USERS.translator,
      notes: [
        this.note('translator', NOTE_1, { content: 'A note' }),
        { ...this.note('admin', NOTE_2, { content: 'From Paratext' }), editable: false, syncUserRef: 'pt01' },
        this.note('commenter', NOTE_3, { content: 'A comment' })
      ],
      position: { start: 0, length: 5 },
      originalContextBefore: '',
      originalSelectedText: 'In the beginning',
      originalContextAfter: '',
      status: 'todo',
      publishedToSF: true
    };
  }

  /** A thread from Paratext, not published to Scripture Forge. */
  ptThread(): JsonObject {
    return {
      dataId: PT_THREAD_ID,
      threadId: PT_THREAD_THREAD_ID,
      verseRef: { bookNum: 40, chapterNum: 1, verseNum: 2 },
      projectRef: PROJECT_ID,
      ownerRef: USERS.admin,
      notes: [
        {
          ...this.note('admin', NOTE_1, { content: 'From Paratext', threadId: PT_THREAD_THREAD_ID }),
          editable: false
        }
      ],
      position: { start: 0, length: 5 },
      originalContextBefore: '',
      originalSelectedText: 'x',
      originalContextAfter: '',
      status: 'todo'
    };
  }

  /** A thread as the editor creates it. */
  newThread(user: TestUserName): JsonObject {
    return {
      dataId: NEW_ID,
      threadId: NEW_ID,
      verseRef: { bookNum: 40, chapterNum: 1, verseNum: 1 },
      projectRef: PROJECT_ID,
      ownerRef: USERS[user],
      notes: [this.note(user, NOTE_1, { threadId: NEW_ID, content: 'A note', tagId: 5 })],
      position: { start: 0, length: 0 },
      originalContextBefore: '',
      originalSelectedText: 'In the beginning',
      originalContextAfter: '',
      status: 'todo',
      publishedToSF: true
    };
  }

  /** A thread as the Biblical Terms panel creates it. */
  newBiblicalTermThread(user: TestUserName): JsonObject {
    const threadId = `BT_${TERM_ID}`;
    return {
      ...this.newThread(user),
      threadId: threadId,
      notes: [this.note(user, NOTE_1, { threadId: threadId, tagId: -3, status: 'deleted' })],
      originalSelectedText: '',
      biblicalTermId: TERM_ID,
      extraHeadingInfo: { gloss: 'word', language: 'greek', lemma: TERM_ID, transliteration: 'logos' }
    };
  }

  term(): JsonObject {
    return {
      dataId: TERM_ID,
      projectRef: PROJECT_ID,
      ownerRef: '',
      termId: 'λόγος',
      transliteration: 'logos',
      renderings: ['word'],
      description: 'Old',
      language: 'greek',
      links: [],
      references: [40001001],
      definitions: {}
    };
  }

  trainingData(user: TestUserName): JsonObject {
    return {
      ownerRef: USERS[user],
      projectRef: PROJECT_ID,
      dataId: NEW_ID,
      fileUrl: `/${PROJECT_ID}/${USERS[user]}_${NEW_ID}.csv?t=134044416000000000`,
      mimeType: 'text/csv',
      skipRows: 0,
      title: 'data.csv',
      deleted: false
    };
  }
}
