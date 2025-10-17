import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-email-verification',
  templateUrl: './email-verification.component.html',
  styleUrls: ['./email-verification.component.scss']
})
export class EmailVerificationComponent implements OnInit {
  loading = true;
  success = false;
  error = false;
  message = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    // Get token from query parameters
    this.route.queryParams.subscribe(params => {
      const token = params['token'];
      
      if (!token) {
        this.loading = false;
        this.error = true;
        this.message = 'Invalid verification link. No token provided.';
        return;
      }

      // Call API to verify email
      this.authService.verifyEmail(token).subscribe({
        next: (response) => {
          this.loading = false;
          this.success = true;
          this.message = 'Email verified successfully! Redirecting to login...';
          this.snackBar.open('Email verified successfully!', 'Close', { duration: 3000 });
          
          // Redirect to login after 2 seconds
          setTimeout(() => {
            this.router.navigate(['/login']);
          }, 2000);
        },
        error: (error) => {
          this.loading = false;
          this.error = true;
          this.message = error.error?.error || 'Email verification failed. The link may be invalid or expired.';
          this.snackBar.open('Verification failed', 'Close', { duration: 5000 });
        }
      });
    });
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
