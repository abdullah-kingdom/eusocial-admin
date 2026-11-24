import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import {
  TIME_HOUR_OPTIONS_12,
  TIME_MERIDIEM_OPTIONS,
  TIME_MINUTE_OPTIONS,
  TimeMeridiem,
  composeTimeFrom12h,
  getTimeHour12,
  getTimeMeridiem,
  getTimeMinute,
  normalizeTimeFieldFormat,
  normalizeTimeFieldValue,
} from './time-field.utils';
import { RangeTimeFormat } from './range-field.utils';

/**
 * Segmented Time Picker used by Form Template configuration UIs.
 * Matches the Form Preview Time field (HH : MM | AM/PM, or native 24h).
 * Stores values as HH:mm (24h), same as the runtime Time field.
 */
@Component({
  selector: 'app-time-field-input',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './time-field-input.component.html',
  styleUrl: './time-field-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeFieldInputComponent {
  /** Stored time as HH:mm (24h), or empty/null. */
  @Input() value: string | null | undefined = '';
  @Input() timeFormat: RangeTimeFormat | string | null | undefined = '12';
  @Input() disabled = false;
  @Input() showClear = true;
  @Input() inputId = 'time-field-input';

  @Output() readonly valueChange = new EventEmitter<string | null>();

  get format(): RangeTimeFormat {
    return normalizeTimeFieldFormat(this.timeFormat);
  }

  get normalizedValue(): string {
    return normalizeTimeFieldValue(this.value) ?? '';
  }

  get hour12(): number | null {
    return getTimeHour12(this.value);
  }

  get minute(): number | null {
    return getTimeMinute(this.value);
  }

  get meridiem(): TimeMeridiem | null {
    return getTimeMeridiem(this.value);
  }

  readonly hourOptions = TIME_HOUR_OPTIONS_12;
  readonly minuteOptions = TIME_MINUTE_OPTIONS;
  readonly meridiemOptions = TIME_MERIDIEM_OPTIONS;

  onHourChange(raw: string): void {
    this.emit12Part('hour', raw);
  }

  onMinuteChange(raw: string): void {
    this.emit12Part('minute', raw);
  }

  onMeridiemChange(raw: string): void {
    this.emit12Part('meridiem', raw);
  }

  onNative24Input(raw: string): void {
    if (this.disabled) {
      return;
    }
    this.valueChange.emit(normalizeTimeFieldValue(raw));
  }

  clear(): void {
    if (this.disabled) {
      return;
    }
    this.valueChange.emit(null);
  }

  private emit12Part(part: 'hour' | 'minute' | 'meridiem', raw: string): void {
    if (this.disabled) {
      return;
    }

    let hour = this.hour12 ?? 12;
    let minute = this.minute ?? 0;
    let meridiem = this.meridiem ?? 'AM';

    if (part === 'hour') {
      hour = Number(raw);
    } else if (part === 'minute') {
      minute = Number(raw);
    } else {
      meridiem = String(raw).toUpperCase() === 'PM' ? 'PM' : 'AM';
    }

    const next = composeTimeFrom12h(hour, minute, meridiem);
    if (next == null || normalizeTimeFieldValue(this.value) === next) {
      return;
    }
    this.valueChange.emit(next);
  }
}
