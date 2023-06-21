import { TestBed } from '@angular/core/testing';

import { DraftGenerationService } from './draft-generation.service';

describe('DraftGenerationService', () => {
  let service: DraftGenerationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DraftGenerationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
