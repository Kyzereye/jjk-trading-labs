import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { ConfirmationDialogComponent, ConfirmationDialogData } from '../components/shared/confirmation-dialog/confirmation-dialog.component';

@Injectable({
  providedIn: 'root'
})
export class ConfirmationService {
  constructor(private dialog: MatDialog) {}

  /**
   * Opens a confirmation dialog
   * @returns Observable<boolean> - true if confirmed, false if canceled
   */
  confirm(data: ConfirmationDialogData): Observable<boolean> {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '500px',
      data,
      disableClose: false
    });

    return dialogRef.afterClosed();
  }

  /**
   * Shorthand for delete confirmation
   */
  confirmDelete(itemName: string, itemType: string = 'item'): Observable<boolean> {
    return this.confirm({
      title: `Delete ${itemType}`,
      message: `Are you sure you want to delete <strong>${itemName}</strong>?<br><br>This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDanger: true
    });
  }
}
