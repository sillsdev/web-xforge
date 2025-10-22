import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { NoopTabAddRequestService, TabAddRequestService } from './base-services/tab-add-request.service';

/**
 * Provides the default TabAddRequestService implementation for SF tabs.
 */
export function provideSFTabs(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: TabAddRequestService, useClass: NoopTabAddRequestService }]);
}
