import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, RegisterRequest } from '../../services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PasswordRequirements } from '../password-requirements/password-requirements.component';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent {
  registerForm: FormGroup;
  loading = false;
  hidePassword = true;
  hideConfirmPassword = true;
  passwordRequirements: PasswordRequirements = {
    minLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
    hasSpecial: false,
    passwordsMatch: false
  };

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    this.registerForm = this.fb.group({
      name: ['jeff', [Validators.required, Validators.minLength(2)]],
      email: ['kyzereye@gmail.com', [Validators.required, Validators.email]],
      password: ['1qazxsw2!QAZ', [Validators.required, this.passwordStrengthValidator.bind(this)]],
      confirmPassword: ['1qazxsw2!QAZ', Validators.required]
    }, { validators: this.passwordMatchValidator });

    // Watch password changes to update requirements checklist
    this.registerForm.get('password')?.valueChanges.subscribe(password => {
      this.updatePasswordRequirements(password, this.registerForm.get('confirmPassword')?.value);
    });

    this.registerForm.get('confirmPassword')?.valueChanges.subscribe(confirmPassword => {
      this.updatePasswordRequirements(this.registerForm.get('password')?.value, confirmPassword);
    });
  }

  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');
    
    if (password && confirmPassword && password.value !== confirmPassword.value) {
      confirmPassword.setErrors({ passwordMismatch: true });
    } else {
      if (confirmPassword?.errors?.['passwordMismatch']) {
        delete confirmPassword.errors['passwordMismatch'];
        if (Object.keys(confirmPassword.errors).length === 0) {
          confirmPassword.setErrors(null);
        }
      }
    }
    
    return null;
  }

  passwordStrengthValidator(control: AbstractControl): { [key: string]: any } | null {
    const value = control.value;
    if (!value) {
      return null;
    }

    const errors: any = {};

    if (value.length < 11) {
      errors.minLength = true;
    }
    if (!/[a-z]/.test(value)) {
      errors.lowercase = true;
    }
    if (!/[A-Z]/.test(value)) {
      errors.uppercase = true;
    }
    if (!/[0-9]/.test(value)) {
      errors.number = true;
    }
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

  onSubmit(): void {
    if (this.registerForm.valid) {
      this.loading = true;
      const formValue = this.registerForm.value;
      
      const request: RegisterRequest = {
        name: formValue.name,
        email: formValue.email,
        password: formValue.password
      };

      this.authService.register(request).subscribe({
        next: (response) => {
          this.loading = false;
          this.snackBar.open('Registration successful! Please check your email to verify your account.', 'Close', { duration: 5000 });
          this.router.navigate(['/login']);
        },
        error: (error) => {
          this.loading = false;
          // Error is handled by the error interceptor
        }
      });
    }
  }

  switchToLogin(): void {
    this.router.navigate(['/login']);
  }
}
