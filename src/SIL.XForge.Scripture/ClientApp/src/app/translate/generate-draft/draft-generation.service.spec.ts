import { TestBed } from '@angular/core/testing';
import { HttpClient } from 'src/app/machine-api/http-client';
import { mock } from 'ts-mockito';
import { DraftGenerationService } from './draft-generation.service';

const mockedHttpClient = mock(HttpClient);

describe('DraftGenerationService', () => {
  let service: DraftGenerationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: HttpClient, useValue: mockedHttpClient }]
    });
    service = TestBed.inject(DraftGenerationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
