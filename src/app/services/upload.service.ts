import { inject, Injectable } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

export interface UploadInput {
  fileData: string; // Base64 encoded file data
  mimeType: string;
  displayName?: string;
}

export interface UploadResponse {
  success: boolean;
  operationName: string;
}

@Injectable({
  providedIn: 'root'
})
export class UploadService {
  private functions = inject(Functions);

  async uploadFile(data: UploadInput): Promise<UploadResponse> {
    const uploadFn = httpsCallable<UploadInput, UploadResponse>(
      this.functions,
      'uploadToFileSearchStore'
    );
    const result = await uploadFn(data);
    return result.data;
  }
}
