import { EnvironmentProviders, Provider } from '@angular/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { MAT_SELECT_CONFIG } from '@angular/material/select';
import { MAT_TOOLTIP_DEFAULT_OPTIONS } from '@angular/material/tooltip';
import { TranslocoService } from '@ngneat/transloco';
import { NgCircleProgressModule } from 'ng-circle-progress';
import { Paginator } from './paginator/paginator.component';

/**
 * Provides Angular Material configuration and other UI-related providers for the application.
 */
export function provideUICommon(): (Provider | EnvironmentProviders)[] {
  return [
    {
      provide: MatPaginatorIntl,
      useClass: Paginator,
      deps: [TranslocoService]
    },
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: { appearance: 'outline', hideRequiredMarker: true }
    },
    {
      provide: MAT_TOOLTIP_DEFAULT_OPTIONS,
      useValue: { disableTooltipInteractivity: true }
    },
    {
      provide: MAT_SELECT_CONFIG,
      useValue: { panelWidth: null }
    },
    ...(NgCircleProgressModule.forRoot({
      // Defaults
      radius: 100,
      outerStrokeWidth: 8,
      innerStrokeWidth: 4,
      outerStrokeColor: '#298ed1',
      innerStrokeColor: '#95c4e6',
      animationDuration: 1000,
      startFromZero: false,
      titleFontSize: '48',
      unitsFontSize: '20',
      showSubtitle: false,
      responsive: true,
      renderOnClick: false
    }).providers ?? [])
  ];
}
