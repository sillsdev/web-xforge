import { MDCDataTableModule } from '@angular-mdc/web';
import { MdcButtonModule } from '@angular-mdc/web/button';
import { MdcCardModule } from '@angular-mdc/web/card';
import { MdcCheckboxModule } from '@angular-mdc/web/checkbox';
import { MdcDialogModule } from '@angular-mdc/web/dialog';
import { MdcDrawerModule } from '@angular-mdc/web/drawer';
import { MdcElevationModule } from '@angular-mdc/web/elevation';
import { MdcFormFieldModule } from '@angular-mdc/web/form-field';
import { MdcIconModule } from '@angular-mdc/web/icon';
import { MdcIconButtonModule } from '@angular-mdc/web/icon-button';
import { MdcLinearProgressModule } from '@angular-mdc/web/linear-progress';
import { MdcListModule } from '@angular-mdc/web/list';
import { MdcMenuModule } from '@angular-mdc/web/menu';
import { MdcMenuSurfaceModule } from '@angular-mdc/web/menu-surface';
import { MdcRadioModule } from '@angular-mdc/web/radio';
import { MdcSelectModule } from '@angular-mdc/web/select';
import { MdcSliderModule } from '@angular-mdc/web/slider';
import { MdcSnackbarModule } from '@angular-mdc/web/snackbar';
import { MdcSwitchModule } from '@angular-mdc/web/switch';
import { MdcTabBarModule } from '@angular-mdc/web/tab-bar';
import { MdcTextFieldModule } from '@angular-mdc/web/textfield';
import { MdcTopAppBarModule } from '@angular-mdc/web/top-app-bar';
import { MdcTypographyModule } from '@angular-mdc/web/typography';
import { NgModule } from '@angular/core';
import { BREAKPOINT, FlexLayoutModule } from '@angular/flex-layout';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatOptionModule } from '@angular/material/core';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorIntl, MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoService } from '@ngneat/transloco';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule } from '@angular/material/dialog';
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
  MatAutocompleteModule,
  MatButtonModule,
  MatCardModule,
  MatCheckboxModule,
  MatDialogModule,
  MatDividerModule,
  MatFormFieldModule,
  MatInputModule,
  MatOptionModule,
  MatPaginatorModule,
  MatProgressBarModule,
  MatProgressSpinnerModule,
  MatSelectModule,
  MatTableModule,
  MatTooltipModule,
  MdcButtonModule,
  MdcCardModule,
  MdcCheckboxModule,
  MdcDialogModule,
  MdcDrawerModule,
  MdcElevationModule,
  MdcFormFieldModule,
  MdcIconModule,
  MdcIconButtonModule,
  MdcLinearProgressModule,
  MdcListModule,
  MdcMenuModule,
  MdcMenuSurfaceModule,
  MdcRadioModule,
  MdcSelectModule,
  MdcSliderModule,
  MdcSnackbarModule,
  MdcSwitchModule,
  MdcTabBarModule,
  MdcTextFieldModule,
  MdcTopAppBarModule,
  MdcTypographyModule,
  MDCDataTableModule,
  ReactiveFormsModule
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
export class UICommonModule {}
