import { HttpErrorResponse, HttpStatusCode } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Canon } from '@sillsdev/scripture';
import { of, throwError } from 'rxjs';
import { first } from 'rxjs/operators';
import { BuildDto } from '../../machine-api/build-dto';
import { BuildStates } from '../../machine-api/build-states';
import { HttpClient } from '../../machine-api/http-client';
import { BuildConfig } from './draft-generation';
import { DraftGenerationService } from './draft-generation.service';

describe('DraftGenerationService', () => {
  let service: DraftGenerationService;
  let httpClient: HttpClient;
  let httpTestingController: HttpTestingController;

  const projectId = 'testProjectId';
  const buildDto: BuildDto = {
    id: 'testId',
    href: 'testHref',
    revision: 0,
    engine: {
      id: 'testEngineId',
      href: 'testEngineHref'
    },
    percentCompleted: 0,
    message: '',
    state: BuildStates.Queued,
    queueDepth: 0
  };

  beforeAll(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [DraftGenerationService, { provide: HttpClient, useValue: { get: () => of({}), post: () => of({}) } }]
    });

    service = TestBed.inject(DraftGenerationService);
    httpClient = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  describe('pollBuildProgress', () => {
    it('should poll build progress and return an observable of BuildDto', done => {
      httpClient.get = jasmine.createSpy().and.returnValue(of({ data: buildDto }));
      service
        .pollBuildProgress(projectId)
        .pipe(first())
        .subscribe(result => {
          expect(result).toEqual(buildDto);
          expect(httpClient.get).toHaveBeenCalledWith(`translation/builds/id:${projectId}?pretranslate=true`);
          done();
        });
    });
  });

  describe('getLastCompletedBuild', () => {
    it('should get last completed build and return an observable of BuildDto', done => {
      httpClient.get = jasmine.createSpy().and.returnValue(of({ data: buildDto }));
      service.getLastCompletedBuild(projectId).subscribe(result => {
        expect(result).toEqual(buildDto);
        expect(httpClient.get).toHaveBeenCalledWith(
          `translation/engines/project:${projectId}/actions/getLastCompletedPreTranslationBuild`
        );
        done();
      });
    });

    it('should return undefined when no build has ever completed', done => {
      httpClient.get = jasmine.createSpy().and.returnValue(of({ status: HttpStatusCode.NoContent }));
      service.getLastCompletedBuild(projectId).subscribe(result => {
        expect(result).toEqual(undefined);
        expect(httpClient.get).toHaveBeenCalledWith(
          `translation/engines/project:${projectId}/actions/getLastCompletedPreTranslationBuild`
        );
        done();
      });
    });
  });

  describe('getBuildProgress', () => {
    it('should get build progress and return an observable of BuildDto', done => {
      httpClient.get = jasmine.createSpy().and.returnValue(of({ data: buildDto }));
      service.getBuildProgress(projectId).subscribe(result => {
        expect(result).toEqual(buildDto);
        expect(httpClient.get).toHaveBeenCalledWith(`translation/builds/id:${projectId}?pretranslate=true`);
        done();
      });
    });

    it('should return faulted build', done => {
      const faultedBuild = { ...buildDto, state: BuildStates.Faulted };
      httpClient.get = jasmine.createSpy().and.returnValue(of({ data: faultedBuild }));
      service.getBuildProgress(projectId).subscribe(result => {
        expect(result).toEqual(faultedBuild);
        expect(httpClient.get).toHaveBeenCalledWith(`translation/builds/id:${projectId}?pretranslate=true`);
        done();
      });
    });
  });

  describe('startBuild', () => {
    it('should start a pretranslation build job and return an observable of BuildDto', done => {
      const spyGetBuildProgress = spyOn(service, 'getBuildProgress').and.returnValue(of(undefined));
      const spyPollBuildProgress = spyOn(service, 'pollBuildProgress').and.returnValue(of(buildDto));
      const buildConfig: BuildConfig = {
        projectId,
        trainingBooks: [],
        trainingDataFiles: [],
        translationBooks: [],
        fastTraining: false
      };
      httpClient.post = jasmine.createSpy().and.returnValue(of({ data: buildDto }));
      service
        .startBuildOrGetActiveBuild(buildConfig)
        .pipe(first())
        .subscribe(result => {
          expect(result).toEqual(buildDto);
          expect(spyGetBuildProgress).toHaveBeenCalledWith(projectId);
          expect(spyPollBuildProgress).toHaveBeenCalledWith(projectId);
          expect(httpClient.post).toHaveBeenCalledWith(`translation/pretranslations`, buildConfig);
          done();
        });
    });

    it('should return already active build job', done => {
      const spyGetBuildProgress = spyOn(service, 'getBuildProgress').and.returnValue(of(buildDto));
      const spyPollBuildProgress = spyOn(service, 'pollBuildProgress').and.returnValue(of(buildDto));
      const buildConfig: BuildConfig = {
        projectId,
        trainingBooks: [],
        trainingDataFiles: [],
        translationBooks: [],
        fastTraining: false
      };
      httpClient.post = jasmine.createSpy();
      service.startBuildOrGetActiveBuild(buildConfig).subscribe(result => {
        expect(result).toEqual(buildDto);
        expect(spyGetBuildProgress).toHaveBeenCalledWith(projectId);
        expect(spyPollBuildProgress).toHaveBeenCalledWith(projectId);
        expect(httpClient.post).not.toHaveBeenCalled();
        done();
      });
    });
  });

  describe('cancelBuild', () => {
    it('should cancel a pretranslation build job and return an empty observable', done => {
      httpClient.post = jasmine.createSpy().and.returnValue(of({ data: {} }));
      service.cancelBuild(projectId).subscribe(() => {
        expect(httpClient.post).toHaveBeenCalledWith(`translation/pretranslations/cancel`, JSON.stringify(projectId));
        done();
      });
    });
  });

  describe('getGeneratedDraft', () => {
    it('should get the pretranslations for the specified book/chapter and return an observable of DraftSegmentMap', done => {
      const book = 43;
      const chapter = 3;
      const preTranslationData = {
        data: {
          preTranslations: [
            { reference: 'verse_3_16', translation: 'For God so loved the world' },
            { reference: 'verse_1_1', translation: 'In the beginning was the Word' }
          ]
        }
      };

      httpClient.get = jasmine.createSpy().and.returnValue(of(preTranslationData));
      service.getGeneratedDraft(projectId, book, chapter).subscribe(result => {
        expect(result).toEqual({
          verse_3_16: 'For God so loved the world ',
          verse_1_1: 'In the beginning was the Word '
        });
        expect(httpClient.get).toHaveBeenCalledWith(
          `translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}`
        );
        done();
      });
    });

    it('should handle empty preTranslations array', done => {
      const book = 43;
      const chapter = 3;
      const preTranslationData = {
        data: {
          preTranslations: []
        }
      };

      httpClient.get = jasmine.createSpy().and.returnValue(of(preTranslationData));
      service.getGeneratedDraft(projectId, book, chapter).subscribe(result => {
        expect(result).toEqual({});
        expect(httpClient.get).toHaveBeenCalledWith(
          `translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}`
        );
        done();
      });
    });
  });

  describe('getGeneratedDraftDeltaOperations', () => {
    it('should get the pretranslation ops for the specified book/chapter and return an observable', done => {
      const book = 43;
      const chapter = 3;
      const ops = [
        {
          insert: {
            chapter: {
              number: '1',
              style: 'c'
            }
          }
        },
        {
          insert: {
            verse: {
              number: '1',
              style: 'v'
            }
          }
        },
        {
          insert: 'Verse 1 Contents',
          attributes: {
            segment: 'verse_1_1'
          }
        }
      ];
      const preTranslationDeltaData = {
        data: {
          id: `${projectId}:${Canon.bookNumberToId(book)}:${chapter}:target`,
          version: 0,
          data: {
            ops
          }
        }
      };

      httpClient.get = jasmine.createSpy().and.returnValue(of(preTranslationDeltaData));
      service.getGeneratedDraftDeltaOperations(projectId, book, chapter).subscribe(result => {
        expect(result).toEqual(ops);
        expect(httpClient.get).toHaveBeenCalledWith(
          `translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}/delta`
        );
        done();
      });
    });

    it('should return an empty array for missing data', done => {
      const book = 43;
      const chapter = 3;
      const preTranslationDeltaData = {
        data: undefined
      };

      httpClient.get = jasmine.createSpy().and.returnValue(of(preTranslationDeltaData));
      service.getGeneratedDraftDeltaOperations(projectId, book, chapter).subscribe(result => {
        expect(result).toEqual([]);
        expect(httpClient.get).toHaveBeenCalledWith(
          `translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}/delta`
        );
        done();
      });
    });

    it('should return an empty array for a 404 error', done => {
      const book = 43;
      const chapter = 3;
      httpClient.get = jasmine
        .createSpy()
        .and.returnValue(throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' })));
      service.getGeneratedDraftDeltaOperations(projectId, book, chapter).subscribe(result => {
        expect(result).toEqual([]);
        expect(httpClient.get).toHaveBeenCalledWith(
          `translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}/delta`
        );
        done();
      });
    });

    it('should throw a 405 error', done => {
      const book = 43;
      const chapter = 3;
      httpClient.get = jasmine
        .createSpy()
        .and.returnValue(throwError(() => new HttpErrorResponse({ status: 405, statusText: 'Not Allowed' })));
      service.getGeneratedDraftDeltaOperations(projectId, book, chapter).subscribe({
        error: (err: HttpErrorResponse) => {
          expect(err.status).toEqual(405);
          expect(err.statusText).toEqual('Not Allowed');
          expect(httpClient.get).toHaveBeenCalledWith(
            `translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}/delta`
          );
          done();
        }
      });
    });
  });

  describe('draftExists', () => {
    it('should return true if draft exists', done => {
      const preTranslationData = {
        data: {
          preTranslations: [
            { reference: 'verse_3_16', translation: 'For God so loved the world' },
            { reference: 'verse_1_1', translation: 'In the beginning was the Word' }
          ]
        }
      };

      httpClient.get = jasmine.createSpy().and.returnValue(of(preTranslationData));
      service.draftExists(projectId, 43, 3).subscribe(result => {
        expect(result).toBe(true);
        done();
      });
    });

    it('should return false if draft does not exist', done => {
      const preTranslationData = {
        data: {
          preTranslations: []
        }
      };

      httpClient.get = jasmine.createSpy().and.returnValue(of(preTranslationData));
      service.draftExists(projectId, 43, 3).subscribe(result => {
        expect(result).toBe(false);
        done();
      });
    });
  });
});
