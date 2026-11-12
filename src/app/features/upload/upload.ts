import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConversationService } from '../../services/conversation.service';
import { UploadService } from '../../services/upload.service';

@Component({
  selector: 'app-upload',
  imports: [CommonModule, DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './upload.html',
  styleUrl: './upload.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'upload-feature-host',
  },
})
export class UploadComponent {
  private readonly uploadService = inject(UploadService);
  readonly conversationService = inject(ConversationService);

  readonly uploadForm = new FormGroup({
    displayName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)],
    }),
    file: new FormControl<File | null>(null, {
      validators: [Validators.required],
    }),
  });

  readonly isUploading = signal(false);
  readonly uploadError = signal<string | null>(null);
  readonly uploadSuccess = signal(false);
  readonly selectedFileName = signal<string | null>(null);
  readonly selectedFileSize = signal<string | null>(null);
  readonly isDragging = signal(false);

  get isDisplayNameInvalid(): boolean {
    const ctrl = this.uploadForm.controls.displayName;
    return ctrl.invalid && ctrl.touched;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.handleFile(event.dataTransfer.files[0]);
    }
  }

  clearSelectedFile(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.uploadForm.patchValue({ file: null });
    this.selectedFileName.set(null);
    this.selectedFileSize.set(null);
  }

  async onSubmit(): Promise<void> {
    if (this.uploadForm.invalid) {
      this.uploadForm.markAllAsTouched();
      return;
    }
    if (this.isUploading()) return;

    const { displayName, file } = this.uploadForm.getRawValue();
    if (!file) return;

    this.isUploading.set(true);
    this.uploadError.set(null);
    this.uploadSuccess.set(false);

    try {
      const base64Data = await this.fileToBase64(file);
      const mimeType = file.type || 'application/octet-stream';

      await this.uploadService.uploadFile({
        fileData: base64Data,
        mimeType,
        displayName,
      });

      this.conversationService.recordUploadedDocument({
        displayName,
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
      });

      this.uploadSuccess.set(true);
      this.uploadForm.reset();
      this.selectedFileName.set(null);
      this.selectedFileSize.set(null);
    } catch (error: unknown) {
      console.error('Upload failed', error);
      const rawMsg = error instanceof Error ? error.message : '';
      let errorMsg = 'An error occurred during upload.';
      if (rawMsg.includes('UPLOAD_FAILED')) {
        errorMsg = 'The file upload failed on the server. Please check the file and try again.';
      } else if (rawMsg) {
        errorMsg = rawMsg;
      }
      this.uploadError.set(errorMsg);
    } finally {
      this.isUploading.set(false);
    }
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  private handleFile(file: File): void {
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/markdown',
    ];

    const lowerName = file.name.toLowerCase();
    const validExtension =
      lowerName.endsWith('.pdf') ||
      lowerName.endsWith('.txt') ||
      lowerName.endsWith('.docx') ||
      lowerName.endsWith('.md');

    if (!allowedTypes.includes(file.type) && !validExtension) {
      this.uploadError.set('Invalid file type. Please upload PDF, DOCX, TXT, or MD files.');
      return;
    }

    this.uploadForm.patchValue({ file });
    this.selectedFileName.set(file.name);
    this.selectedFileSize.set(this.formatBytes(file.size));
    this.uploadError.set(null);
    this.uploadSuccess.set(false);

    // Pre-fill display name from filename if user hasn't entered one yet
    if (!this.uploadForm.controls.displayName.value.trim()) {
      const derived = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .trim();
      if (derived.length >= 3) {
        this.uploadForm.controls.displayName.setValue(derived);
      }
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] ?? '';
        resolve(base64);
      };
      reader.onerror = (err) => reject(err);
    });
  }
}
