import { Component, DebugElement, NgZone, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Question } from 'realtime-server/lib/esm/scriptureforge/models/question';
import { SFProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { getTextAudioId, TextAudio } from 'realtime-server/lib/esm/scriptureforge/models/text-audio';
import { VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { BehaviorSubject, lastValueFrom, Subject } from 'rxjs';
import { takeWhile } from 'rxjs/operators';
import { anything, instance, mock, when } from 'ts-mockito';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { QuestionDoc } from '../../../../core/models/question-doc';
import { SFProjectUserConfigDoc } from '../../../../core/models/sf-project-user-config-doc';
import { TextAudioDoc } from '../../../../core/models/text-audio-doc';
import { SFProjectService } from '../../../../core/sf-project.service';
import { AudioPlayer, AudioStatus } from '../../../../shared/audio/audio-player';
import { getAudioTimingsPhraseLevel } from '../../../checking-test.utils';
import { SingleButtonAudioPlayerComponent } from '../../single-button-audio-player/single-button-audio-player.component';
import { CheckingQuestionComponent } from './checking-question.component';

const mockedSFProjectService = mock(SFProjectService);
const mockedQuestionDoc = mock(QuestionDoc);
const mockedQuestion = mock<Question>();
const mockedSFProjectUserConfig = mock<SFProjectUserConfig>();
const mockedSFProjectUserConfigDoc = mock(SFProjectUserConfigDoc);

@Component({
    template: `<app-checking-question
    #question
    [questionDoc]="questionDoc"
    (audioPlayed)="played = true"
  ></app-checking-question>`,
    standalone: false
})
class MockComponent {
  @ViewChild('question') question!: CheckingQuestionComponent;
  questionDoc: QuestionDoc = instance(mockedQuestionDoc);
  projectUserConfigDoc: SFProjectUserConfigDoc = instance(mockedSFProjectUserConfigDoc);
  played: boolean = false;
  questionDocChangeSubject$: BehaviorSubject<any> = new BehaviorSubject<void>(undefined);
  constructor() {
    when(mockedQuestion.projectRef).thenReturn('project01');
    when(mockedQuestion.text).thenReturn('some text');
    when(mockedQuestion.audioUrl).thenReturn('test-audio-player.webm');
    const verseRef: VerseRefData = {
      bookNum: 8,
      chapterNum: 1,
      verseNum: 1
    };
    when(mockedQuestion.verseRef).thenReturn(verseRef);
    when(mockedQuestionDoc.changes$).thenReturn(this.questionDocChangeSubject$.asObservable());
    when(mockedQuestionDoc.data).thenReturn(instance(mockedQuestion));
    when(mockedSFProjectUserConfigDoc.data).thenReturn(instance(mockedSFProjectUserConfig));
    this.questionDoc = instance(mockedQuestionDoc);
  }
}

describe('CheckingQuestionComponent', () => {
  configureTestingModule(() => ({
    imports: [UICommonModule, TestTranslocoModule, TestOnlineStatusModule.forRoot()],
    declarations: [CheckingQuestionComponent, SingleButtonAudioPlayerComponent, MockComponent],
    providers: [{ provide: SFProjectService, useMock: mockedSFProjectService }]
  }));

  it('selects scripture text when scripture audio is present', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();

    expect(env.component.question.focusedText).toBe('scripture-audio-label');
    expect(window.getComputedStyle(env.scriptureAudio.nativeElement)['display']).not.toBe('none');
    expect(window.getComputedStyle(env.questionAudio.nativeElement)['display']).toBe('none');
    expect(env.noQuestionAudioIcon).toBeNull();
  });

  it('selects question when scripture audio absent', async () => {
    const env = new TestEnvironment();
    when(mockedSFProjectService.queryAudioText('project01', anything())).thenResolve(
      instance(mock(RealtimeQuery<TextAudioDoc>))
    );
    await env.wait();
    await env.wait();

    expect(env.component.question.focusedText).toBe('question-audio-label');
    expect(env.scriptureAudio).toBeNull();
    expect(window.getComputedStyle(env.questionAudio.nativeElement)['display']).not.toBe('none');
  });

  it('selects question when scripture audio has already been played', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();

    env.scriptureAudio.componentInstance.hasFinishedPlayingOnce$.next(true);
    await env.wait();

    env.component.questionDoc = {
      data: {
        audioUrl: 'test-audio-player-b.webm',
        projectRef: 'project01',
        text: 'another question',
        verseRef: env.component.questionDoc.data!.verseRef
      }
    } as QuestionDoc;

    expect(env.component.question.focusedText).toBe('question-audio-label');
    expect(window.getComputedStyle(env.scriptureAudio.nativeElement)['display']).toBe('none');
    expect(window.getComputedStyle(env.questionAudio.nativeElement)['display']).not.toBe('none');
  });

  it('selects scripture if not all scripture audio has already been played for question', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();

    env.scriptureAudio.componentInstance.hasFinishedPlayingOnce$.next(true);
    await env.wait();

    const verseRef: VerseRefData = {
      bookNum: 8,
      chapterNum: 1,
      verseNum: 1,
      verse: '1-2'
    };
    env.component.questionDoc = {
      data: {
        audioUrl: 'test-audio-player-b.webm',
        projectRef: 'project01',
        text: 'another question',
        verseRef: verseRef
      },
      changes$: env.component.questionDocChangeSubject$.asObservable()
    } as QuestionDoc;

    await env.wait();

    expect(env.component.question.focusedText).toBe('scripture-audio-label');
    expect(window.getComputedStyle(env.scriptureAudio.nativeElement)['display']).not.toBe('none');
    expect(window.getComputedStyle(env.questionAudio.nativeElement)['display']).toBe('none');
  });

  it('hides audio player when question w/o audio is selected', async () => {
    const env = new TestEnvironment();
    when(mockedQuestion.audioUrl).thenReturn('');
    await env.wait();
    await env.wait();
    expect(window.getComputedStyle(env.noQuestionAudioIcon.nativeElement)['display']).toBe('none');

    env.component.question.selectQuestion();
    await env.wait();

    expect(env.component.question.focusedText).toBe('question-audio-label');
    expect(window.getComputedStyle(env.scriptureAudio.nativeElement)['display']).toBe('none');
    expect(env.questionAudio).toBeNull();
    expect(env.noQuestionAudioIcon).not.toBeNull();
  });

  it('selects question the first time scripture audio plays', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();

    env.scriptureAudio.componentInstance.audio.setSeek(98);
    await env.wait();
    env.component.question.playScripture();

    await env.wait(3000); //wait for the audio to finish playing
    expect(env.component.question.focusedText).toBe('question-audio-label');

    env.component.question.selectScripture();
    env.scriptureAudio.componentInstance.audio.setSeek(98);
    await env.wait();
    env.component.question.playScripture();

    await env.wait(1000); //wait for the audio to finish playing
    expect(env.component.question.focusedText).toBe('scripture-audio-label');
  }, 7000); // Increase from the default 5000, as this test can take longer on Firefox

  it('plays the entire verse when timing files are phrase level', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();

    // The timing follows shows 1a (0-1sec), 1b (1-2sec), 2a (2-3sec), 2b (3-4sec)
    expect(env.component.question.scriptureAudioStart).toBe(0);
    expect(env.component.question.scriptureAudioEnd).toBe(2);
  });

  it('does not select question if scriptureAudio is set to the same value', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();

    const originalComponent = env.scriptureAudio.componentInstance;

    //play through the scripture audio once
    env.scriptureAudio.componentInstance.audio.setSeek(98);
    await env.wait();
    await env.wait();
    env.component.question.playScripture();
    await env.wait(3000); //wait for the audio to finish playing
    expect(env.component.question.focusedText).toBe('question-audio-label');

    env.component.question.selectScripture();
    await env.wait();
    expect(env.component.question.focusedText).toBe('scripture-audio-label');

    //ViewChild setters are called even when the current and previous values are the same.
    //Prevent duplicate set's from messing with the user's selection
    env.component.question.scriptureAudio = originalComponent;
    await env.wait();

    expect(env.component.question.focusedText).toBe('scripture-audio-label');
  });

  it('reloads audio files when switching to a new questionDoc', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();

    //new question with matching audio in query
    const newQuestionDoc = mock(QuestionDoc);
    const newQuestion = mock<Question>();
    when(newQuestion.projectRef).thenReturn('project01');
    when(newQuestion.text).thenReturn('another question');
    when(newQuestion.audioUrl).thenReturn('test-audio-player-b.webm');
    when(newQuestionDoc.changes$).thenReturn(env.component.questionDocChangeSubject$.asObservable());
    const verseRef: VerseRefData = {
      bookNum: 1,
      chapterNum: 11,
      verseNum: 111
    };
    when(newQuestion.verseRef).thenReturn(verseRef);
    when(newQuestionDoc.data).thenReturn(instance(newQuestion));

    await env.wait();

    expect(env.component.question.questionAudioUrl).toEqual('test-audio-player.webm');
    expect(env.component.question['scriptureAudioUrl']).toEqual('test-audio-player-b.webm');

    env.component.questionDoc = instance(newQuestionDoc);
    await env.wait();

    expect(env.component.question.questionAudioUrl).toEqual('test-audio-player-b.webm');
    expect(env.component.question['scriptureAudioUrl']).toEqual('test-audio-player.webm');
  });

  it('reloads audio files when audio data changes', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();

    expect(env.component.question['scriptureAudioUrl']).not.toEqual(undefined);
    expect(env.component.question.focusedText).toEqual('scripture-audio-label');

    //modify the query
    when(env.query.docs).thenReturn([]);

    //fire the event
    env.queryChanged$.next();
    await env.wait();

    expect(env.component.question['scriptureAudioUrl']).toEqual(undefined);
    expect(env.component.question.focusedText).toEqual('question-audio-label');
  });

  it('has default question text', async () => {
    const env = new TestEnvironment();
    when(mockedQuestion.text).thenReturn('');
    await env.wait();
    await env.wait();

    expect(env.component.question.questionText).toContain('Listen to the question for');
  });

  it('emits audio played when audio play button is clicked', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();

    expect(env.component.played).toBe(false);
    env.scriptureAudio.nativeElement.click();
    await env.wait();

    expect(env.component.played).toBe(true);
  });

  it('updates the scripture audio verse play button when question verse reference changes', async () => {
    const env = new TestEnvironment();
    await env.wait();
    await env.wait();
    expect(env.scriptureAudio).not.toBeNull();

    const chapterWithoutAudio = 2;
    when(mockedQuestion.verseRef).thenReturn({ bookNum: 8, chapterNum: chapterWithoutAudio, verseNum: 1 });

    env.component.questionDocChangeSubject$.next(undefined);
    await env.wait();
    expect(env.scriptureAudio).toBeNull();
  });
});

class TestEnvironment {
  readonly component: MockComponent;
  readonly fixture: ComponentFixture<MockComponent>;
  readonly ngZone: NgZone;
  readonly query: RealtimeQuery<TextAudioDoc> = mock(RealtimeQuery<TextAudioDoc>) as RealtimeQuery<TextAudioDoc>;
  readonly queryChanged$: Subject<void> = new Subject<void>();

  constructor() {
    const audio1 = this.createTextAudioDoc(getTextAudioId('project01', 8, 1), 'test-audio-player-b.webm');
    const audio2 = this.createTextAudioDoc(getTextAudioId('project01', 1, 11), 'test-audio-player.webm');

    when(this.query.remoteChanges$).thenReturn(this.queryChanged$);
    when(this.query.docs).thenReturn([instance(audio1), instance(audio2)]);

    when(mockedSFProjectService.onlineIsSourceProject('project01')).thenResolve(false);
    when(mockedSFProjectService.onlineDelete(anything())).thenResolve();
    when(mockedSFProjectService.onlineUpdateSettings('project01', anything())).thenResolve();
    when(mockedSFProjectService.queryAudioText('project01', anything())).thenResolve(instance(this.query));

    this.ngZone = TestBed.inject(NgZone);
    this.fixture = TestBed.createComponent(MockComponent);
    this.component = this.fixture.componentInstance;
  }

  createTextAudioDoc(id: string, url: string): TextAudioDoc {
    const audioDoc = mock(TextAudioDoc);
    const textAudio = mock<TextAudio>();
    when(textAudio.audioUrl).thenReturn(url);
    when(textAudio.timings).thenReturn(getAudioTimingsPhraseLevel());
    when(audioDoc.data).thenReturn(instance(textAudio));
    when(audioDoc.id).thenReturn(id);

    return audioDoc;
  }

  get scriptureAudio(): DebugElement {
    return this.fixture.debugElement.query(By.css('#scriptureAudio'));
  }

  get questionAudio(): DebugElement {
    return this.fixture.debugElement.query(By.css('#questionAudio'));
  }

  get noQuestionAudioIcon(): DebugElement {
    return this.fixture.debugElement.query(By.css('#noQuestionAudio'));
  }

  async wait(ms: number = 200): Promise<void> {
    // Wait until this.scriptureAudio.audio is initialized if it exists
    const audio: AudioPlayer | undefined = this.scriptureAudio?.componentInstance?.audio;
    if (audio) {
      await lastValueFrom(audio.status$.pipe(takeWhile<AudioStatus>(val => val === AudioStatus.Initializing, true)));
    }

    await new Promise(resolve => this.ngZone.runOutsideAngular(() => setTimeout(resolve, ms)));
    this.fixture.detectChanges();
  }
}
