import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

/**
 * Shared Figma header for Setup create/edit pages
 * (Users, Items, Vendors, Job Positions).
 */
@Component({
  selector: 'app-setup-entity-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './setup-entity-header.component.html',
  styleUrl: './setup-entity-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetupEntityHeaderComponent {
  /** Breadcrumb parent label (e.g. Users). */
  @Input({ required: true }) parentLabel!: string;
  /** Page title / breadcrumb current (e.g. Add user). */
  @Input({ required: true }) title!: string;

  @Input() showActiveToggle = false;
  @Input() active = true;

  @Input() showBuilderAction = false;
  @Input() builderActionLabel = 'Edit this form in the builder';

  @Output() readonly parentClick = new EventEmitter<void>();
  @Output() readonly activeChange = new EventEmitter<boolean>();
  @Output() readonly builderClick = new EventEmitter<void>();

  onParentClick(): void {
    this.parentClick.emit();
  }

  onToggleActive(): void {
    this.activeChange.emit(!this.active);
  }

  onBuilderClick(): void {
    this.builderClick.emit();
  }
}
