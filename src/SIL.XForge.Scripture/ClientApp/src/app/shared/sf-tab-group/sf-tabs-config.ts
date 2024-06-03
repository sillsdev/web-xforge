import { InjectionToken } from '@angular/core';

export interface SFTabsConfig {
  tooltipShowDelay: number;
}

export const SF_TABS_CONFIG = new InjectionToken<SFTabsConfig>('SF_TABS_CONFIG', {
  factory: () => ({ tooltipShowDelay: 700 })
});
