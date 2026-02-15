export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface StorageServicePort {
  upload(
    key: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ key: string; url: string }>;

  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;

  delete(key: string): Promise<void>;
}
