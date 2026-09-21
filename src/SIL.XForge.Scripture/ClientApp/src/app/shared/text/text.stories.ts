import { inject, provideAppInitializer } from '@angular/core';
import { applicationConfig, Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { Delta } from 'quill';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import * as RichText from 'rich-text';
import { of } from 'rxjs';
import { expect, waitFor } from 'storybook/test';
import { anything, instance, mock, when } from 'ts-mockito';
import { UserDoc } from 'xforge-common/models/user-doc';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { provideTestRealtime } from 'xforge-common/test-realtime-providers';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { TextDoc, TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { provideQuillRegistrations } from './quill-editor-registration/quill-providers';
import { TextComponent } from './text.component';

const ltrTextDocId = new TextDocId('project01', 1, 1);
const rtlTextDocId = new TextDocId('project02', 1, 1);

/**
 * Builds a one chapter text doc. Each entry becomes a verse; an entry of `null` starts a new paragraph. Verse 2 of
 * each story is a bare number, and verses 4 and 5 start and end with a number, so that digits sit right next to verse
 * markers. In a right-to-left text this is where the marker used to be reordered onto the wrong side of its verse
 * (SF-2481).
 */
function buildChapter(heading: string, verses: (string | null)[]): TextData {
  const delta = new Delta();
  delta.insert(heading, { segment: 's_1' });
  delta.insert('\n', { para: { style: 's' } });
  delta.insert({ chapter: { number: '1', style: 'c' } });
  delta.insert({ blank: true }, { segment: 'p_1' });
  let verseNum = 1;
  let paragraphNum = 0;
  for (const verse of verses) {
    if (verse == null) {
      delta.insert('\n', { para: { style: 'p' } });
      paragraphNum++;
      delta.insert({ blank: true }, { segment: `verse_1_${verseNum - 1}/p_${paragraphNum}` });
      continue;
    }
    delta.insert({ verse: { number: verseNum.toString(), style: 'v' } });
    delta.insert(verse, { segment: `verse_1_${verseNum}` });
    verseNum++;
  }
  delta.insert('\n', { para: { style: 'p' } });
  return delta;
}

const englishChapter: TextData = buildChapter('The creation of the world', [
  'In the beginning God created the heavens and the earth.',
  '500',
  'And God said, Let there be light: and there was light.',
  '12 And God saw the light, that it was good: and God divided the light from the darkness.',
  'And God called the light Day, and the darkness he called Night, and there were 40',
  null,
  'And God said, Let there be a firmament in the midst of the waters.'
]);

const arabicChapter: TextData = buildChapter('خلق العالم', [
  'فِي الْبَدْءِ خَلَقَ اللهُ السَّمَاوَاتِ وَالأَرْضَ.',
  '500',
  'وَقَالَ اللهُ: «لِيَكُنْ نُورٌ»، فَكَانَ نُورٌ.',
  '12 وَرَأَى اللهُ النُّورَ أَنَّهُ حَسَنٌ. وَفَصَلَ اللهُ بَيْنَ النُّورِ وَالظُّلْمَةِ.',
  'وَدَعَا اللهُ النُّورَ نَهَارًا، وَالظُّلْمَةُ دَعَاهَا لَيْلًا، وكان 40',
  null,
  'وَقَالَ اللهُ: «لِيَكُنْ جَلَدٌ فِي وَسَطِ الْمِيَاهِ».'
]);

function createProfile(name: string, writingSystemTag: string, isRightToLeft: boolean): SFProjectProfile {
  return createTestProjectProfile({
    name,
    shortName: name,
    isRightToLeft,
    writingSystem: { tag: writingSystemTag },
    userRoles: { user01: SFProjectRole.ParatextTranslator },
    texts: [{ bookNum: 1, chapters: [{ number: 1, lastVerse: 6, isValid: true, permissions: {} }], permissions: {} }]
  });
}

// The realtime service is created by the story's injector, so the mocks look it up lazily.
let realtimeService: TestRealtimeService;

const mockedProjectService = mock(SFProjectService);
when(mockedProjectService.getText(anything())).thenCall((id: TextDocId) =>
  realtimeService.subscribe(TextDoc.COLLECTION, id.toString())
);
when(mockedProjectService.getProfile(anything())).thenCall((id: string) =>
  realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, id)
);
const mockedUserService = mock(UserService);
when(mockedUserService.currentUserId).thenReturn('user01');
when(mockedUserService.getCurrentUser()).thenCall(() => realtimeService.subscribe(UserDoc.COLLECTION, 'user01'));
const mockedOnlineStatusService = mock(OnlineStatusService);
when(mockedOnlineStatusService.isOnline).thenReturn(true);
when(mockedOnlineStatusService.onlineStatus$).thenReturn(of(true));

function seedRealtimeData(): void {
  realtimeService = inject(TestRealtimeService);
  realtimeService.addSnapshots<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, [
    { id: ltrTextDocId.projectId, data: createProfile('LTR', 'en', false) },
    { id: rtlTextDocId.projectId, data: createProfile('RTL', 'ar', true) }
  ]);
  realtimeService.addSnapshots<TextData>(TextDoc.COLLECTION, [
    { id: ltrTextDocId.toString(), data: englishChapter, type: RichText.type.name },
    { id: rtlTextDocId.toString(), data: arabicChapter, type: RichText.type.name }
  ]);
  realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
    id: 'user01',
    data: createTestUser({ sites: { sf: { projects: [ltrTextDocId.projectId, rtlTextDocId.projectId] } } })
  });
}

const meta: Meta<TextComponent> = {
  title: 'Shared/Text',
  component: TextComponent,
  decorators: [
    // Everything goes in the application injector, so that the initializer that seeds the realtime data sees the same
    // TestRealtimeService as the component.
    applicationConfig({
      providers: [
        provideQuillRegistrations(),
        provideTestRealtime(SF_TYPE_REGISTRY),
        provideAppInitializer(seedRealtimeData),
        { provide: SFProjectService, useValue: instance(mockedProjectService) },
        { provide: UserService, useValue: instance(mockedUserService) },
        { provide: OnlineStatusService, useValue: instance(mockedOnlineStatusService) }
      ]
    }),
    moduleMetadata({ imports: [TextComponent] })
  ],
  parameters: {
    // Storybook lists this component's methods as args, and the global actions.argTypesRegex in preview.ts replaces
    // every `on*` arg with a logging stub. That would overwrite onEditorCreated, which Quill calls when the editor is
    // created, so the text doc would never bind.
    actions: { disable: true }
  }
};
export default meta;

type Story = StoryObj<TextComponent>;

function getVerseMarker(canvasElement: HTMLElement, verseNumber: string): HTMLElement {
  const marker = Array.from(canvasElement.querySelectorAll<HTMLElement>('usx-verse')).find(
    verse => verse.textContent?.trim() === verseNumber
  );
  if (marker == null) throw new Error(`No marker for verse ${verseNumber}`);
  return marker;
}

function getVerseSegment(canvasElement: HTMLElement, verseNumber: string): HTMLElement {
  const segment = canvasElement.querySelector<HTMLElement>(`usx-segment[data-segment="verse_1_${verseNumber}"]`);
  if (segment == null) throw new Error(`No segment for verse ${verseNumber}`);
  return segment;
}

async function waitForChapter(canvasElement: HTMLElement): Promise<void> {
  // the last verse of the chapter is only in the DOM once the whole text doc has been loaded into the editor
  await waitFor(() => getVerseSegment(canvasElement, '6'), { timeout: 10_000 });
}

export const LeftToRight: Story = {
  args: { id: ltrTextDocId, isRightToLeft: false },
  play: async ({ canvasElement }) => {
    await waitForChapter(canvasElement);
    // verse 2 is the bare number 500: its own marker is to its left and verse 3's marker to its right
    const verse2: DOMRect = getVerseSegment(canvasElement, '2').getBoundingClientRect();
    expect(getVerseMarker(canvasElement, '2').getBoundingClientRect().right).toBeLessThanOrEqual(verse2.left);
    expect(getVerseMarker(canvasElement, '3').getBoundingClientRect().left).toBeGreaterThanOrEqual(verse2.right);
  }
};

export const RightToLeft: Story = {
  args: { id: rtlTextDocId, isRightToLeft: true },
  play: async ({ canvasElement }) => {
    await waitForChapter(canvasElement);
    // verse 2 is the bare number 500: in a right-to-left text its own marker is to its right and verse 3's marker to
    // its left. Before SF-2481 the digits of the number and of both markers were reordered as one run, which put the
    // markers on the opposite sides.
    const verse2: DOMRect = getVerseSegment(canvasElement, '2').getBoundingClientRect();
    expect(getVerseMarker(canvasElement, '2').getBoundingClientRect().left).toBeGreaterThanOrEqual(verse2.right);
    expect(getVerseMarker(canvasElement, '3').getBoundingClientRect().right).toBeLessThanOrEqual(verse2.left);
  }
};
