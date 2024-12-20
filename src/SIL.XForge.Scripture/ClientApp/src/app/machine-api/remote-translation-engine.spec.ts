import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { NgModule, NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslationSources, WordGraph } from '@sillsdev/machine';
import { of, throwError } from 'rxjs';
import { anything, instance, mock, when } from 'ts-mockito';
import { NoticeService } from 'xforge-common/notice.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { BuildDto } from './build-dto';
import { BuildStates } from './build-states';
import { EngineDto } from './engine-dto';
import { HttpClient } from './http-client';
import { RemoteTranslationEngine } from './remote-translation-engine';
import { SegmentPairDto } from './segment-pair-dto';
import { TranslationResultDto } from './translation-result-dto';
import { TranslationSource } from './translation-source';
import { WordGraphDto } from './word-graph-dto';

describe('RemoteTranslationEngine', () => {
  configureTestingModule(() => ({
    imports: [TestModule, TestTranslocoModule]
  }));

  it('get word graph', async () => {
    const env = new TestEnvironment();
    const sourceTokens = ['Esto', 'es', 'una', 'prueba', '.'];
    const sourceSegment = 'Esto es una prueba.';
    when(
      env.mockedHttpClient.post<WordGraphDto>(
        'translation/engines/project:project01/actions/getWordGraph',
        JSON.stringify(sourceSegment)
      )
    ).thenReturn(
      of({
        status: 200,
        data: env.getWordGraph(sourceTokens)
      })
    );

    // SUT
    const wordGraph = await env.client.getWordGraph(sourceSegment);
    env.verifyWordGraphAssertions(wordGraph, sourceTokens);
  });

  it('get word graph duplicate queued request', async () => {
    const env = new TestEnvironment();
    const sourceTokens = ['Esto', 'es', 'una', 'prueba', '.'];
    const sourceSegment = 'Esto es una prueba.';

    // Mock that a word graph request is already queued.
    // This mocks the promise of executeGetWordGraphRequest()
    env.client['pendingWordGraphRequests'].set(
      sourceSegment,
      Promise.resolve(env.client['createWordGraph'](env.getWordGraph(sourceTokens)))
    );

    // SUT
    const wordGraph = await env.client.getWordGraph(sourceSegment);
    env.verifyWordGraphAssertions(wordGraph, sourceTokens);
  });

  it('get stats is successful when engine exists', async () => {
    const env = new TestEnvironment();

    const stats = await env.client.getStats();
    expect(stats.confidence).toEqual(0.2);
    expect(stats.trainedSegmentCount).toEqual(100);
  });

  it('get stats is successful when engine is not found', async () => {
    const env = new TestEnvironment();

    when(env.mockedHttpClient.get<EngineDto>('translation/engines/project:project01')).thenReturn(
      throwError(() => new HttpErrorResponse({ status: 404 }))
    );

    const stats = await env.client.getStats();
    expect(stats.confidence).toEqual(0);
    expect(stats.trainedSegmentCount).toEqual(0);
  });

  it('start training is successful when engine exists', async () => {
    const env = new TestEnvironment();
    env.addCreateBuild();

    when(env.mockedHttpClient.post<BuildDto>('translation/builds', JSON.stringify('project01'))).thenReturn(
      of({ status: 200 })
    );

    await env.client.startTraining();
    expect().nothing();
  });

  it('start training is successful when engine is not found', async () => {
    const env = new TestEnvironment();
    env.addCreateBuild();

    when(env.mockedHttpClient.post<BuildDto>('translation/builds', JSON.stringify('project01'))).thenReturn(
      throwError(() => new HttpErrorResponse({ status: 404 }))
    );

    await env.client.startTraining();
    expect().nothing();
  });

  it('train with no errors', () => {
    const env = new TestEnvironment();
    env.addCreateBuild();
    env.addBuildProgress();

    let expectedStep = -1;
    env.client.train().subscribe({
      next: progress => {
        expectedStep++;
        expect(progress.percentCompleted).toEqual(expectedStep / 10);
      },
      error: () => {},
      complete: () => {
        expect(expectedStep).toEqual(10);
      }
    });
  });

  it('train with error while starting build', () => {
    const env = new TestEnvironment();
    when(env.mockedHttpClient.post<BuildDto>('translation/builds', JSON.stringify('engine01'))).thenReturn(
      throwError(() => new Error('Error while creating build.'))
    );

    env.client.train().subscribe({
      next: () => {},
      error: err => expect(err.message).toEqual('Error while creating build.')
    });
  });

  it('train with 404 error during build', () => {
    const env = new TestEnvironment();
    env.addCreateBuild();
    when(env.mockedHttpClient.get<BuildDto>('translation/builds/id:build01?minRevision=1')).thenReturn(
      throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' }))
    );

    env.client.train().subscribe({
      next: progress => expect(progress.percentCompleted).toEqual(0),
      error: err => expect(err.message).toContain('404 Not Found')
    });
  });

  it('train with error during build', () => {
    const env = new TestEnvironment();
    env.addCreateBuild();
    when(env.mockedHttpClient.get<BuildDto>('translation/builds/id:build01?minRevision=1')).thenReturn(
      of({
        status: 200,
        data: {
          id: 'build01',
          href: 'translation/builds/id:build01',
          revision: 1,
          engine: { id: 'engine01', href: 'translation/engines/id:engine01' },
          percentCompleted: 0.1,
          message: 'broken',
          state: BuildStates.Faulted,
          queueDepth: 0
        }
      })
    );

    env.client.train().subscribe({
      next: progress => expect(progress.percentCompleted).toEqual(0),
      error: err => expect(err.message).toEqual('Error occurred during build: broken')
    });
  });

  it('train segment executes successfully', async () => {
    const env = new TestEnvironment();
    let sourceSegment = 'source';
    let targetSegment = 'target';
    let remoteMethodCalled = false;
    when(
      env.mockedHttpClient.post<SegmentPairDto>(
        'translation/engines/project:project01/actions/trainSegment',
        anything()
      )
    ).thenCall((_, dto: SegmentPairDto) => {
      remoteMethodCalled = true;
      expect(dto.sourceSegment).toBe(sourceSegment);
      expect(dto.targetSegment).toBe(targetSegment);
      expect(dto.sentenceStart).toBe(true);
      return of({ status: 200 });
    });

    await env.client.trainSegment(sourceSegment, targetSegment);
    expect(remoteMethodCalled).toBe(true);
  });

  it('translate executes successfully', async () => {
    const env = new TestEnvironment();
    const confidences = [0.1, 0.2, 0.3, 0.4, 0.5];
    const sourceTokens = ['Esto', 'es', 'una', 'prueba', '.'];
    const sourceSegment = 'Esto es una prueba.';
    const translation = 'This is a test.';
    const targetTokens = ['This', 'is', 'a', 'test', '.'];
    when(
      env.mockedHttpClient.post<TranslationResultDto>(
        'translation/engines/project:project01/actions/translate',
        JSON.stringify(sourceSegment)
      )
    ).thenReturn(
      of({
        status: 200,
        data: {
          alignment: [
            { sourceIndex: 0, targetIndex: 0 },
            { sourceIndex: 1, targetIndex: 1 },
            { sourceIndex: 2, targetIndex: 2 },
            { sourceIndex: 3, targetIndex: 3 },
            { sourceIndex: 4, targetIndex: 4 }
          ],
          confidences: confidences,
          phrases: [
            { sourceSegmentStart: 0, sourceSegmentEnd: 1, targetSegmentCut: 2 },
            { sourceSegmentStart: 1, sourceSegmentEnd: 2, targetSegmentCut: 3 },
            { sourceSegmentStart: 2, sourceSegmentEnd: 3, targetSegmentCut: 4 },
            { sourceSegmentStart: 3, sourceSegmentEnd: 4, targetSegmentCut: 5 },
            { sourceSegmentStart: 4, sourceSegmentEnd: 5, targetSegmentCut: 6 }
          ],
          sources: [
            [TranslationSource.Primary],
            [TranslationSource.Secondary],
            [TranslationSource.Human],
            [TranslationSource.Primary, TranslationSource.Secondary],
            [TranslationSource.Primary, TranslationSource.Secondary, TranslationSource.Human]
          ],
          sourceTokens: sourceTokens,
          targetTokens: targetTokens,
          translation: translation
        }
      })
    );

    const translationResult = await env.client.translate(sourceSegment);
    expect(translationResult.alignment.columnCount).toEqual(5);
    expect(translationResult.alignment.rowCount).toEqual(5);
    expect(translationResult.confidences).toEqual(confidences);
    expect(translationResult.phrases.length).toEqual(5);
    for (let i = 0; i < translationResult.phrases.length; i++) {
      expect(translationResult.phrases[i].sourceSegmentRange.start).toEqual(i);
      expect(translationResult.phrases[i].sourceSegmentRange.end).toEqual(i + 1);
      expect(translationResult.phrases[i].targetSegmentCut).toEqual(i + 2);
    }
    expect(translationResult.sourceTokens).toEqual(sourceTokens);
    expect(translationResult.sources.length).toEqual(5);
    expect(translationResult.sources[0]).toEqual(TranslationSources.Smt);
    expect(translationResult.sources[1]).toEqual(TranslationSources.Transfer);
    expect(translationResult.sources[2]).toEqual(TranslationSources.Prefix);
    expect(translationResult.sources[3]).toEqual(TranslationSources.Smt + TranslationSources.Transfer);
    expect(translationResult.sources[4]).toEqual(
      TranslationSources.Smt + TranslationSources.Transfer + TranslationSources.Prefix
    );
    expect(translationResult.targetTokens).toEqual(targetTokens);
    expect(translationResult.translation).toEqual(translation);
  });

  it('translate n executes successfully', async () => {
    const env = new TestEnvironment();
    const n = 1;
    const confidences = [0.1, 0.2, 0.3, 0.4, 0.5];
    const sourceTokens = ['Esto', 'es', 'una', 'prueba', '.'];
    const sourceSegment = 'Esto es una prueba.';
    const translation = 'This is a test.';
    const targetTokens = ['This', 'is', 'a', 'test', '.'];
    when(
      env.mockedHttpClient.post<TranslationResultDto[]>(
        'translation/engines/project:project01/actions/translate/1',
        JSON.stringify(sourceSegment)
      )
    ).thenReturn(
      of({
        status: 200,
        data: [
          {
            alignment: [
              { sourceIndex: 0, targetIndex: 0 },
              { sourceIndex: 1, targetIndex: 1 },
              { sourceIndex: 2, targetIndex: 2 },
              { sourceIndex: 3, targetIndex: 3 },
              { sourceIndex: 4, targetIndex: 4 }
            ],
            confidences: confidences,
            phrases: [
              { sourceSegmentStart: 0, sourceSegmentEnd: 1, targetSegmentCut: 2 },
              { sourceSegmentStart: 1, sourceSegmentEnd: 2, targetSegmentCut: 3 },
              { sourceSegmentStart: 2, sourceSegmentEnd: 3, targetSegmentCut: 4 },
              { sourceSegmentStart: 3, sourceSegmentEnd: 4, targetSegmentCut: 5 },
              { sourceSegmentStart: 4, sourceSegmentEnd: 5, targetSegmentCut: 6 }
            ],
            sources: [
              [TranslationSource.Primary],
              [TranslationSource.Secondary],
              [TranslationSource.Human],
              [TranslationSource.Primary, TranslationSource.Secondary],
              [TranslationSource.Primary, TranslationSource.Secondary, TranslationSource.Human]
            ],
            sourceTokens: sourceTokens,
            targetTokens: targetTokens,
            translation: translation
          }
        ]
      })
    );

    const translationResults = await env.client.translateN(n, sourceSegment);
    expect(translationResults.length).toEqual(n);
    expect(translationResults[0].alignment.columnCount).toEqual(5);
    expect(translationResults[0].alignment.rowCount).toEqual(5);
    expect(translationResults[0].confidences).toEqual(confidences);
    expect(translationResults[0].phrases.length).toEqual(5);
    for (let i = 0; i < translationResults[0].phrases.length; i++) {
      expect(translationResults[0].phrases[i].sourceSegmentRange.start).toEqual(i);
      expect(translationResults[0].phrases[i].sourceSegmentRange.end).toEqual(i + 1);
      expect(translationResults[0].phrases[i].targetSegmentCut).toEqual(i + 2);
    }
    expect(translationResults[0].sourceTokens).toEqual(sourceTokens);
    expect(translationResults[0].sources.length).toEqual(5);
    expect(translationResults[0].sources[0]).toEqual(TranslationSources.Smt);
    expect(translationResults[0].sources[1]).toEqual(TranslationSources.Transfer);
    expect(translationResults[0].sources[2]).toEqual(TranslationSources.Prefix);
    expect(translationResults[0].sources[3]).toEqual(TranslationSources.Smt + TranslationSources.Transfer);
    expect(translationResults[0].sources[4]).toEqual(
      TranslationSources.Smt + TranslationSources.Transfer + TranslationSources.Prefix
    );
    expect(translationResults[0].targetTokens).toEqual(targetTokens);
    expect(translationResults[0].translation).toEqual(translation);
  });

  it('listen for training status with 404 error', () => {
    const env = new TestEnvironment();
    env.addCreateBuild();
    let errorThrown = false;
    when(env.mockedHttpClient.get<BuildDto>('translation/builds/id:engine01?minRevision=0')).thenCall(() => {
      errorThrown = true;
      throwError(() => new HttpErrorResponse({ status: 404 }));
    });

    env.client.listenForTrainingStatus().subscribe({
      next: progress => throwError(() => new Error(`This should not be called. Progress: ${progress}`)),
      error: err => throwError(() => err)
    });
    expect(errorThrown).toBe(true);
  });

  it('listen for training status with no errors', () => {
    const env = new TestEnvironment();
    when(env.mockedHttpClient.get<BuildDto>('translation/builds/id:engine01?minRevision=0')).thenReturn(
      of({
        status: 200,
        data: {
          id: 'build01',
          href: 'translation/builds/id:build01',
          revision: 0,
          engine: { id: 'engine01', href: 'translation/engines/id:engine01' },
          percentCompleted: 0,
          message: '',
          state: BuildStates.Pending,
          queueDepth: 0
        }
      })
    );
    env.addBuildProgress();

    let expectedStep = -1;
    env.client.listenForTrainingStatus().subscribe({
      next: progress => {
        expectedStep++;
        expect(progress.percentCompleted).toEqual(expectedStep / 10);
      },
      error: () => {},
      complete: () => {
        expect(expectedStep).toEqual(10);
      }
    });
  });

  it('sends notice when getWordGraph has error', async function () {
    const env = new TestEnvironment();
    const sourceSegment = 'Esto es una prueba.';
    when(
      env.mockedHttpClient.post<WordGraphDto>(
        'translation/engines/project:project01/actions/getWordGraph',
        JSON.stringify(sourceSegment)
      )
    ).thenThrow(new Error());

    env.wait();

    const result: WordGraph = await env.client.getWordGraph(sourceSegment);
    expect(result.isEmpty).toBeTruthy();
  });
});

@NgModule({
  imports: [CommonModule, UICommonModule, TestTranslocoModule]
})
class TestModule {}

class TestEnvironment {
  readonly mockedHttpClient: HttpClient;
  readonly client: RemoteTranslationEngine;
  readonly mockedNoticeService: NoticeService;
  readonly mockedRouter: Router;
  readonly ngZone: NgZone;

  constructor() {
    this.mockedHttpClient = mock(HttpClient);
    when(this.mockedHttpClient.get<EngineDto>('translation/engines/project:project01')).thenReturn(
      of({
        status: 200,
        data: {
          id: 'engine01',
          href: 'translation/engines/id:engine01',
          sourceLanguageTag: 'en',
          targetLanguageTag: 'es',
          isShared: false,
          projects: [{ id: 'project01', href: 'translation/projects/id:project01' }],
          confidence: 0.2,
          trainedSegmentCount: 100
        }
      })
    );
    this.mockedNoticeService = mock(NoticeService);
    this.mockedRouter = mock(Router);
    this.client = new RemoteTranslationEngine(
      'project01',
      instance(this.mockedHttpClient),
      instance(this.mockedNoticeService),
      instance(this.mockedRouter)
    );

    this.ngZone = TestBed.inject(NgZone);
  }

  addCreateBuild(): void {
    when(this.mockedHttpClient.post<BuildDto>('translation/builds', JSON.stringify('engine01'))).thenReturn(
      of({
        status: 201,
        data: {
          id: 'build01',
          href: 'translation/builds/id:build01',
          revision: 0,
          engine: { id: 'engine01', href: 'translation/engines/id:engine01' },
          percentCompleted: 0,
          message: '',
          state: BuildStates.Pending,
          queueDepth: 0
        }
      })
    );
  }

  addBuildProgress(): void {
    for (let i = 1; i <= 10; i++) {
      when(this.mockedHttpClient.get<BuildDto>(`translation/builds/id:build01?minRevision=${i}`)).thenReturn(
        of({
          status: 200,
          data: {
            id: 'build01',
            href: 'translation/builds/id:build01',
            revision: i,
            engine: { id: 'engine01', href: 'translation/engines/id:engine01' },
            percentCompleted: i / 10,
            message: '',
            state: i === 10 ? BuildStates.Completed : BuildStates.Active,
            queueDepth: 0
          }
        })
      );
    }
  }

  getWordGraph(sourceTokens: string[]): WordGraphDto {
    return {
      sourceTokens,
      initialStateScore: -111.111,
      finalStates: [4],
      arcs: [
        {
          prevState: 0,
          nextState: 1,
          score: -11.11,
          targetTokens: ['This', 'is'],
          confidences: [0.4, 0.5],
          sourceSegmentStart: 0,
          sourceSegmentEnd: 2,
          sources: [[TranslationSource.Primary], [TranslationSource.Secondary], [TranslationSource.Human]],
          alignment: [
            { sourceIndex: 0, targetIndex: 0 },
            { sourceIndex: 1, targetIndex: 1 }
          ]
        },
        {
          prevState: 1,
          nextState: 2,
          score: -22.22,
          targetTokens: ['a'],
          confidences: [0.6],
          sourceSegmentStart: 2,
          sourceSegmentEnd: 3,
          sources: [[TranslationSource.Primary]],
          alignment: [{ sourceIndex: 0, targetIndex: 0 }]
        },
        {
          prevState: 2,
          nextState: 3,
          score: 33.33,
          targetTokens: ['prueba'],
          confidences: [0],
          sourceSegmentStart: 3,
          sourceSegmentEnd: 4,
          sources: [[]],
          alignment: [{ sourceIndex: 0, targetIndex: 0 }]
        },
        {
          prevState: 3,
          nextState: 4,
          score: -44.44,
          targetTokens: ['.'],
          confidences: [0.7],
          sourceSegmentStart: 4,
          sourceSegmentEnd: 5,
          sources: [[TranslationSource.Primary]],
          alignment: [{ sourceIndex: 0, targetIndex: 0 }]
        }
      ]
    };
  }

  verifyWordGraphAssertions(wordGraph: WordGraph, sourceTokens: string[]): void {
    expect(wordGraph.initialStateScore).toEqual(-111.111);
    expect(wordGraph.sourceTokens).toEqual(sourceTokens);
    expect(Array.from(wordGraph.finalStates)).toEqual([4]);
    expect(wordGraph.arcs.length).toEqual(4);

    let arc = wordGraph.arcs[0];
    expect(arc.prevState).toEqual(0);
    expect(arc.nextState).toEqual(1);
    expect(arc.score).toEqual(-11.11);
    expect(arc.targetTokens).toEqual(['This', 'is']);
    expect(arc.confidences).toEqual([0.4, 0.5]);
    expect(arc.sourceSegmentRange.start).toEqual(0);
    expect(arc.sourceSegmentRange.end).toEqual(2);
    expect(arc.sources).toEqual([TranslationSources.Smt, TranslationSources.Transfer, TranslationSources.Prefix]);
    expect(arc.alignment.get(0, 0)).toBe(true);
    expect(arc.alignment.get(1, 1)).toBe(true);

    arc = wordGraph.arcs[2];
    expect(arc.sources).toEqual([TranslationSources.None]);
  }

  async wait(ms: number = 500): Promise<void> {
    await new Promise(resolve => this.ngZone.runOutsideAngular(() => setTimeout(resolve, ms)));
  }
}
