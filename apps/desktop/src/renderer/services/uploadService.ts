/**
 * Upload service: presign → PUT → confirm flow
 */
import { API_BASE_URL } from '@renderer/config';

export interface UploadResult {
  url: string;
  fileKey: string;
  size: number;
  mimeType: string;
}

export interface UploadProgressCallback {
  (progress: number): void; // 0.0 - 1.0
}

const SIZE_LIMITS: Record<string, number> = {
  image: 10 * 1024 * 1024, // 10MB
  file: 50 * 1024 * 1024,  // 50MB
  avatar: 5 * 1024 * 1024, // 5MB
  voice: 10 * 1024 * 1024, // 10MB
};

export async function uploadFile(
  file: File,
  category: 'image' | 'file' | 'avatar' | 'voice',
  onProgress?: UploadProgressCallback,
): Promise<UploadResult> {
  const token = await window.electronAPI.getToken();
  if (!token) throw new Error('Not authenticated');

  // Check size limit
  const limit = SIZE_LIMITS[category] ?? SIZE_LIMITS.file;
  if (file.size > limit) {
    throw new Error(`File too large (max ${Math.round(limit / 1024 / 1024)}MB)`);
  }

  const mimeType = file.type || 'application/octet-stream';

  onProgress?.(0.05);

  // Step 1: Presign
  const presignRes = await fetch(
    `${API_BASE_URL}/api/v1/upload/presign?filename=${encodeURIComponent(file.name)}&mimeType=${encodeURIComponent(mimeType)}&category=${category}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!presignRes.ok) {
    const err = await presignRes.text();
    throw new Error(`Presign failed: ${err}`);
  }
  const { uploadUrl, fileKey } = await presignRes.json();

  onProgress?.(0.1);

  // Step 2: PUT to S3/MinIO
  const xhr = new XMLHttpRequest();
  await new Promise<void>((resolve, reject) => {
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', mimeType);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress?.(0.1 + 0.7 * (e.loaded / e.total));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.send(file);
  });

  onProgress?.(0.85);

  // Step 3: Confirm
  const confirmRes = await fetch(
    `${API_BASE_URL}/api/v1/upload/confirm`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ fileKey }),
    },
  );
  if (!confirmRes.ok) {
    const err = await confirmRes.text();
    throw new Error(`Confirm failed: ${err}`);
  }
  const result = await confirmRes.json();

  onProgress?.(1.0);

  return {
    url: result.url,
    fileKey: result.fileKey,
    size: result.size,
    mimeType: result.mimeType,
  };
}
