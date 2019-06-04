import {
  MdcButtonModule,
  MdcCardModule,
  MdcCheckboxModule,
  MdcDialogModule,
  MdcDrawerModule,
  MdcElevationModule,
  MdcFormFieldModule,
  MdcIconButtonModule,
  MdcIconModule,
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
  MdcTypographyModule
} from '@angular-mdc/web';
import { NgModule } from '@angular/core';
import { BREAKPOINT, FlexLayoutModule } from '@angular/flex-layout';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  MatButtonModule,
  MatButtonToggleModule,
  MatCardModule,
  MatCheckboxModule,
  MatDatepickerModule,
  MatDialogModule,
  MatDividerModule,
  MatFormFieldModule,
  MatGridListModule,
  MatIconModule,
  MatInputModule,
  MatNativeDateModule,
  MatOptionModule,
  MatPaginatorModule,
  MatProgressBarModule,
  MatProgressSpinnerModule,
  MatSelectModule,
  MatSlideToggleModule,
  MatSnackBarModule,
  MatTableModule,
  MatTabsModule
} from '@angular/material';
import { ChartsModule } from 'ng2-charts';

import { BlurOnClickDirective } from './blur-on-click.directive';

const modules = [
  ChartsModule,
  FlexLayoutModule,
  FormsModule,
  MatButtonModule,
  MatButtonToggleModule,
  MatCardModule,
  MatCheckboxModule,
  MatDatepickerModule,
  MatDialogModule,
  MatDividerModule,
  MatFormFieldModule,
  MatGridListModule,
  MatIconModule,
  MatInputModule,
  MatNativeDateModule,
  MatOptionModule,
  MatPaginatorModule,
  MatProgressBarModule,
  MatProgressSpinnerModule,
  MatSelectModule,
  MatSlideToggleModule,
  MatSnackBarModule,
  MatTableModule,
  MatTabsModule,
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
  declarations: [BlurOnClickDirective],
  imports: modules,
  exports: [...modules, BlurOnClickDirective],
  providers: [{ provide: BREAKPOINT, useValue: appFlexLayoutBreakPoints, multi: true }]
})
export class UICommonModule {}
