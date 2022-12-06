import { Component, Input } from '@angular/core';
import { UntypedFormGroup } from '@angular/forms';
import { ElementState } from '../models/element-state';

@Component({
  selector: 'app-write-status',
  templateUrl: './write-status.component.html',
  styleUrls: ['./write-status.component.scss']
})
export class WriteStatusComponent {
  @Input() state?: ElementState;
  @Input() formGroup?: UntypedFormGroup;

  // eslint-disable-next-line @typescript-eslint/naming-convention
  ElementState = ElementState;
}
