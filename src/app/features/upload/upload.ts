import { ChangeDetectionStrategy, Component, inject, signal, viewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { UploadService } from '../../core/services/upload.service';

@Component({
  selector: 'app-upload',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './upload.html',
  styleUrl: './upload.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'upload-feature-host',
  },
})
export class UploadComponent {
  private uploadService = inject(UploadService);
  private fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  uploadForm = new FormGroup({
    displayName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)],
    }),
    file: new FormControl<File | null>(null, {
      validators: [Validators.required],
    }),
  });

  isUploading = signal(false);
  uploadError = signal<string | null>(null);
  uploadSuccess = signal(false);
  selectedFileName = signal<string | null>(null);
  isDragging = signal(false);

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.handleFile(event.dataTransfer.files[0]);
    }
  }

  triggerFileInput() {
    this.fileInput()?.nativeElement.click();
  }

  private handleFile(file: File) {
    // Basic validation for mime types as requested in the accept attribute
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/markdown',
    ];

    if (!allowedTypes.includes(file.type) && !file.name.endsWith('.md')) {
      this.uploadError.set('Invalid file type. Please upload PDF, TXT, DOCX, or MD files.');
      return;
    }

    this.uploadForm.patchValue({ file });
    this.selectedFileName.set(file.name);
    this.uploadError.set(null);
    this.uploadSuccess.set(false);
  }

  async onSubmit() {
    if (this.uploadForm.invalid || this.isUploading()) {
      return;
    }

    const { displayName, file } = this.uploadForm.value;
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

      this.uploadSuccess.set(true);
      this.uploadForm.reset();
      this.selectedFileName.set(null);
    } catch (error: any) {
      console.error('Upload failed', error);
      let errorMsg = 'An error occurred during upload.';
      if (error?.message?.includes('UPLOAD_FAILED')) {
        errorMsg = 'The file upload failed on the server. Please check the file and try again.';
      } else if (error?.message) {
        errorMsg = error.message;
      }
      this.uploadError.set(errorMsg);
    } finally {
      this.isUploading.set(false);
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the dataURL prefix (e.g., "data:application/pdf;base64,")
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  }
}
