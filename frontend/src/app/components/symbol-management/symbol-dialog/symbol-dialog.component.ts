import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

interface DialogData {
  mode: 'add' | 'edit';
  symbol?: {
    id: number;
    symbol: string;
    company_name: string;
  };
}

@Component({
  selector: 'app-symbol-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule
  ],
  templateUrl: './symbol-dialog.component.html',
  styleUrls: ['./symbol-dialog.component.scss']
})
export class SymbolDialogComponent {
  symbol: string = '';
  companyName: string = '';
  mode: 'add' | 'edit';

  constructor(
    public dialogRef: MatDialogRef<SymbolDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData
  ) {
    this.mode = data.mode;
    if (data.mode === 'edit' && data.symbol) {
      this.symbol = data.symbol.symbol;
      this.companyName = data.symbol.company_name;
    }
  }

  get title(): string {
    return this.mode === 'add' ? 'Add Stock Symbol' : 'Edit Stock Symbol';
  }

  get submitLabel(): string {
    return this.mode === 'add' ? 'Add' : 'Update';
  }

  isValid(): boolean {
    return this.symbol.trim().length > 0 && this.companyName.trim().length > 0;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSubmit(): void {
    if (this.isValid()) {
      this.dialogRef.close({
        symbol: this.symbol.trim().toUpperCase(),
        company_name: this.companyName.trim()
      });
    }
  }
}
