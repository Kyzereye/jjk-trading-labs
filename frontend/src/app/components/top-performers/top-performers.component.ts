import { Component } from '@angular/core';

@Component({
  selector: 'app-top-performers',
  template: `
    <div class="top-performers-container">
      <h1>Top Performers</h1>
      <p>Coming soon...</p>
    </div>
  `,
  styles: [`
    .top-performers-container {
      padding: 20px;
      text-align: center;
    }
    h1 {
      color: #ffffff;
    }
    p {
      color: #b0b0b0;
    }
  `]
})
export class TopPerformersComponent {}
