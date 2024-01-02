import { BidiModule } from '@angular/cdk/bidi';
import { ModuleWithProviders, NgModule } from '@angular/core';
import { BREAKPOINT, FlexLayoutModule } from '@angular/flex-layout';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatBadgeModule } from '@angular/material/badge';
import { MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatLegacyAutocompleteModule as MatAutocompleteModule } from '@angular/material/legacy-autocomplete';
import { MatLegacyButtonModule as MatButtonModule } from '@angular/material/legacy-button';
import { MatLegacyCardModule as MatCardModule } from '@angular/material/legacy-card';
import { MatLegacyCheckboxModule as MatCheckboxModule } from '@angular/material/legacy-checkbox';
import { MatLegacyOptionModule as MatOptionModule } from '@angular/material/legacy-core';
import { MatLegacyDialogModule as MatDialogModule } from '@angular/material/legacy-dialog';
import { MatLegacyFormFieldModule as MatFormFieldModule } from '@angular/material/legacy-form-field';
import { MatLegacyInputModule as MatInputModule } from '@angular/material/legacy-input';
import { MatLegacyListModule as MatListModule } from '@angular/material/legacy-list';
import { MatLegacyMenuModule as MatMenuModule } from '@angular/material/legacy-menu';
import {
  MatLegacyPaginatorIntl as MatPaginatorIntl,
  MatLegacyPaginatorModule as MatPaginatorModule
} from '@angular/material/legacy-paginator';
import { MatLegacyProgressBarModule as MatProgressBarModule } from '@angular/material/legacy-progress-bar';
import { MatLegacyProgressSpinnerModule as MatProgressSpinnerModule } from '@angular/material/legacy-progress-spinner';
import { MatLegacyRadioModule as MatRadioModule } from '@angular/material/legacy-radio';
import { MatLegacySelectModule as MatSelectModule } from '@angular/material/legacy-select';
import { MatLegacySlideToggleModule as MatSlideToggleModule } from '@angular/material/legacy-slide-toggle';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSliderModule } from '@angular/material/slider';
import { MatSortModule } from '@angular/material/sort';
import { MatStepperModule } from '@angular/material/stepper';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoService } from '@ngneat/transloco';
import { NgCircleProgressModule } from 'ng-circle-progress';
import { AutofocusDirective } from './autofocus.directive';
import { BlurOnClickDirective } from './blur-on-click.directive';
import { DonutChartModule } from './donut-chart/donut-chart.module';
import { Paginator } from './paginator/paginator.component';
import { RouterDirective } from './route.directive';
import { ScrollIntoViewDirective } from './scroll-into-view';

const modules = [
  DonutChartModule,
  FlexLayoutModule,
  FormsModule,
  BidiModule,
  MatAutocompleteModule,
  MatBadgeModule,
  MatBottomSheetModule,
  MatButtonModule,
  MatButtonToggleModule,
  MatCardModule,
  MatCheckboxModule,
  MatChipsModule,
  MatDialogModule,
  MatDividerModule,
  MatFormFieldModule,
  MatIconModule,
  MatInputModule,
  MatListModule,
  MatMenuModule,
  MatOptionModule,
  MatPaginatorModule,
  MatProgressBarModule,
  MatProgressSpinnerModule,
  MatRadioModule,
  MatSelectModule,
  MatSidenavModule,
  MatSliderModule,
  MatSlideToggleModule,
  MatSnackBarModule,
  MatSortModule,
  MatStepperModule,
  MatTableModule,
  MatTabsModule,
  MatToolbarModule,
  MatTooltipModule,
  MatExpansionModule,
  ReactiveFormsModule,
  NgCircleProgressModule
];

const appFlexLayoutBreakPoints = [
  {
    alias: 'xs',
    mediaQuery: 'screen and (min-width: 1px) and (max-width: 575px)'
  },
  {
    alias: 'sm',
    mediaQuery: 'screen and (min-width: 576px) and (max-width: 767px)'
  },
  {
    alias: 'md',
    mediaQuery: 'screen and (min-width: 768px) and (max-width: 991px)'
  },
  {
    alias: 'lg',
    mediaQuery: 'screen and (min-width: 992px) and (max-width: 1199px)'
  },
  {
    alias: 'xl',
    mediaQuery: 'screen and (min-width: 1200px) and (max-width: 5000px)'
  },
  {
    alias: 'lt-sm',
    mediaQuery: 'screen and (max-width: 575px)'
  },
  {
    alias: 'lt-md',
    mediaQuery: 'screen and (max-width: 767px)'
  },
  {
    alias: 'lt-lg',
    mediaQuery: 'screen and (max-width: 991px)'
  },
  {
    alias: 'lt-xl',
    mediaQuery: 'screen and (max-width: 1199px)'
  },
  {
    alias: 'gt-xs',
    mediaQuery: 'screen and (min-width: 576px)'
  },
  {
    alias: 'gt-sm',
    mediaQuery: 'screen and (min-width: 768px)'
  },
  {
    alias: 'gt-md',
    mediaQuery: 'screen and (min-width: 992px)'
  },
  {
    alias: 'gt-lg',
    mediaQuery: 'screen and (min-width: 1200px)'
  }
];

@NgModule({
  declarations: [BlurOnClickDirective, AutofocusDirective, ScrollIntoViewDirective, RouterDirective],
  imports: modules,
  exports: [...modules, BlurOnClickDirective, AutofocusDirective, ScrollIntoViewDirective, RouterDirective],
  providers: [
    { provide: BREAKPOINT, useValue: appFlexLayoutBreakPoints, multi: true },
    {
      provide: MatPaginatorIntl,
      useClass: Paginator,
      deps: [TranslocoService]
    }
  ]
})
export class UICommonModule {
  static forRoot(): ModuleWithProviders<UICommonModule> {
    return {
      ngModule: UICommonModule,
      providers: [
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
      ]
    };
  }
}
