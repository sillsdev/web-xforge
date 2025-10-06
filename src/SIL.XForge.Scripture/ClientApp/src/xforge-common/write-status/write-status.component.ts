import { Component, Input } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { ElementState } from '../models/element-state';

@Component({
  selector: 'app-write-status',
  templateUrl: './write-status.component.html',
  styleUrls: ['./write-status.component.scss'],
  imports: [MatIconModule, MatProgressSpinner],
  standalone: true
})
export class WriteStatusComponent {
  @Input() state?: ElementState;
  @Input() formGroup?: FormGroup;

  ElementState = ElementState;
}
