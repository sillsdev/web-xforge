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
import { PasswordStrengthMeterModule } from 'angular-password-strength-meter';
import { RecaptchaModule } from 'ng-recaptcha';
import { RecaptchaFormsModule } from 'ng-recaptcha/forms';
import { ChartsModule } from 'ng2-charts';

import { BlurOnClickDirective } from './blur-on-click.directive';

const modules = [
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
  MdcSelectModule,
  MdcSliderModule,
  MdcSnackbarModule,
  MdcSwitchModule,
  MdcTabBarModule,
  MdcTextFieldModule,
  MdcTopAppBarModule,
  MdcTypographyModule,
  PasswordStrengthMeterModule,
  ReactiveFormsModule,
  RecaptchaModule,
  RecaptchaFormsModule,
  ChartsModule
];

const appFlexLayoutBreakPoints = [
  {
    alias: 'xs',
    suffix: 'xs',
    mediaQuery: 'screen and (max-width: 575px)'
  },
  {
    alias: 'sm',
    suffix: 'sm',
    mediaQuery: 'screen and (min-width: 576px) and (max-width: 767px)'
  },
  {
    alias: 'md',
    suffix: 'md',
    mediaQuery: 'screen and (min-width: 768px) and (max-width: 991px)'
  },
  {
    alias: 'lg',
    suffix: 'lg',
    mediaQuery: 'screen and (min-width: 992px) and (max-width: 1199px)'
  },
  {
    alias: 'xl',
    suffix: 'xl',
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
