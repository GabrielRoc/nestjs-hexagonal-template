/**
 * Extrai a chave do objeto S3 a partir de uma URL completa ou assinada.
 * Se o valor ja for uma chave (sem protocolo), devolve inalterado.
 *
 *   "https://bucket.s3.us-east-1.amazonaws.com/uploads/x.jpg?X-Amz-..." -> "uploads/x.jpg"
 *   "http://localhost:4566/bucket/uploads/x.jpg?X-Amz-..."              -> "uploads/x.jpg"
 *   "uploads/x.jpg"                                                     -> "uploads/x.jpg"
 */
export function extractS3Key(value: string | null | undefined): string | null {
  if (!value) return null;

  if (!value.startsWith('http://') && !value.startsWith('https://')) {
    return value;
  }

  try {
    const url = new URL(value);
    let pathname = url.pathname.startsWith('/')
      ? url.pathname.slice(1)
      : url.pathname;

    // URLs virtual-hosted trazem o bucket no hostname; as path-style
    // (LocalStack, MinIO) trazem o bucket como primeiro segmento do caminho.
    const host = url.hostname;
    const isVirtualHosted =
      host.includes('.s3.') ||
      host.endsWith('.amazonaws.com') ||
      host.endsWith('.cloudfront.net');

    if (!isVirtualHosted) {
      const slashIndex = pathname.indexOf('/');
      if (slashIndex > 0) {
        pathname = pathname.slice(slashIndex + 1);
      }
    }

    return pathname;
  } catch {
    return value;
  }
}
