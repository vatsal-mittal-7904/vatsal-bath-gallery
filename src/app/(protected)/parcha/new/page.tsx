/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function ParchaUploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selectedFile.type)) {
      setError('Please select a valid image file (JPEG, PNG, WebP).');
      setFile(null);
      setPreviewUrl(null);
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB.');
      setFile(null);
      setPreviewUrl(null);
      return;
    }

    setFile(selectedFile);
    setPreviewUrl(URL.createObjectURL(selectedFile));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Direct fetch instead of fetchApi since we are sending FormData
      const res = await fetch('/api/v1/parcha-jobs', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      router.push(`/parcha/${data.parchaJob.id}`);
    } catch (err: any) {
      setError(err.message || 'An error occurred during upload.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Upload Parcha Image</h1>
      
      <Card className="p-6">
        <form onSubmit={handleUpload} className="space-y-6">
          {error && <div className="p-3 bg-red-50 text-red-600 rounded">{error}</div>}

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            {previewUrl ? (
              <div className="space-y-4">
                <img src={previewUrl} alt="Preview" className="max-h-96 mx-auto object-contain rounded" />
                <p className="text-sm text-gray-500 font-medium">{file?.name} ({(file!.size / 1024 / 1024).toFixed(2)} MB)</p>
                <div className="flex justify-center gap-2">
                  <Button type="button" variant="secondary" onClick={() => { setFile(null); setPreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="py-12">
                <p className="text-sm text-gray-500 mb-4">Select or capture a photo of the handwritten item list.</p>
                <Button type="button" onClick={() => fileInputRef.current?.click()}>
                  Choose Image
                </Button>
                <p className="text-xs text-gray-400 mt-2">JPEG, PNG, WebP up to 10MB</p>
              </div>
            )}
            
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/jpeg, image/png, image/webp" 
              capture="environment"
              onChange={handleFileChange} 
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={!file || loading}>
              {loading ? 'Uploading...' : 'Upload & Create Job'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
