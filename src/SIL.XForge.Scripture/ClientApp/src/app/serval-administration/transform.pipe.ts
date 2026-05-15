import { Pipe, PipeTransform } from '@angular/core';

/** This short pipe can be used in a template to only transform input when the input changes. Rather
 * than calling a method from the template and transforming the input each change detection. For
 * example, `{{ someValue | transformWith: someFunction }}` */
@Pipe({
  name: 'transformWith',
  pure: true,
  standalone: true
})
export class TransformWithPipe implements PipeTransform {
  transform<TInput, TResult>(
    input: TInput | null | undefined,
    fn: (input: TInput | null | undefined) => TResult
  ): TResult {
    return fn(input);
  }
}
