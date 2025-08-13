import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'includes'
})
export class IncludesPipe implements PipeTransform {
  transform<T>(items: T[] | undefined, item: T): boolean {
    return items != null && items.includes(item);
  }
}
