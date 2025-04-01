import { BidiModule } from '@angular/cdk/bidi';
import { ModuleWithProviders, NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatBadgeModule } from '@angular/material/badge';
import { MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatOptionModule } from '@angular/material/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS, MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorIntl, MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MAT_SELECT_CONFIG, MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSortModule } from '@angular/material/sort';
import { MatStepperModule } from '@angular/material/stepper';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MAT_TOOLTIP_DEFAULT_OPTIONS, MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoService } from '@ngneat/transloco';
import { NgCircleProgressModule } from 'ng-circle-progress';
import { AutofocusDirective } from './autofocus.directive';
import { BlurOnClickDirective } from './blur-on-click.directive';
import { DonutChartModule } from './donut-chart/donut-chart.module';
import { L10nNumberPipe } from './l10n-number.pipe';
import { Paginator } from './paginator/paginator.component';
import { RouterLinkDirective } from './router-link.directive';
import { ScrollIntoViewDirective } from './scroll-into-view';

const modules = [
  DonutChartModule,
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

@NgModule({
  declarations: [BlurOnClickDirective, AutofocusDirective, ScrollIntoViewDirective, RouterLinkDirective],
  imports: [...modules, L10nNumberPipe],
  exports: [
    ...modules,
    BlurOnClickDirective,
    AutofocusDirective,
    ScrollIntoViewDirective,
    RouterLinkDirective,
    L10nNumberPipe
  ],
  providers: [
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
