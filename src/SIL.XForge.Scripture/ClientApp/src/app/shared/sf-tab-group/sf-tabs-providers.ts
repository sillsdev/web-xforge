import { Provider } from '@angular/core';
import { NoopTabAddRequestService, TabAddRequestService } from './base-services/tab-add-request.service';

/**
 * Provides the default TabAddRequestService implementation for SF tabs.
 */
export function provideSFTabs(): Provider[] {
  return [{ provide: TabAddRequestService, useClass: NoopTabAddRequestService }];
}
