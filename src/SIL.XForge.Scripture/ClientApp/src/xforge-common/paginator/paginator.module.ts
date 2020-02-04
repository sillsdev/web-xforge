import { NgModule } from '@angular/core';
import { MatPaginatorIntl, MatPaginatorModule } from '@angular/material/paginator';
import { Paginator } from './paginator.component';

@NgModule({
  imports: [MatPaginatorModule],
  providers: [{ provide: MatPaginatorIntl, useClass: Paginator }]
})
export class PaginatorModule {}
