import { extractS3Key } from './s3-key.util';

describe('extractS3Key', () => {
  it('devolve a chave quando ja e uma chave', () => {
    expect(extractS3Key('uploads/foo.jpg')).toBe('uploads/foo.jpg');
  });

  it('extrai de URL virtual-hosted da AWS', () => {
    expect(
      extractS3Key(
        'https://bucket.s3.us-east-1.amazonaws.com/uploads/foo.jpg?X-Amz-Signature=abc',
        'bucket',
      ),
    ).toBe('uploads/foo.jpg');
  });

  it('extrai de URL path-style removendo o bucket', () => {
    expect(
      extractS3Key(
        'http://localhost:4566/meu-bucket/uploads/foo.jpg?X-Amz=1',
        'meu-bucket',
      ),
    ).toBe('uploads/foo.jpg');
  });

  it('extrai de endpoint path-style regional da AWS', () => {
    expect(
      extractS3Key(
        'https://s3.us-east-1.amazonaws.com/my-bucket/uploads/x.jpg',
        'my-bucket',
      ),
    ).toBe('uploads/x.jpg');
  });

  it('preserva o caminho completo de dominios customizados', () => {
    expect(extractS3Key('https://cdn.example.com/uploads/x.jpg')).toBe(
      'uploads/x.jpg',
    );
    expect(
      extractS3Key('https://cdn.example.com/uploads/x.jpg', 'my-bucket'),
    ).toBe('uploads/x.jpg');
  });

  it('extrai de URL do CloudFront sem remover segmento', () => {
    expect(extractS3Key('https://d1.cloudfront.net/uploads/foo.jpg')).toBe(
      'uploads/foo.jpg',
    );
  });

  it('decodifica caracteres percent-encoded', () => {
    expect(
      extractS3Key(
        'https://bucket.s3.amazonaws.com/uploads/relat%C3%B3rio.pdf',
        'bucket',
      ),
    ).toBe('uploads/relatório.pdf');
    expect(
      extractS3Key('https://bucket.s3.amazonaws.com/uploads/meu%20arquivo.pdf'),
    ).toBe('uploads/meu arquivo.pdf');
  });

  it('devolve o caminho cru quando o escape e malformado', () => {
    expect(
      extractS3Key(
        'https://bucket.s3.amazonaws.com/uploads/quebra%E0%A4%A.pdf',
      ),
    ).toBe('uploads/quebra%E0%A4%A.pdf');
  });

  it('so remove o bucket quando ele e o primeiro segmento', () => {
    expect(
      extractS3Key(
        'http://localhost:4566/outro-bucket/uploads/foo.jpg',
        'meu-bucket',
      ),
    ).toBe('outro-bucket/uploads/foo.jpg');
  });

  it('devolve null para valores vazios', () => {
    expect(extractS3Key(null)).toBeNull();
    expect(extractS3Key(undefined)).toBeNull();
    expect(extractS3Key('')).toBeNull();
  });

  it('e idempotente para URLs path-style', () => {
    const url = 'http://localhost:4566/meu-bucket/uploads/foo.jpg';
    const key = extractS3Key(url, 'meu-bucket');
    expect(key).toBe('uploads/foo.jpg');
    expect(extractS3Key(key, 'meu-bucket')).toBe('uploads/foo.jpg');
  });
});
