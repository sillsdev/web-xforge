import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-training-progress',
  templateUrl: './training-progress.component.html',
  styleUrls: ['./training-progress.component.scss']
})
export class TrainingProgressComponent {
  @Input() showTrainingProgress: boolean = false;
  @Output() showTrainingProgressChange = new EventEmitter<boolean>();

  @Input() trainingMessage: string = '';
  @Input() trainingPercentage: number = 0;

  @Output() trainingProgressClosed = new EventEmitter<boolean>();

  closeTrainingProgress(): void {
    this.showTrainingProgress = false;
    this.showTrainingProgressChange.emit(this.showTrainingProgress);
    this.trainingProgressClosed.emit(true);
  }
}
