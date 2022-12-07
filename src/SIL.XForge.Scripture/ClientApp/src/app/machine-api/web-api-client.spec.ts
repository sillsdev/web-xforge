import { of, throwError } from 'rxjs';
import { deepEqual, instance, mock, when } from 'ts-mockito';
import { TranslationSources } from '@sillsdev/machine';
import { BuildDto } from './build-dto';
import { BuildStates } from './build-states';
import { EngineDto } from './engine-dto';
import { HttpClient } from './http-client';
import { WebApiClient } from './web-api-client';
import { WordGraphDto } from './word-graph-dto';

describe('WebApiClient', () => {
  it('get word graph', async () => {
    const env = new TestEnvironment();
    const sourceSegment = ['Esto', 'es', 'una', 'prueba', '.'];
    when(
      env.mockedHttpClient.post<WordGraphDto>(
        'translation/engines/project:project01/actions/getWordGraph',
        deepEqual(sourceSegment)
      )
    ).thenReturn(
      of({
        status: 200,
        data: {
          initialStateScore: -111.111,
          finalStates: [4],
          arcs: [
            {
              prevState: 0,
              nextState: 1,
              score: -11.11,
              words: ['This', 'is'],
              confidences: [0.4, 0.5],
              sourceSegmentRange: { start: 0, end: 2 },
              sources: [TranslationSources.Smt, TranslationSources.Smt],
              alignment: [
                { sourceIndex: 0, targetIndex: 0 },
                { sourceIndex: 1, targetIndex: 1 }
              ]
            },
            {
              prevState: 1,
              nextState: 2,
              score: -22.22,
              words: ['a'],
              confidences: [0.6],
              sourceSegmentRange: { start: 2, end: 3 },
              sources: [TranslationSources.Smt],
              alignment: [{ sourceIndex: 0, targetIndex: 0 }]
            },
            {
              prevState: 2,
              nextState: 3,
              score: 33.33,
              words: ['prueba'],
              confidences: [0],
              sourceSegmentRange: { start: 3, end: 4 },
              sources: [TranslationSources.None],
              alignment: [{ sourceIndex: 0, targetIndex: 0 }]
            },
            {
              prevState: 3,
              nextState: 4,
              score: -44.44,
              words: ['.'],
              confidences: [0.7],
              sourceSegmentRange: { start: 4, end: 5 },
              sources: [TranslationSources.Smt],
              alignment: [{ sourceIndex: 0, targetIndex: 0 }]
            }
          ]
        }
      })
    );

    const wordGraph = await env.client.getWordGraph('project01', sourceSegment);
    expect(wordGraph.initialStateScore).toEqual(-111.111);
    expect(Array.from(wordGraph.finalStates)).toEqual([4]);
    expect(wordGraph.arcs.length).toEqual(4);
    let arc = wordGraph.arcs[0];
    expect(arc.prevState).toEqual(0);
    expect(arc.nextState).toEqual(1);
    expect(arc.score).toEqual(-11.11);
    expect(arc.words).toEqual(['This', 'is']);
    expect(arc.wordConfidences).toEqual([0.4, 0.5]);
    expect(arc.sourceSegmentRange.start).toEqual(0);
    expect(arc.sourceSegmentRange.end).toEqual(2);
    expect(arc.wordSources).toEqual([TranslationSources.Smt, TranslationSources.Smt]);
    expect(arc.alignment.get(0, 0)).toBeTruthy();
    expect(arc.alignment.get(1, 1)).toBeTruthy();
    arc = wordGraph.arcs[2];
    expect(arc.wordSources).toEqual([TranslationSources.None]);
  });

  it('train with no errors', () => {
    const env = new TestEnvironment();
    env.addCreateBuild();
    env.addBuildProgress();

    let expectedStep = -1;
    env.client.train('project01').subscribe(
      progress => {
        expectedStep++;
        expect(progress.percentCompleted).toEqual(expectedStep / 10);
      },
      () => {},
      () => {
        expect(expectedStep).toEqual(10);
      }
    );
  });

  it('train with error while starting build', () => {
    const env = new TestEnvironment();
    when(env.mockedHttpClient.post<BuildDto>('translation/builds', JSON.stringify('engine01'))).thenReturn(
      throwError(new Error('Error while creating build.'))
    );

    env.client.train('project01').subscribe(
      () => {},
      err => expect(err.message).toEqual('Error while creating build.')
    );
  });

  it('train with error during build', () => {
    const env = new TestEnvironment();
    env.addCreateBuild();
    when(env.mockedHttpClient.get<BuildDto>(`translation/builds/id:build01?minRevision=1`)).thenReturn(
      of({
        status: 200,
        data: {
          id: 'build01',
          href: 'translation/builds/id:build01',
          revision: 1,
          engine: { id: 'engine01', href: 'translation/engines/id:engine01' },
          percentCompleted: 0.1,
          message: 'broken',
          state: BuildStates.Faulted
        }
      })
    );

    env.client.train('project01').subscribe(
      progress => expect(progress.percentCompleted).toEqual(0),
      err => expect(err.message).toEqual('Error occurred during build: broken')
    );
  });

  it('listen for training status with no errors', () => {
    const env = new TestEnvironment();
    when(env.mockedHttpClient.get<BuildDto>('translation/builds/engine:engine01?minRevision=0')).thenReturn(
      of({
        status: 200,
        data: {
          id: 'build01',
          href: 'translation/builds/id:build01',
          revision: 0,
          engine: { id: 'engine01', href: 'translation/engines/id:engine01' },
          percentCompleted: 0,
          message: '',
          state: BuildStates.Pending
        }
      })
    );
    env.addBuildProgress();

    let expectedStep = -1;
    env.client.listenForTrainingStatus('project01').subscribe(
      progress => {
        expectedStep++;
        expect(progress.percentCompleted).toEqual(expectedStep / 10);
      },
      () => {},
      () => {
        expect(expectedStep).toEqual(10);
      }
    );
  });
});

class TestEnvironment {
  readonly mockedHttpClient: HttpClient;
  readonly client: WebApiClient;

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
    this.client = new WebApiClient(instance(this.mockedHttpClient));
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
          state: BuildStates.Pending
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
            state: i === 10 ? BuildStates.Completed : BuildStates.Active
          }
        })
      );
    }
  }
}
