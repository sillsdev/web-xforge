import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { DonutChartComponent } from './donut-chart.component';

@NgModule({
  exports: [DonutChartComponent],
  imports: [CommonModule, DonutChartComponent]
})
export class DonutChartModule {}
