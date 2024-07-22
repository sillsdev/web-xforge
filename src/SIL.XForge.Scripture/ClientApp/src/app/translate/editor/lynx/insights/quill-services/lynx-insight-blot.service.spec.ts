import { TestBed } from '@angular/core/testing';

import { LynxInsightBlotService } from './lynx-insight-blot.service';

describe('LynxInsightBlotService', () => {
  let service: LynxInsightBlotService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LynxInsightBlotService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
