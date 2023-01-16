import { AfterViewInit, Component, ElementRef, Input, NgZone, QueryList, ViewChildren } from '@angular/core';
import isEqual from 'lodash-es/isEqual';
import { SubscriptionDisposable } from '../subscription-disposable';

const DEFAULT_SIZE = 100;

function easeOutQuart(currentTime: number, startValue: number, delta: number, duration: number): number {
  return -delta * ((currentTime / duration - 1) ** 4 - 1) + startValue;
}

function getPercentages(data: number[]): number[] {
  const total = data.reduce((sum, cur) => sum + cur, 0);
  if (total === 0) {
    return data;
  }
  return data.map(v => v / total);
}

@Component({
  selector: 'app-donut-chart',
  templateUrl: './donut-chart.component.html',
  styleUrls: ['./donut-chart.component.scss']
})
export class DonutChartComponent extends SubscriptionDisposable implements AfterViewInit {
  @Input() animationDuration: number = 1000;
  readonly viewBox: string = `0 0 ${DEFAULT_SIZE} ${DEFAULT_SIZE}`;
  readonly cx: number = DEFAULT_SIZE / 2;
  readonly cy: number = DEFAULT_SIZE / 2;
  @ViewChildren('segmentCircle') segmentCircles?: QueryList<ElementRef>;
  private _thickness: number = 30;
  private _innerThicknessDelta: number = 10;
  private _spacing: number = 0;
  private _backgroundColor: string = 'white';
  private oldData: number[] = [];
  private _data: number[] = [];
  private _colors: string[] = [];
  private lastAnimationId: number = -1;

  constructor(private readonly ngZone: NgZone) {
    super();
  }

  ngAfterViewInit(): void {
    this.animateChange();
    if (this.segmentCircles != null) {
      this.subscribe(this.segmentCircles.changes, () => this.animateChange());
    }
  }

  get thickness(): number {
    return this._thickness;
  }

  @Input()
  set thickness(value: number) {
    if (this._thickness !== value) {
      this._thickness = value;
      this.constructSegments();
    }
  }

  get innerThicknessDelta(): number {
    return this._innerThicknessDelta;
  }

  @Input()
  set innerThicknessDelta(value: number) {
    if (this._innerThicknessDelta !== value) {
      this._innerThicknessDelta = value;
      this.constructSegments();
    }
  }

  get spacing(): number {
    return this._spacing;
  }

  @Input()
  set spacing(value: number) {
    if (this._spacing !== value) {
      this._spacing = value;
      this.constructSegments();
    }
  }

  get data(): number[] {
    return this._data;
  }

  @Input()
  set data(value: number[]) {
    if (!isEqual(this._data, value)) {
      if (value.length !== this._data.length) {
        this.oldData = Array(value.length).fill(0);
      } else {
        this.oldData = this._data;
      }
      this._data = value;
    }
  }

  get colors(): string[] {
    return this._colors;
  }

  @Input()
  set colors(value: string[]) {
    if (!isEqual(this._colors, value)) {
      this._colors = value;
      this.constructSegments();
    }
  }

  get backgroundColor(): string {
    return this._backgroundColor;
  }

  @Input()
  set backgroundColor(value: string) {
    if (this._backgroundColor !== value) {
      this._backgroundColor = value;
      this.constructSegments();
    }
  }

  get radius(): number {
    return DEFAULT_SIZE / 2 - this._thickness / 2;
  }

  get segmentWidth(): number {
    return this._thickness - this._innerThicknessDelta;
  }

  private animateChange(): void {
    if (this.segmentCircles == null) {
      return;
    }

    const percentages = getPercentages(this._data);
    const oldPercentages = getPercentages(this.oldData);
    const deltas = percentages.map((v, i) => v - oldPercentages[i]);
    const duration = this.animationDuration;

    // avoid firing change detection for each animation frame
    this.ngZone.runOutsideAngular(() => {
      if (duration === 0) {
        // Animation is disabled
        this.constructSegments(percentages);
        return;
      }

      const startTime = performance.now();
      const id = ++this.lastAnimationId;

      const animate = () => {
        const currentTime = Math.min(performance.now() - startTime, duration);
        const curData = deltas.map((v, i) => easeOutQuart(currentTime, oldPercentages[i], v, duration));
        this.constructSegments(curData);

        if (id === this.lastAnimationId && currentTime < duration) {
          requestAnimationFrame(animate);
        }
      };

      requestAnimationFrame(animate);
    });
  }

  private constructSegments(percentages: number[] = getPercentages(this._data)): void {
    if (this.segmentCircles == null) {
      return;
    }

    const totalLengthWithoutSpacing = 1 - this.spacing * percentages.filter(v => v > 0).length;
    let start = this.spacing / 2;
    const circumference = this.radius * 2 * Math.PI;
    const base = circumference / 100;
    this.segmentCircles.forEach((segmentCircle, i) => {
      let percentage = percentages[i] * totalLengthWithoutSpacing;
      percentage = Math.round(percentage * 10000) / 10000;
      const offset = circumference - base * (start * 100) + circumference / 4;
      const lengthOnCircle = base * (percentage * 100);
      const gap = circumference - lengthOnCircle;

      const element: SVGCircleElement = segmentCircle.nativeElement;
      element.setAttribute('stroke-dashoffset', offset.toString());
      element.setAttribute('stroke-dasharray', `${lengthOnCircle} ${gap}`);

      start += percentage + this.spacing;
    });
  }
}
