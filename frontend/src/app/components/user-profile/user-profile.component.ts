import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';
import { MatSnackBar } from '@angular/material/snack-bar';

interface UserProfile {
  id: number;
  email: string;
  name: string;
  email_verified: boolean;
  role: string | number;
  created_at?: string;
  preferences?: any;
}

interface Message {
  type: 'success' | 'error';
  text: string;
}

interface ColumnOption {
  key: string;
  label: string;
}

@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.scss']
})
export class UserProfileComponent implements OnInit {
  profileForm: FormGroup;
  passwordForm: FormGroup;
  preferencesForm: FormGroup;
  user: UserProfile | null = null;
  loading = false;
  saving = false;
  activeTab = 0;
  message: Message | null = null;
  hideCurrentPassword = true;
  hideNewPassword = true;
  hideConfirmPassword = true;
  passwordRequirements = {
    minLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
    hasSpecial: false,
    passwordsMatch: false
  };
  tradesColumns: { [key: string]: boolean } = {
    entry_date: true,
    exit_date: true,
    entry_price: true,
    exit_price: true,
    exit_reason: true,
    shares: true,
    pnl: true,
    pnl_percent: true,
    running_pnl: true,
    running_capital: true,
    drawdown: true,
    duration: true
  };

  columnOptions: ColumnOption[] = [
    { key: 'entry_date', label: 'Entry Date' },
    { key: 'exit_date', label: 'Exit Date' },
    { key: 'entry_price', label: 'Entry Price' },
    { key: 'exit_price', label: 'Exit Price' },
    { key: 'exit_reason', label: 'Exit Reason' },
    { key: 'shares', label: 'Shares' },
    { key: 'pnl', label: 'PnL' },
    { key: 'pnl_percent', label: 'PnL %' },
    { key: 'running_pnl', label: 'Running PnL' },
    { key: 'running_capital', label: 'Running Capital' },
    { key: 'drawdown', label: 'Drawdown' },
    { key: 'duration', label: 'Duration' }
  ];

  constructor(
    private fb: FormBuilder,
    public authService: AuthService,
    private apiService: ApiService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {
    this.profileForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]]
    });

    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, this.passwordStrengthValidator.bind(this)]],
      confirmPassword: ['', Validators.required]
    }, { validators: this.passwordMatchValidator });

    // Watch password changes to update requirements checklist
    this.passwordForm.get('newPassword')?.valueChanges.subscribe(password => {
      this.updatePasswordRequirements(password, this.passwordForm.get('confirmPassword')?.value);
    });

    this.passwordForm.get('confirmPassword')?.valueChanges.subscribe(confirmPassword => {
      this.updatePasswordRequirements(this.passwordForm.get('newPassword')?.value, confirmPassword);
    });

    this.preferencesForm = this.fb.group({
      default_days: [365, [Validators.min(30), Validators.max(1095)]],
      default_atr_period: [14, [Validators.min(5), Validators.max(50)]],
      default_atr_multiplier: [2.0, [Validators.min(0.5), Validators.max(5.0)]],
      default_ma_type: ['ema'],
      default_initial_capital: [100000, [Validators.min(1000), Validators.max(10000000)]],
      position_sizing_percentage: [5.0, [Validators.min(1), Validators.max(20)]],
      mean_reversion_threshold: [10.0, [Validators.min(3), Validators.max(15)]]
    });
  }

  passwordMatchValidator(control: AbstractControl): { [key: string]: any } | null {
    const newPassword = control.get('newPassword');
    const confirmPassword = control.get('confirmPassword');
    
    if (newPassword && confirmPassword && newPassword.value !== confirmPassword.value) {
      confirmPassword.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    }
    return null;
  }

  passwordStrengthValidator(control: AbstractControl): { [key: string]: any } | null {
    const value = control.value;
    if (!value) {
      return null;
    }

    const errors: any = {};

    // At least 11 characters
    if (value.length < 11) {
      errors.minLength = true;
    }

    // At least 1 lowercase letter
    if (!/[a-z]/.test(value)) {
      errors.lowercase = true;
    }

    // At least 1 uppercase letter
    if (!/[A-Z]/.test(value)) {
      errors.uppercase = true;
    }

    // At least 1 number
    if (!/[0-9]/.test(value)) {
      errors.number = true;
    }

    // At least 1 special character
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value)) {
      errors.specialChar = true;
    }

    return Object.keys(errors).length > 0 ? errors : null;
  }

  updatePasswordRequirements(password: string, confirmPassword: string): void {
    const pwd = password || '';
    const confirm = confirmPassword || '';
    
    this.passwordRequirements = {
      minLength: pwd.length >= 11,
      hasUppercase: /[A-Z]/.test(pwd),
      hasLowercase: /[a-z]/.test(pwd),
      hasNumber: /[0-9]/.test(pwd),
      hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd),
      passwordsMatch: pwd.length > 0 && confirm.length > 0 && pwd === confirm
    };
  }

  ngOnInit(): void {
    // Initialize with default values from auth service
    const currentUser = this.authService.getCurrentUser();
    if (currentUser) {
      this.user = currentUser;
      this.profileForm.patchValue({
        name: currentUser.name || '',
        email: currentUser.email || ''
      });
    }
    
    this.loadUserProfile();
  }

  loadUserProfile(): void {
    console.log('Loading user profile...');
    this.loading = true;
    this.apiService.getUserProfile().subscribe({
      next: (response) => {
        console.log('Profile response:', response);
        this.user = response.user;
        if (this.user) {
          console.log('User data loaded:', this.user);
          this.profileForm.patchValue({
            name: this.user.name,
            email: this.user.email
          });
          
          if (this.user.preferences) {
            this.preferencesForm.patchValue(this.user.preferences);
          }
        } else {
          console.log('No user data in response');
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading profile:', error);
        this.snackBar.open('Failed to load profile: ' + error.message, 'Close', { duration: 5000 });
        this.loading = false;
      }
    });
  }

  updateProfile(): void {
    if (this.profileForm.valid) {
      this.saving = true;
      const { name, email } = this.profileForm.value;
      
      this.apiService.updateUserProfile({ name, email }).subscribe({
        next: (response) => {
          this.snackBar.open('Profile updated successfully', 'Close', { duration: 3000 });
          this.loadUserProfile(); // Reload to get updated data
          this.saving = false;
        },
        error: (error) => {
          console.error('Error updating profile:', error);
          this.snackBar.open('Failed to update profile', 'Close', { duration: 3000 });
          this.saving = false;
        }
      });
    }
  }

  resetPreferencesToDefault(): void {
    // Reset to default values
    this.preferencesForm.patchValue({
      default_days: 365,
      default_atr_period: 14,
      default_atr_multiplier: 2.0,
      default_ma_type: 'ema',
      default_initial_capital: 100000,
      position_sizing_percentage: 5.0,
      mean_reversion_threshold: 10.0
    });
    
    this.message = { type: 'success', text: 'Preferences reset to defaults. Click "Save Preferences" to apply.' };
  }

  updatePreferences(): void {
    if (this.preferencesForm.valid) {
      this.saving = true;
      const preferences = this.preferencesForm.value;
      
      this.apiService.updateUserPreferences(preferences).subscribe({
        next: (response) => {
          this.snackBar.open('Preferences updated successfully', 'Close', { duration: 2000 });
          this.saving = false;
          
          // Reload user profile to get updated preferences
          this.apiService.getUserProfile().subscribe({
            next: (profileResponse) => {
              // Update the user in auth service so other components can access new preferences
              const currentUser = this.authService.getCurrentUser();
              if (currentUser && profileResponse.user) {
                const updatedUser = { ...currentUser, preferences: profileResponse.user.preferences };
                localStorage.setItem('user', JSON.stringify(updatedUser));
              }
              
              // Navigate back to trading page
              setTimeout(() => {
                this.router.navigate(['/trading']);
              }, 500);
            },
            error: () => {
              // Navigate anyway even if reload fails
              setTimeout(() => {
                this.router.navigate(['/trading']);
              }, 500);
            }
          });
        },
        error: (error) => {
          console.error('Error updating preferences:', error);
          this.snackBar.open('Failed to update preferences', 'Close', { duration: 3000 });
          this.saving = false;
        }
      });
    }
  }

  onTabChange(index: number): void {
    this.activeTab = index;
    this.message = null; // Clear messages when switching tabs
  }

  changePassword(): void {
    if (this.passwordForm.valid) {
      this.saving = true;
      const { currentPassword, newPassword } = this.passwordForm.value;
      
      this.apiService.changePassword({ currentPassword, newPassword }).subscribe({
        next: (response) => {
          this.message = { type: 'success', text: 'Password changed successfully!' };
          this.passwordForm.reset();
          this.saving = false;
        },
        error: (error) => {
          console.error('Error changing password:', error);
          this.message = { type: 'error', text: 'Failed to change password' };
          this.saving = false;
        }
      });
    }
  }

  onColumnChange(key: string, event: any): void {
    this.tradesColumns[key] = event.checked;
  }

  updateColumnPreferences(): void {
    this.saving = true;
    const preferences = { trades_columns: this.tradesColumns };
    
    this.apiService.updateUserPreferences(preferences).subscribe({
      next: (response) => {
        this.message = { type: 'success', text: 'Column preferences saved successfully!' };
        this.saving = false;
      },
      error: (error) => {
        console.error('Error updating column preferences:', error);
        this.message = { type: 'error', text: 'Failed to save column preferences' };
        this.saving = false;
      }
    });
  }

  logout(): void {
    this.authService.logout();
  }
}
