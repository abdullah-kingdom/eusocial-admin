import { getInitialFieldValue } from './dynamic-form.builder';
import {
  composeTimeFrom12h,
  formatTimeFieldDisplay,
  getTimeHour12,
  getTimeMeridiem,
  getTimeMinute,
  normalizeTimeFieldValue,
} from './time-field.utils';

describe('Time field Preview value binding', () => {
  it('initializes FormControl defaults as HH:mm without falling back to 01:00', () => {
    expect(
      getInitialFieldValue({
        id: 't1',
        name: 'time_field',
        type: 'time',
        label: 'Time Field',
        defaultValue: '09:30',
        timeFormat: '12',
      } as never),
    ).toBe('09:30');

    expect(
      getInitialFieldValue({
        id: 't2',
        name: 'time_field',
        type: 'time',
        label: 'Time Field',
        defaultValue: '14:45',
        timeFormat: '12',
      } as never),
    ).toBe('14:45');
  });

  it('keeps empty defaults empty instead of inventing 01:00 AM', () => {
    expect(
      getInitialFieldValue({
        id: 't3',
        name: 'time_field',
        type: 'time',
        label: 'Time Field',
        defaultValue: '',
        timeFormat: '12',
      } as never),
    ).toBeNull();
  });

  it('maps stored HH:mm into the 12h select parts Preview renders', () => {
    expect(getTimeHour12('09:30')).toBe(9);
    expect(getTimeMinute('09:30')).toBe(30);
    expect(getTimeMeridiem('09:30')).toBe('AM');
    expect(formatTimeFieldDisplay('09:30', '12')).toBe('09:30 AM');

    expect(getTimeHour12('14:45')).toBe(2);
    expect(getTimeMinute('14:45')).toBe(45);
    expect(getTimeMeridiem('14:45')).toBe('PM');
    expect(formatTimeFieldDisplay('14:45', '12')).toBe('02:45 PM');
  });

  it('normalizes conditional Set Value fixed times to the Preview storage format', () => {
    expect(normalizeTimeFieldValue('02:45 PM')).toBe('14:45');
    expect(normalizeTimeFieldValue(composeTimeFrom12h(2, 45, 'PM'))).toBe('14:45');
    expect(normalizeTimeFieldValue('09:30 AM')).toBe('09:30');
  });

  it('does not treat the first enabled option (01:00 AM) as a configured value', () => {
    expect(composeTimeFrom12h(1, 0, 'AM')).toBe('01:00');
    expect(formatTimeFieldDisplay('01:00', '12')).toBe('01:00 AM');
    expect(formatTimeFieldDisplay('09:30', '12')).not.toBe('01:00 AM');
  });
});
