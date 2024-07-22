import { TestBed } from '@angular/core/testing';

import { InsightRenderService } from './insight-render.service';

describe('InsightRenderService', () => {
  let service: InsightRenderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(InsightRenderService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
