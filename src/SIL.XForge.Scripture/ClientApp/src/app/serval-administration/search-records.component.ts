import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { InfoComponent } from '../shared/info/info.component';

@Component({
  selector: 'app-search-records',
  standalone: true,
  templateUrl: './search-records.component.html',
  styleUrls: ['./search-records.component.scss'],
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, InfoComponent]
})
export class SearchRecordsComponent {
  @Input({ required: true }) searchControl!: FormControl<string>;
  @Input() infoText: string = '';
  @Input() label: string = 'Search';
  @Output() clearSearch = new EventEmitter<void>();

  onClearSearch(): void {
    this.clearSearch.emit();
  }
}
