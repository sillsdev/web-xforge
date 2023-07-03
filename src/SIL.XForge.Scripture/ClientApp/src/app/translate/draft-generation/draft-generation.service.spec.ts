import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { BuildDto } from 'src/app/machine-api/build-dto';
import { BuildStates } from 'src/app/machine-api/build-states';
import { HttpClient } from 'src/app/machine-api/http-client';
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
    state: BuildStates.Queued
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [DraftGenerationService, { provide: HttpClient, useValue: { get: () => {}, post: () => {} } }]
    });

    service = TestBed.inject(DraftGenerationService);
    httpClient = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('pollBuildProgress', () => {
    it('should poll build progress and return an observable of BuildDto', () => {
      spyOn(service, 'getBuildProgress').and.returnValue(of(buildDto));
      service.pollBuildProgress(projectId).subscribe(result => {
        expect(result).toEqual(buildDto);
      });
      expect(service.getBuildProgress).toHaveBeenCalledWith(projectId);
    });
  });

  describe('getBuildProgress', () => {
    it('should get build progress and return an observable of BuildDto', () => {
      httpClient.get = jasmine.createSpy().and.returnValue(of({ data: buildDto }));
      service.getBuildProgress(projectId).subscribe(result => {
        expect(result).toEqual(buildDto);
      });
      expect(httpClient.get).toHaveBeenCalledWith(`translation/builds/id:${projectId}?pretranslate=true`);
    });
  });

  describe('startBuild', () => {
    it('should start a pretranslation build job and return an observable of BuildDto', () => {
      spyOn(service, 'getBuildProgress').and.returnValue(of(undefined));
      httpClient.post = jasmine.createSpy().and.returnValue(of({ data: buildDto }));
      service.startBuild(projectId).subscribe(result => {
        expect(result).toEqual(buildDto);
      });
      expect(service.getBuildProgress).toHaveBeenCalledWith(projectId);
      expect(httpClient.post).toHaveBeenCalledWith(`translation/pretranslations`, JSON.stringify(projectId));
    });

    it('should return already active build job', () => {
      spyOn(service, 'getBuildProgress').and.returnValue(of(buildDto));
      httpClient.post = jasmine.createSpy();
      service.startBuild(projectId).subscribe(result => {
        expect(result).toEqual(buildDto);
      });
      expect(service.getBuildProgress).toHaveBeenCalledWith(projectId);
      expect(httpClient.post).not.toHaveBeenCalled();
    });
  });

  describe('cancelBuild', () => {
    it('should cancel a pretranslation build job and return an observable of BuildDto', () => {
      httpClient.post = jasmine.createSpy().and.returnValue(of({ data: buildDto }));
      service.cancelBuild(projectId).subscribe(result => {
        expect(result).toEqual(buildDto);
      });
      expect(httpClient.post).toHaveBeenCalledWith(`translation/pretranslations/cancel`, JSON.stringify(projectId));
    });
  });

  describe('getGeneratedDraft', () => {
    it('should get the pretranslations for the specified book/chapter and return an observable of DraftSegmentMap', () => {
      const book = 44;
      const chapter = 2;
      const preTranslationData = {
        data: {
          preTranslations: [
            { reference: 'JHN 3:16', translation: 'For God so loved the world' },
            { reference: 'JHN 1:1', translation: 'In the beginning was the Word' }
          ]
        }
      };

      httpClient.get = jasmine.createSpy().and.returnValue(of(preTranslationData));
      service.getGeneratedDraft(projectId, book, chapter).subscribe(result => {
        expect(result).toEqual({
          verse_3_16: 'For God so loved the world',
          verse_1_1: 'In the beginning was the Word'
        });
      });
      expect(httpClient.get).toHaveBeenCalledWith(
        `translation/engines/project:${projectId}/actions/preTranslate/${book}_${chapter}`
      );
    });

    it('should handle empty preTranslations array', () => {
      const book = 44;
      const chapter = 2;
      const preTranslationData = {
        data: {
          preTranslations: []
        }
      };

      httpClient.get = jasmine.createSpy().and.returnValue(of(preTranslationData));
      service.getGeneratedDraft(projectId, book, chapter).subscribe(result => {
        expect(result).toEqual({});
      });
      expect(httpClient.get).toHaveBeenCalledWith(
        `translation/engines/project:${projectId}/actions/preTranslate/${book}_${chapter}`
      );
    });

    it('should handle invalid verse references', () => {
      const book = 44;
      const chapter = 2;
      const preTranslationData = {
        data: {
          preTranslations: [
            { reference: 'Invalid Reference', translation: 'This should be ignored' },
            { reference: 'JHN 3:16', translation: 'For God so loved the world' }
          ]
        }
      };

      httpClient.get = jasmine.createSpy().and.returnValue(of(preTranslationData));
      service.getGeneratedDraft(projectId, book, chapter).subscribe(result => {
        expect(result).toEqual({
          verse_3_16: 'For God so loved the world'
        });
      });
      expect(httpClient.get).toHaveBeenCalledWith(
        `translation/engines/project:${projectId}/actions/preTranslate/${book}_${chapter}`
      );
    });
  });
});
