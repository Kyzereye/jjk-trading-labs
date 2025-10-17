import { Component } from '@angular/core';

@Component({
  selector: 'app-about',
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss']
})
export class AboutComponent {
  expandedSection: string | null = null;

  toggleSection(section: string): void {
    this.expandedSection = this.expandedSection === section ? null : section;
  }
}

