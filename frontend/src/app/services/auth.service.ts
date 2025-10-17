import { Injectable } from '@angular/core';
import { HttpClient, HttpBackend } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Router } from '@angular/router';

export interface User {
  id: number;
  email: string;
  name: string;
  email_verified: boolean;
  role: string;
  preferences?: any;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  success: boolean;
  token: string;
  user: User;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly API_URL = 'http://localhost:2222/api';
  private readonly TOKEN_KEY = 'jjk_trading_token';
  
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  private userSubject = new BehaviorSubject<User | null>(null);
  
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();
  public user$ = this.userSubject.asObservable();

  private httpWithoutInterceptor: HttpClient;

  constructor(
    private http: HttpClient,
    private httpBackend: HttpBackend,
    private router: Router
  ) {
    // Create HttpClient that bypasses interceptors to avoid circular dependency
    this.httpWithoutInterceptor = new HttpClient(httpBackend);
    this.initializeAuth();
  }

  private initializeAuth() {
    const token = sessionStorage.getItem(this.TOKEN_KEY);
    if (token) {
      // Use httpWithoutInterceptor with manual auth header to avoid circular dependency
      this.httpWithoutInterceptor.get<{ success: boolean; user: User }>(
        `${this.API_URL}/auth/profile`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      ).subscribe({
        next: (response) => {
          this.isAuthenticatedSubject.next(true);
          this.userSubject.next(response.user);
        },
        error: () => {
          // Clear invalid token
          sessionStorage.removeItem(this.TOKEN_KEY);
          this.isAuthenticatedSubject.next(false);
          this.userSubject.next(null);
        }
      });
    }
  }

  login(credentials: LoginRequest): Observable<AuthResponse> {
    // Use httpWithoutInterceptor to avoid circular dependency
    return this.httpWithoutInterceptor.post<AuthResponse>(`${this.API_URL}/auth/login`, credentials)
      .pipe(
        tap(response => {
          if (response.success) {
            sessionStorage.setItem(this.TOKEN_KEY, response.token);
            this.isAuthenticatedSubject.next(true);
            this.userSubject.next(response.user);
          }
        })
      );
  }

  register(userData: RegisterRequest): Observable<any> {
    return this.http.post(`${this.API_URL}/auth/register`, userData);
  }

  verifyEmail(token: string): Observable<any> {
    return this.http.post(`${this.API_URL}/auth/verify-email`, { token });
  }

  getProfile(): Observable<{ success: boolean; user: User }> {
    return this.http.get<{ success: boolean; user: User }>(`${this.API_URL}/auth/profile`);
  }

  updateProfile(profileData: Partial<User>): Observable<any> {
    return this.http.put(`${this.API_URL}/auth/profile`, profileData)
      .pipe(
        tap(() => {
          // Refresh user data
          this.getProfile().subscribe(response => {
            this.userSubject.next(response.user);
          });
        })
      );
  }

  updatePreferences(preferences: any): Observable<any> {
    return this.http.put(`${this.API_URL}/auth/preferences`, preferences)
      .pipe(
        tap(() => {
          // Refresh user data
          this.getProfile().subscribe(response => {
            this.userSubject.next(response.user);
          });
        })
      );
  }

  changePassword(passwordData: { currentPassword: string; newPassword: string }): Observable<any> {
    return this.http.put(`${this.API_URL}/auth/change-password`, passwordData);
  }

  logout() {
    sessionStorage.removeItem(this.TOKEN_KEY);
    this.isAuthenticatedSubject.next(false);
    this.userSubject.next(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return sessionStorage.getItem(this.TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return this.isAuthenticatedSubject.value;
  }

  getCurrentUser(): User | null {
    return this.userSubject.value;
  }
}
