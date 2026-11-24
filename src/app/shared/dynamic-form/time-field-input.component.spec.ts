import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TimeFieldInputComponent } from './time-field-input.component';

describe('TimeFieldInputComponent', () => {
  let fixture: ComponentFixture<TimeFieldInputComponent>;
  let component: TimeFieldInputComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TimeFieldInputComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TimeFieldInputComponent);
    component = fixture.componentInstance;
  });

  it('splits a stored 24h value into 12h parts', () => {
    fixture.componentRef.setInput('value', '07:00');
    fixture.componentRef.setInput('timeFormat', '12');
    fixture.detectChanges();

    expect(component.hour12).toBe(7);
    expect(component.minute).toBe(0);
    expect(component.meridiem).toBe('AM');
  });

  it('emits HH:mm when a 12h part changes', () => {
    const emitted: Array<string | null> = [];
    component.valueChange.subscribe((value) => {
      emitted.push(value);
      fixture.componentRef.setInput('value', value);
      fixture.detectChanges();
    });
    fixture.componentRef.setInput('value', '07:00');
    fixture.componentRef.setInput('timeFormat', '12');
    fixture.detectChanges();

    component.onHourChange('1');
    component.onMeridiemChange('PM');

    expect(emitted).toEqual(['01:00', '13:00']);
  });

  it('emits null when cleared', () => {
    const emitted: Array<string | null> = [];
    component.valueChange.subscribe((value) => emitted.push(value));
    fixture.componentRef.setInput('value', '13:30');
    fixture.detectChanges();

    component.clear();
    expect(emitted).toEqual([null]);
  });

  it('normalizes native 24h input to HH:mm', () => {
    const emitted: Array<string | null> = [];
    component.valueChange.subscribe((value) => emitted.push(value));
    fixture.componentRef.setInput('timeFormat', '24');
    fixture.detectChanges();

    component.onNative24Input('09:05');
    expect(emitted).toEqual(['09:05']);
  });
});
