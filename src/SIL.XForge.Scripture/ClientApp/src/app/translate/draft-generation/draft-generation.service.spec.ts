import { HttpErrorResponse, HttpStatusCode } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Canon } from '@sillsdev/scripture';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { first } from 'rxjs/operators';
import { mock } from 'ts-mockito';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { BuildDto } from '../../machine-api/build-dto';
import { BuildStates } from '../../machine-api/build-states';
import { MACHINE_API_BASE_URL } from '../../machine-api/http-client';
import { BuildConfig } from './draft-generation';
import { DraftGenerationService } from './draft-generation.service';

describe('DraftGenerationService', () => {
  const mockNoticeService = mock(NoticeService);

  let service: DraftGenerationService;
  let httpTestingController: HttpTestingController;
  let testOnlineStatusService: TestOnlineStatusService;

  configureTestingModule(() => ({
    imports: [NoopAnimationsModule, TestOnlineStatusModule.forRoot(), TestTranslocoModule, UICommonModule],
    providers: [
      DraftGenerationService,
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: NoticeService, useMock: mockNoticeService }
    ]
  }));

  const projectId = 'testProjectId';
  const buildConfig: BuildConfig = {
    projectId,
    trainingBooks: [],
    trainingDataFiles: [],
    translationBooks: [],
    fastTraining: false
  };
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

  beforeEach(() => {
    service = TestBed.inject(DraftGenerationService);
    httpTestingController = TestBed.inject(HttpTestingController);
    testOnlineStatusService = TestBed.inject(OnlineStatusService) as TestOnlineStatusService;
    spyOn(saveAs, 'saveAs').and.stub();
    spyOn(JSZip.prototype, 'generateAsync').and.returnValue(Promise.resolve('blob data'));
  });

  afterEach(() => {
    testOnlineStatusService.setIsOnline(true);
  });

  describe('pollBuildProgress', () => {
    it('should poll build progress and return an observable of BuildDto', fakeAsync(() => {
      // SUT
      service
        .pollBuildProgress(projectId)
        .pipe(first())
        .subscribe(result => {
          expect(result).toEqual(buildDto);
        });
      tick();

      // Setup the HTTP request
      const req = httpTestingController.expectOne(
        `${MACHINE_API_BASE_URL}translation/builds/id:${projectId}?pretranslate=true`
      );
      expect(req.request.method).toEqual('GET');
      req.flush(buildDto);
      tick();
    }));

    it('should return undefined if offline', fakeAsync(() => {
      testOnlineStatusService.setIsOnline(false);

      // SUT
      service
        .pollBuildProgress(projectId)
        .pipe(first())
        .subscribe(result => {
          expect(result).toBeUndefined();
        });
      tick();
    }));
  });

  describe('getLastCompletedBuild', () => {
    it('should get last completed build and return an observable of BuildDto', fakeAsync(() => {
      // SUT
      service.getLastCompletedBuild(projectId).subscribe(result => {
        expect(result).toEqual(buildDto);
      });
      tick();

      // Setup the HTTP request
      const req = httpTestingController.expectOne(
        `${MACHINE_API_BASE_URL}translation/engines/project:${projectId}/actions/getLastCompletedPreTranslationBuild`
      );
      expect(req.request.method).toEqual('GET');
      req.flush(buildDto);
      tick();
    }));

    it('should return undefined when no build has ever completed', fakeAsync(() => {
      // SUT
      service.getLastCompletedBuild(projectId).subscribe(result => {
        expect(result).toBeUndefined();
      });
      tick();

      // Setup the HTTP request
      const req = httpTestingController.expectOne(
        `${MACHINE_API_BASE_URL}translation/engines/project:${projectId}/actions/getLastCompletedPreTranslationBuild`
      );
      expect(req.request.method).toEqual('GET');
      req.flush(null, { status: HttpStatusCode.NoContent, statusText: 'No Content' });
      tick();
    }));

    it('should return undefined if offline', fakeAsync(() => {
      testOnlineStatusService.setIsOnline(false);

      // SUT
      service.getLastCompletedBuild(projectId).subscribe(result => {
        expect(result).toBeUndefined();
      });
      tick();
    }));
  });

  describe('getBuildProgress', () => {
    it('should get build progress and return an observable of BuildDto', fakeAsync(() => {
      // SUT
      service.getBuildProgress(projectId).subscribe(result => {
        expect(result).toEqual(buildDto);
      });
      tick();

      // Setup the HTTP request
      const req = httpTestingController.expectOne(
        `${MACHINE_API_BASE_URL}translation/builds/id:${projectId}?pretranslate=true`
      );
      expect(req.request.method).toEqual('GET');
      req.flush(buildDto);
      tick();
    }));

    it('should return faulted build', fakeAsync(() => {
      // SUT
      const faultedBuild = { ...buildDto, state: BuildStates.Faulted };
      service.getBuildProgress(projectId).subscribe(result => {
        expect(result).toEqual(faultedBuild);
      });
      tick();

      // Setup the HTTP request
      const req = httpTestingController.expectOne(
        `${MACHINE_API_BASE_URL}translation/builds/id:${projectId}?pretranslate=true`
      );
      expect(req.request.method).toEqual('GET');
      req.flush(faultedBuild);
      tick();
    }));

    it('should return undefined if offline', fakeAsync(() => {
      testOnlineStatusService.setIsOnline(false);

      // SUT
      service.getBuildProgress(projectId).subscribe(result => {
        expect(result).toBeUndefined();
      });
      tick();
    }));
  });

  describe('startBuildOrGetActiveBuild', () => {
    it('should start a pre-translation build job and return an observable of BuildDto', fakeAsync(() => {
      const spyGetBuildProgress = spyOn(service, 'getBuildProgress').and.returnValue(of(undefined));
      const spyPollBuildProgress = spyOn(service, 'pollBuildProgress').and.returnValue(of(buildDto));

      // SUT
      service
        .startBuildOrGetActiveBuild(buildConfig)
        .pipe(first())
        .subscribe(result => {
          expect(result).toEqual(buildDto);
          expect(spyGetBuildProgress).toHaveBeenCalledWith(projectId);
          expect(spyPollBuildProgress).toHaveBeenCalledWith(projectId);
        });
      tick();

      // Setup the HTTP request
      const req = httpTestingController.expectOne(`${MACHINE_API_BASE_URL}translation/pretranslations`);
      expect(req.request.method).toEqual('POST');
      expect(req.request.body).toEqual(buildConfig);
      req.flush(buildDto);
      tick();
    }));

    it('should return already active build job', fakeAsync(() => {
      const spyGetBuildProgress = spyOn(service, 'getBuildProgress').and.returnValue(of(buildDto));
      const spyPollBuildProgress = spyOn(service, 'pollBuildProgress').and.returnValue(of(buildDto));

      // SUT
      service.startBuildOrGetActiveBuild(buildConfig).subscribe(result => {
        expect(result).toEqual(buildDto);
        expect(spyGetBuildProgress).toHaveBeenCalledWith(projectId);
        expect(spyPollBuildProgress).toHaveBeenCalledWith(projectId);
      });
      tick();

      // Verify the absence of an HTTP request
      httpTestingController.expectNone(`${MACHINE_API_BASE_URL}translation/pretranslations`);
      tick();
    }));
  });

  describe('cancelBuild', () => {
    it('should cancel a pre-translation build job and return an empty observable', fakeAsync(() => {
      // SUT
      service.cancelBuild(projectId).subscribe(() => {});
      tick();

      // Setup the HTTP request
      const req = httpTestingController.expectOne(`${MACHINE_API_BASE_URL}translation/pretranslations/cancel`);
      expect(req.request.method).toEqual('POST');
      expect(req.request.body).toEqual(JSON.stringify(projectId));
      req.flush({});
      tick();
    }));
  });

  describe('getGeneratedDraft', () => {
    it('should get the pre-translations for the specified book/chapter and return an observable of DraftSegmentMap', fakeAsync(() => {
      const book = 43;
      const chapter = 3;
      const preTranslationData = {
        preTranslations: [
          { reference: 'verse_3_16', translation: 'For God so loved the world' },
          { reference: 'verse_1_1', translation: 'In the beginning was the Word' }
        ]
      };

      // SUT
      service.getGeneratedDraft(projectId, book, chapter).subscribe(result => {
        expect(result).toEqual({
          verse_3_16: 'For God so loved the world ',
          verse_1_1: 'In the beginning was the Word '
        });
      });
      tick();

      // Setup the HTTP request
      const req = httpTestingController.expectOne(
        `${MACHINE_API_BASE_URL}translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}`
      );
      expect(req.request.method).toEqual('GET');
      req.flush(preTranslationData);
      tick();
    }));

    it('should handle empty preTranslations array', fakeAsync(() => {
      const book = 43;
      const chapter = 3;
      const preTranslationData = {
        preTranslations: []
      };

      // SUT
      service.getGeneratedDraft(projectId, book, chapter).subscribe(result => {
        expect(result).toEqual({});
      });
      tick();

      // Setup the HTTP request
      const req = httpTestingController.expectOne(
        `${MACHINE_API_BASE_URL}translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}`
      );
      expect(req.request.method).toEqual('GET');
      req.flush(preTranslationData);
      tick();
    }));

    it('should return an empty value if offline', fakeAsync(() => {
      const book = 43;
      const chapter = 3;
      testOnlineStatusService.setIsOnline(false);

      // SUT
      service.getGeneratedDraft(projectId, book, chapter).subscribe(result => {
        expect(result).toEqual({});
      });
      tick();
    }));
  });

  describe('getGeneratedDraftDeltaOperations', () => {
    it('should get the pre-translation ops for the specified book/chapter and return an observable', fakeAsync(() => {
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
        id: `${projectId}:${Canon.bookNumberToId(book)}:${chapter}:target`,
        version: 0,
        data: {
          ops
        }
      };

      // SUT
      service.getGeneratedDraftDeltaOperations(projectId, book, chapter).subscribe(result => {
        expect(result).toEqual(ops);
      });
      tick();

      // Setup the HTTP request
      const req = httpTestingController.expectOne(
        `${MACHINE_API_BASE_URL}translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}/delta`
      );
      expect(req.request.method).toEqual('GET');
      req.flush(preTranslationDeltaData);
      tick();
    }));

    it('should return an empty array for missing data', fakeAsync(() => {
      const book = 43;
      const chapter = 3;

      // SUT
      service.getGeneratedDraftDeltaOperations(projectId, book, chapter).subscribe(result => {
        expect(result).toEqual([]);
      });
      tick();

      // Setup the HTTP request
      const req = httpTestingController.expectOne(
        `${MACHINE_API_BASE_URL}translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}/delta`
      );
      expect(req.request.method).toEqual('GET');
      req.flush(null);
      tick();
    }));

    it('should return an empty array for a 404 error', fakeAsync(() => {
      const book = 43;
      const chapter = 3;

      // SUT
      service.getGeneratedDraftDeltaOperations(projectId, book, chapter).subscribe(result => {
        expect(result).toEqual([]);
      });
      tick();

      // Setup the HTTP request
      const req = httpTestingController.expectOne(
        `${MACHINE_API_BASE_URL}translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}/delta`
      );
      expect(req.request.method).toEqual('GET');
      req.flush(null, { status: HttpStatusCode.NotFound, statusText: 'Not Found' });
      tick();
    }));

    it('should throw a 405 error', fakeAsync(() => {
      const book = 43;
      const chapter = 3;

      // SUT
      service.getGeneratedDraftDeltaOperations(projectId, book, chapter).subscribe({
        error: (err: HttpErrorResponse) => {
          expect(err.status).toEqual(405);
          expect(err.statusText).toEqual('Not Allowed');
        }
      });
      tick();

      // Setup the HTTP request
      const req = httpTestingController.expectOne(
        `${MACHINE_API_BASE_URL}translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}/delta`
      );
      expect(req.request.method).toEqual('GET');
      req.flush(null, { status: HttpStatusCode.MethodNotAllowed, statusText: 'Not Allowed' });
      tick();
    }));

    it('should return an empty array for a delta if offline', fakeAsync(() => {
      const book = 43;
      const chapter = 3;
      testOnlineStatusService.setIsOnline(false);

      // SUT
      service.getGeneratedDraftDeltaOperations(projectId, book, chapter).subscribe(result => {
        expect(result).toEqual([]);
      });
      tick();
    }));
  });

  describe('getGeneratedDraftUsfm', () => {
    it('should get the pre-translation USFM for the specified book/chapter and return an observable', fakeAsync(() => {
      const book = 43;
      const chapter = 3;
      const usfm = '\\id Test USFM \\c 1 \\v 1 Test';

      // SUT
      service.getGeneratedDraftUsfm(projectId, book, chapter).subscribe(result => {
        expect(result).toEqual(usfm);
      });
      tick();

      // Setup the HTTP request
      const req = httpTestingController.expectOne(
        `${MACHINE_API_BASE_URL}translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}/usfm`
      );
      expect(req.request.method).toEqual('GET');
      req.flush(usfm);
      tick();
    }));

    it('should return undefined for a 404 error', fakeAsync(() => {
      const book = 43;
      const chapter = 3;

      // SUT
      service.getGeneratedDraftUsfm(projectId, book, chapter).subscribe(result => {
        expect(result).toBeUndefined();
      });
      tick();

      // Setup the HTTP request
      const req = httpTestingController.expectOne(
        `${MACHINE_API_BASE_URL}translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}/usfm`
      );
      expect(req.request.method).toEqual('GET');
      req.flush(null, { status: HttpStatusCode.NotFound, statusText: 'Not Found' });
      tick();
    }));

    it('should return undefined if offline', fakeAsync(() => {
      const book = 43;
      const chapter = 3;
      testOnlineStatusService.setIsOnline(false);

      // SUT
      service.getGeneratedDraftUsfm(projectId, book, chapter).subscribe(result => {
        expect(result).toBeUndefined();
      });
      tick();
    }));
  });

  describe('draftExists', () => {
    it('should return true if draft exists', fakeAsync(() => {
      const book = 43;
      const chapter = 3;
      const preTranslationData = {
        preTranslations: [
          { reference: 'verse_3_16', translation: 'For God so loved the world' },
          { reference: 'verse_1_1', translation: 'In the beginning was the Word' }
        ]
      };

      // SUT
      service.draftExists(projectId, book, chapter).subscribe(result => {
        expect(result).toBe(true);
      });
      tick();

      // Setup the HTTP request
      const req = httpTestingController.expectOne(
        `${MACHINE_API_BASE_URL}translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}`
      );
      expect(req.request.method).toEqual('GET');
      req.flush(preTranslationData);
      tick();
    }));

    it('should return false if draft does not exist', fakeAsync(() => {
      const book = 43;
      const chapter = 3;
      const preTranslationData = {
        preTranslations: []
      };

      // SUT
      service.draftExists(projectId, book, chapter).subscribe(result => {
        expect(result).toBe(false);
      });
      tick();

      // Setup the HTTP request
      const req = httpTestingController.expectOne(
        `${MACHINE_API_BASE_URL}translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}`
      );
      expect(req.request.method).toEqual('GET');
      req.flush(preTranslationData);
      tick();
    }));
  });

  describe('downloadDraft', () => {
    it('should throw an error if the chapters have no drafts', done => {
      const projectDoc: SFProjectProfileDoc = {
        data: createTestProjectProfile({
          texts: []
        })
      } as SFProjectProfileDoc;
      service.downloadGeneratedDraftZip(projectDoc, undefined).subscribe({
        error: (error: Error) => {
          expect(error).not.toBeNull();
          done();
        },
        complete: () => fail()
      });
    });

    it('should throw an error if the project has no data', done => {
      service.downloadGeneratedDraftZip(undefined, undefined).subscribe({
        error: (error: Error) => {
          expect(error).not.toBeNull();
          done();
        },
        complete: () => fail()
      });
    });

    it('should create a zip file containing all of the books with drafts', fakeAsync(() => {
      const projectDoc: SFProjectProfileDoc = {
        id: projectId,
        data: createTestProjectProfile({
          texts: [
            {
              bookNum: 62,
              chapters: [
                { number: 1, hasDraft: false },
                { number: 2, hasDraft: true }
              ]
            },
            { bookNum: 63, chapters: [{ number: 1, hasDraft: true }] },
            { bookNum: 64, chapters: [{ number: 1, hasDraft: false }] }
          ]
        })
      } as SFProjectProfileDoc;
      const lastCompletedBuild: BuildDto = {
        additionalInfo: { dateFinished: '2024-08-27T00:00:00.000+00:00' }
      } as BuildDto;

      service.downloadGeneratedDraftZip(projectDoc, lastCompletedBuild).subscribe({
        complete: () => {
          expect(saveAs).toHaveBeenCalled();
        }
      });
      tick();

      // Setup the HTTP request for 1 John
      const usfm = '\\id Test USFM \\c 1 \\v 1 Test';
      const req1jn = httpTestingController.expectOne(
        `${MACHINE_API_BASE_URL}translation/engines/project:${projectId}/actions/pretranslate/62_0/usfm`
      );
      expect(req1jn.request.method).toEqual('GET');
      req1jn.flush(usfm);

      // Setup the HTTP request for 2 John
      const req2jn = httpTestingController.expectOne(
        `${MACHINE_API_BASE_URL}translation/engines/project:${projectId}/actions/pretranslate/63_0/usfm`
      );
      expect(req2jn.request.method).toEqual('GET');
      req2jn.flush(usfm);
      tick();
    }));
  });
});
