import { extractS3Key } from './s3-key.util';

describe('extractS3Key', () => {
  it('devolve a chave quando ja e uma chave', () => {
    expect(extractS3Key('uploads/foo.jpg')).toBe('uploads/foo.jpg');
  });

  it('extrai de URL virtual-hosted da AWS', () => {
    expect(
      extractS3Key(
        'https://bucket.s3.us-east-1.amazonaws.com/uploads/foo.jpg?X-Amz-Signature=abc',
      ),
    ).toBe('uploads/foo.jpg');
  });

  it('extrai de URL path-style removendo o bucket', () => {
    expect(
      extractS3Key('http://localhost:4566/meu-bucket/uploads/foo.jpg?X-Amz=1'),
    ).toBe('uploads/foo.jpg');
  });

  it('extrai de URL do CloudFront sem remover segmento', () => {
    expect(extractS3Key('https://d1.cloudfront.net/uploads/foo.jpg')).toBe(
      'uploads/foo.jpg',
    );
  });

  it('devolve null para valores vazios', () => {
    expect(extractS3Key(null)).toBeNull();
    expect(extractS3Key(undefined)).toBeNull();
    expect(extractS3Key('')).toBeNull();
  });

  it('e idempotente', () => {
    const url = 'https://bucket.s3.amazonaws.com/uploads/foo.jpg';
    expect(extractS3Key(extractS3Key(url))).toBe('uploads/foo.jpg');
  });
});
