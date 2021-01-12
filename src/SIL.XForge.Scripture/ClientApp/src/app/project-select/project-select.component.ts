import { Component, EventEmitter, forwardRef, Input, Output, ViewChild } from '@angular/core';
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatAutocomplete, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { BehaviorSubject, combineLatest, fromEvent, Observable } from 'rxjs';
import { map, startWith, takeUntil, tap } from 'rxjs/operators';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { SelectableProject } from '../core/paratext.service';

// A value accessor is necessary in order to create a custom form control
export const PROJECT_SELECT_VALUE_ACCESSOR: any = {
  provide: NG_VALUE_ACCESSOR,
  useExisting: forwardRef(() => ProjectSelectComponent),
  multi: true
};

@Component({
  selector: 'app-project-select',
  templateUrl: 'project-select.component.html',
  styleUrls: ['project-select.component.scss'],
  providers: [PROJECT_SELECT_VALUE_ACCESSOR]
})
export class ProjectSelectComponent extends SubscriptionDisposable implements ControlValueAccessor {
  @Output() valueChange: EventEmitter<string> = new EventEmitter<string>(true);

  @Input() placeholder = '';

  @ViewChild(MatAutocomplete) autocomplete!: MatAutocomplete;
  @ViewChild(MatAutocompleteTrigger) autocompleteTrigger!: MatAutocompleteTrigger;

  readonly paratextIdControl = new FormControl();

  @Input() projects?: SelectableProject[];
  @Input() resources?: SelectableProject[];
  /** Projects that can be an already selected value, but not given as an option in the menu */
  @Input() nonSelectableProjects?: SelectableProject[];

  hideProjectId$ = new BehaviorSubject<string>('');

  resourceCountLimit$ = new BehaviorSubject<number>(25);

  projects$: Observable<SelectableProject[]> = combineLatest(
    this.paratextIdControl.valueChanges.pipe(startWith('')),
    this.hideProjectId$
  ).pipe(map(value => this.filterGroup(value[0], this.projects || [])));

  resources$: Observable<SelectableProject[]> = combineLatest(
    this.paratextIdControl.valueChanges.pipe(startWith('')),
    this.resourceCountLimit$,
    this.hideProjectId$
  ).pipe(map(value => this.filterGroup(value[0], this.resources || [], value[1])));

  constructor() {
    super();
    this.subscribe(this.paratextIdControl.valueChanges, (value: SelectableProject) =>
      this.valueChange.next(value.paratextId)
    );
  }

  @Input() set value(id: string) {
    const project =
      this.projects?.find(p => p.paratextId === id) ||
      this.resources?.find(r => r.paratextId === id) ||
      this.nonSelectableProjects?.find(p => p.paratextId === id);
    if (project != null) {
      this.paratextIdControl.setValue(project);
    }
  }

  @Input() set disabled(value: boolean) {
    if (value) {
      this.paratextIdControl.disable();
    } else {
      this.paratextIdControl.enable();
    }
  }
  get disabled(): boolean {
    return this.paratextIdControl.disabled;
  }

  @Input() set hideProjectId(value: string) {
    if (this.paratextIdControl.value?.paratextId === value) {
      this.paratextIdControl.setValue('');
    }
    this.hideProjectId$.next(value);
  }
  get hideProjectId(): string {
    return this.hideProjectId$.getValue();
  }

  writeValue(value: any): void {
    this.value = value;
  }

  registerOnChange(fn: any): void {
    this.subscribe(this.valueChange, fn);
  }

  registerOnTouched(fn: any): void {
    this.subscribe(this.valueChange, fn);
  }

  projectDisplayText(project?: SelectableProject): string {
    return project?.name || '';
  }

  autocompleteOpened() {
    setTimeout(() => {
      if (this.autocomplete && this.autocomplete.panel && this.autocompleteTrigger) {
        fromEvent(this.autocomplete.panel.nativeElement, 'scroll')
          .pipe(
            map(() => this.autocomplete.panel.nativeElement.scrollTop),
            takeUntil(this.autocompleteTrigger.panelClosingActions.pipe(tap(() => this.resourceCountLimit$.next(25))))
          )
          .subscribe(() => {
            const panel = this.autocomplete.panel.nativeElement;
            // if scrolled to within 100px of bottom, display more resources
            if (this.resources != null && panel.scrollHeight <= panel.scrollTop + panel.clientHeight + 100) {
              this.resourceCountLimit$.next(Math.min(this.resourceCountLimit$.getValue() + 25, this.resources.length));
            }
          });
      }
    });
  }

  private filterGroup(
    value: string | SelectableProject,
    collection: SelectableProject[],
    limit?: number
  ): SelectableProject[] {
    const valueLower = typeof value === 'string' ? value.toLocaleLowerCase() : '';
    return collection
      .filter(project => project.name.toLowerCase().includes(valueLower) && project.paratextId !== this.hideProjectId)
      .sort((a, b) => a.name.toLowerCase().indexOf(valueLower) - b.name.toLowerCase().indexOf(valueLower))
      .slice(0, limit);
  }
}
