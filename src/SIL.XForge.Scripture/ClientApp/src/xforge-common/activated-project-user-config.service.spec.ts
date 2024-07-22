import { TestBed } from '@angular/core/testing';

import { ActivatedProjectUserConfigService } from './activated-project-user-config.service';

describe('ActivatedProjectUserConfigService', () => {
  let service: ActivatedProjectUserConfigService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ActivatedProjectUserConfigService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
