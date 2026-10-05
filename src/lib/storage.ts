import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

// Store outside the public folder to ensure it's not directly accessible via Next.js routing
const STORAGE_DIR = path.join(process.cwd(), 'data', 'uploads');

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function ensureStorageDir() {
  try {
    await fs.access(STORAGE_DIR);
  } catch {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  }
}


function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 12) return false;
  
  const hex = buffer.toString('hex', 0, 12).toUpperCase();
  
  if (mimeType === 'image/jpeg' && hex.startsWith('FFD8FF')) {
    return true;
  }
  if (mimeType === 'image/png' && hex.startsWith('89504E470D0A1A0A')) {
    return true;
  }
  if (mimeType === 'image/webp' && hex.startsWith('52494646') && buffer.toString('utf8', 8, 12) === 'WEBP') {
    return true;
  }
  return false;
}

export async function saveFile(buffer: Buffer, originalFilename: string, mimeType: string): Promise<string> {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error('Unsupported file type');
  }
  if (!validateMagicBytes(buffer, mimeType)) {
    throw new Error('File content does not match its MIME type');
  }
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error('File exceeds maximum allowed size');
  }

  await ensureStorageDir();

  // Create a safe, random storage key
  const ext = path.extname(originalFilename).toLowerCase();
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.bin';
  const storageKey = crypto.randomUUID() + safeExt;
  const filePath = path.join(STORAGE_DIR, storageKey);

  // Path traversal protection natively handled by joining with STORAGE_DIR and using random UUID
  await fs.writeFile(filePath, buffer);

  return storageKey;
}

export async function getFile(storageKey: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  // Prevent path traversal
  if (storageKey.includes('/') || storageKey.includes('\\') || storageKey.includes('..')) {
    throw new Error('Invalid storage key');
  }

  const filePath = path.join(STORAGE_DIR, storageKey);

  try {
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(storageKey).toLowerCase();
    
    let mimeType = 'application/octet-stream';
    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    if (ext === '.png') mimeType = 'image/png';
    if (ext === '.webp') mimeType = 'image/webp';

    return { buffer, mimeType };
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
