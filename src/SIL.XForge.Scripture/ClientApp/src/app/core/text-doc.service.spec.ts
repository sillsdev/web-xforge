import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Delta } from 'quill';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { Chapter, TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import * as RichText from 'rich-text';
import { mock, when } from 'ts-mockito';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { getCombinedVerseTextDoc, getPoetryVerseTextDoc, getTextDoc } from '../shared/test-utils';
import { SF_TYPE_REGISTRY } from './models/sf-type-registry';
import { TextDoc, TextDocId } from './models/text-doc';
import { SFProjectService } from './sf-project.service';
import { TextDocService } from './text-doc.service';

const mockProjectService = mock(SFProjectService);
const mockUserService = mock(UserService);

describe('TextDocService', () => {
  configureTestingModule(() => ({
    imports: [TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: SFProjectService, useMock: mockProjectService },
      { provide: UserService, useMock: mockUserService }
    ]
  }));

  it('should overwrite text doc', fakeAsync(() => {
    const env = new TestEnvironment();
    const newDelta: Delta = getCombinedVerseTextDoc(env.textDocId) as Delta;

    env.textDocService.overwrite(env.textDocId, newDelta, 'Editor');
    tick();

    expect(env.getTextDoc(env.textDocId).data?.ops).toEqual(newDelta.ops);
  }));

  it('should emit diff', fakeAsync(() => {
    const env = new TestEnvironment();
    const origDelta: Delta = env.getTextDoc(env.textDocId).data as Delta;
    const newDelta: Delta = getPoetryVerseTextDoc(env.textDocId) as Delta;
    const diff: Delta = origDelta.diff(newDelta);

    env.textDocService.getLocalSystemChanges$(env.textDocId).subscribe(emittedDiff => {
      expect(emittedDiff.ops).toEqual(diff.ops);
    });

    env.textDocService.overwrite(env.textDocId, newDelta, 'Editor');
    tick();
  }));

  it('should submit the source', fakeAsync(() => {
    const env = new TestEnvironment();
    const newDelta: Delta = getPoetryVerseTextDoc(env.textDocId) as Delta;

    const textDoc = env.getTextDoc(env.textDocId);
    textDoc.adapter.changes$.subscribe(() => {
      // overwrite() resets submitSource to false, so we check it when the op is submitted
      expect(textDoc.adapter.submitSource).toBe(true);
    });

    env.textDocService.overwrite(env.textDocId, newDelta, 'Editor');
    tick();
  }));

  describe('canEdit', () => {
    it('should return false if the project is undefined', () => {
      const env = new TestEnvironment();

      // SUT
      const actual: boolean = env.textDocService.canEdit(undefined, 1, 1);
      expect(actual).toBe(false);
    });

    it('should return true if the project and user are correctly configured', () => {
      const env = new TestEnvironment();
      const project = createTestProjectProfile({
        editable: true,
        sync: { dataInSync: true },
        texts: [
          { bookNum: 1, chapters: [{ number: 1, isValid: true, permissions: { user01: TextInfoPermission.Write } }] }
        ],
        userRoles: { user01: SFProjectRole.ParatextAdministrator }
      });

      // SUT
      const actual: boolean = env.textDocService.canEdit(project, 1, 1);
      expect(actual).toBe(true);
    });
  });

  describe('isDataInSync', () => {
    it('should return true if the project is undefined', () => {
      const env = new TestEnvironment();

      // SUT
      const actual: boolean = env.textDocService.isDataInSync(undefined);
      expect(actual).toBe(true);
    });

    it('should return false if the project data is not in sync', () => {
      const env = new TestEnvironment();
      const project = createTestProjectProfile({ sync: { dataInSync: false } });

      // SUT
      const actual: boolean = env.textDocService.isDataInSync(project);
      expect(actual).toBe(false);
    });

    it('should return true if the project is data is in sync', () => {
      const env = new TestEnvironment();
      const project = createTestProjectProfile({ sync: { dataInSync: true } });

      // SUT
      const actual: boolean = env.textDocService.isDataInSync(project);
      expect(actual).toBe(true);
    });
  });

  describe('isEditingDisabled', () => {
    it('should return false if the project is undefined', () => {
      const env = new TestEnvironment();

      // SUT
      const actual: boolean = env.textDocService.isEditingDisabled(undefined);
      expect(actual).toBe(false);
    });

    it('should return false if the project is editable', () => {
      const env = new TestEnvironment();
      const project = createTestProjectProfile({ editable: true });

      // SUT
      const actual: boolean = env.textDocService.isEditingDisabled(project);
      expect(actual).toBe(false);
    });

    it('should return true if the project is not editable', () => {
      const env = new TestEnvironment();
      const project = createTestProjectProfile({ editable: false });

      // SUT
      const actual: boolean = env.textDocService.isEditingDisabled(project);
      expect(actual).toBe(true);
    });
  });

  describe('isUsfmValid', () => {
    it('should return true if the project is undefined', () => {
      const env = new TestEnvironment();

      // SUT
      const actual: boolean = env.textDocService.isUsfmValid(undefined, 1, 1);
      expect(actual).toBe(true);
    });

    it('should return true if the project not have the book', () => {
      const env = new TestEnvironment();
      const project = createTestProjectProfile({ texts: [] });

      // SUT
      const actual: boolean = env.textDocService.isUsfmValid(project, 1, 1);
      expect(actual).toBe(true);
    });

    it('should return false if the chapter is not valid', () => {
      const env = new TestEnvironment();
      const project = createTestProjectProfile({ texts: [{ bookNum: 1, chapters: [{ number: 1, isValid: false }] }] });

      // SUT
      const actual: boolean = env.textDocService.isUsfmValid(project, 1, 1);
      expect(actual).toBe(false);
    });

    it('should return true if the chapter is valid', () => {
      const env = new TestEnvironment();
      const project = createTestProjectProfile({ texts: [{ bookNum: 1, chapters: [{ number: 1, isValid: true }] }] });

      // SUT
      const actual: boolean = env.textDocService.isUsfmValid(project, 1, 1);
      expect(actual).toBe(true);
    });
  });

  describe('isUsfmValidForText', () => {
    it('should return false if the text is undefined', () => {
      const env = new TestEnvironment();

      // SUT
      const actual: boolean = env.textDocService.isUsfmValidForText(undefined, 1);
      expect(actual).toBe(false);
    });

    it('should return false if the text does not have the chapter', () => {
      const env = new TestEnvironment();
      const text: Partial<TextInfo> = { chapters: [] };

      // SUT
      const actual: boolean | undefined = env.textDocService.isUsfmValidForText(text as TextInfo, 1);
      expect(actual).toBe(false);
    });

    it('should return false if the chapter is not valid', () => {
      const env = new TestEnvironment();
      const text: Partial<TextInfo> = {
        chapters: [{ number: 1, isValid: false } as Chapter]
      };

      // SUT
      const actual: boolean | undefined = env.textDocService.isUsfmValidForText(text as TextInfo, 1);
      expect(actual).toBe(false);
    });

    it('should return true if the chapter is valid', () => {
      const env = new TestEnvironment();
      const text: Partial<TextInfo> = {
        chapters: [{ number: 1, isValid: true } as Chapter]
      };

      // SUT
      const actual: boolean | undefined = env.textDocService.isUsfmValidForText(text as TextInfo, 1);
      expect(actual).toBe(true);
    });
  });

  describe('userHasGeneralEditRight', () => {
    it('should return false if the project is undefined', () => {
      const env = new TestEnvironment();

      // SUT
      const actual: boolean = env.textDocService.userHasGeneralEditRight(undefined);
      expect(actual).toBe(false);
    });

    it('should return false if the user not have the permission', () => {
      const env = new TestEnvironment();
      const project = createTestProjectProfile({ userRoles: { user01: SFProjectRole.ParatextObserver } });

      // SUT
      const actual: boolean = env.textDocService.userHasGeneralEditRight(project);
      expect(actual).toBe(false);
    });

    it('should return true if the user has the write permission', () => {
      const env = new TestEnvironment();
      const project = createTestProjectProfile({ userRoles: { user01: SFProjectRole.ParatextAdministrator } });

      // SUT
      const actual: boolean = env.textDocService.userHasGeneralEditRight(project);
      expect(actual).toBe(true);
    });
  });

  describe('hasChapterEditPermission', () => {
    it('should return false if the project not have the book', () => {
      const env = new TestEnvironment();
      const project = createTestProjectProfile({ texts: [] });

      // SUT
      const actual: boolean = env.textDocService.hasChapterEditPermission(project, 1, 1);
      expect(actual).toBe(false);
    });

    it('should return false if the user not have the permission', () => {
      const env = new TestEnvironment();
      const project = createTestProjectProfile({ texts: [{ bookNum: 1, chapters: [{ number: 1 }] }] });

      // SUT
      const actual: boolean = env.textDocService.hasChapterEditPermission(project, 1, 1);
      expect(actual).toBe(false);
    });

    it('should return true if the user has the write permission', () => {
      const env = new TestEnvironment();
      const project = createTestProjectProfile({
        texts: [
          {
            bookNum: 1,
            chapters: [{ number: 1, permissions: { user01: TextInfoPermission.Write }, lastVerse: 0, isValid: true }]
          }
        ]
      });

      // SUT
      const actual: boolean = env.textDocService.hasChapterEditPermission(project, 1, 1);
      expect(actual).toBe(true);
    });
  });

  describe('hasChapterEditPermissionForText', () => {
    it('should return undefined if the text does not have the chapter', () => {
      const env = new TestEnvironment();
      const text: Partial<TextInfo> = { chapters: [] };

      // SUT
      const actual: boolean | undefined = env.textDocService.hasChapterEditPermissionForText(text as TextInfo, 1);
      expect(actual).toBeUndefined();
    });

    it('should return undefined if the user does not have the permission', () => {
      const env = new TestEnvironment();
      const text: Partial<TextInfo> = { chapters: [{ number: 1 } as Chapter] };

      // SUT
      const actual: boolean | undefined = env.textDocService.hasChapterEditPermissionForText(text as TextInfo, 1);
      expect(actual).toBeUndefined();
    });

    it('should return false if the user does not have the edit permission', () => {
      const env = new TestEnvironment();
      const text: Partial<TextInfo> = {
        chapters: [
          { number: 1, permissions: { user01: TextInfoPermission.Read }, lastVerse: 0, isValid: true } as Chapter
        ]
      };

      // SUT
      const actual: boolean | undefined = env.textDocService.hasChapterEditPermissionForText(text as TextInfo, 1);
      expect(actual).toBe(false);
    });

    it('should return true if the user has the write permission', () => {
      const env = new TestEnvironment();
      const text: Partial<TextInfo> = {
        chapters: [
          { number: 1, permissions: { user01: TextInfoPermission.Write }, lastVerse: 0, isValid: true } as Chapter
        ]
      };

      // SUT
      const actual: boolean | undefined = env.textDocService.hasChapterEditPermissionForText(text as TextInfo, 1);
      expect(actual).toBe(true);
    });
  });
});

class TestEnvironment {
  readonly textDocId = new TextDocId('project01', 40, 1);
  readonly textDocService: TextDocService = TestBed.inject(TextDocService);
  private readonly realtimeService: TestRealtimeService = TestBed.inject(TestRealtimeService);

  constructor() {
    this.realtimeService.addSnapshot<TextData>(TextDoc.COLLECTION, {
      id: this.textDocId.toString(),
      data: getTextDoc(this.textDocId),
      type: RichText.type.name
    });

    when(mockProjectService.getText(this.textDocId)).thenCall(id =>
      this.realtimeService.subscribe(TextDoc.COLLECTION, id.toString())
    );
    when(mockUserService.currentUserId).thenReturn('user01');
  }

  getTextDoc(textId: TextDocId): TextDoc {
    return this.realtimeService.get<TextDoc>(TextDoc.COLLECTION, textId.toString());
  }
}
