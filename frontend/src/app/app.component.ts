import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { AuthService } from './services/auth.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'JJK Trading Labs';
  isAuthenticated = false;
  user: any = null;
  selectedTabIndex = 0;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.authService.isAuthenticated$.subscribe(isAuth => {
      this.isAuthenticated = isAuth;
    });

    this.authService.user$.subscribe(user => {
      this.user = user;
    });

    // Listen to route changes to update tab selection
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.updateTabIndex((event as NavigationEnd).url);
      });
  }

  updateTabIndex(url: string) {
    // Strip query parameters for matching
    const baseUrl = url.split('?')[0];
    
    switch (baseUrl) {
      case '/dashboard':
        this.selectedTabIndex = 0;
        break;
      case '/trading':
        this.selectedTabIndex = 1;
        break;
      case '/optimization':
        this.selectedTabIndex = 2;
        break;
      case '/top-performers':
        this.selectedTabIndex = 3;
        break;
      default:
        this.selectedTabIndex = 0;
        break;
    }
  }

  onTabChange(index: number) {
    switch (index) {
      case 0:
        this.router.navigate(['/dashboard']);
        break;
      case 1:
        this.router.navigate(['/trading']);
        break;
      case 2:
        this.router.navigate(['/optimization']);
        break;
      case 3:
        this.router.navigate(['/top-performers']);
        break;
    }
  }

  logout() {
    this.authService.logout();
    // Force a clean navigation to login
    this.router.navigate(['/login']).then(() => {
      // Reset any cached state
      window.location.reload();
    });
  }
}
