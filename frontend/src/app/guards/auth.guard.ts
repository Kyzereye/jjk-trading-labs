import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable, of, race, timer } from 'rxjs';
import { map, take, filter } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  private readonly TOKEN_KEY = 'jjk_trading_token';

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    const token = sessionStorage.getItem(this.TOKEN_KEY);
    
    if (!token) {
      this.router.navigate(['/login']);
      return of(false);
    }

    // Wait for auth service to verify token (max 2 seconds)
    return race(
      this.authService.isAuthenticated$.pipe(
        filter(isAuth => isAuth === true),
        take(1),
        map(() => true)
      ),
      timer(2000).pipe(
        map(() => {
          this.router.navigate(['/login']);
          return false;
        })
      )
    );
  }
}
