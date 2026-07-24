/**
 * Extrai a chave do objeto S3 a partir de uma URL completa ou assinada.
 * Se o valor ja for uma chave (sem protocolo), devolve inalterado.
 *
 * O estilo da URL nao pode ser deduzido do hostname: `s3.<regiao>.amazonaws.com`
 * e path-style e `cdn.exemplo.com` pode ser virtual-hosted. Por isso o bucket e
 * informado explicitamente e removido do inicio do caminho quando presente.
 *
 *   extractS3Key("https://b.s3.us-east-1.amazonaws.com/uploads/x.jpg?X-Amz=1")
 *     -> "uploads/x.jpg"
 *   extractS3Key("https://s3.us-east-1.amazonaws.com/b/uploads/x.jpg", "b")
 *     -> "uploads/x.jpg"
 *   extractS3Key("http://localhost:4566/b/uploads/x.jpg", "b")
 *     -> "uploads/x.jpg"
 *   extractS3Key("uploads/x.jpg")
 *     -> "uploads/x.jpg"
 */
export function extractS3Key(
  value: string | null | undefined,
  bucket?: string | null,
): string | null {
  if (!value) return null;

  if (!value.startsWith('http://') && !value.startsWith('https://')) {
    return value;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }

  let key = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;

  // URLs path-style (LocalStack, MinIO e tambem s3.<regiao>.amazonaws.com)
  // trazem o bucket como primeiro segmento do caminho; virtual-hosted nao.
  if (bucket) {
    const prefix = `${bucket}/`;
    if (key.startsWith(prefix)) {
      key = key.slice(prefix.length);
    }
  }

  // pathname vem percent-encoded; sem decodificar, chaves com acento ou espaco
  // seriam codificadas de novo ao chegar no GetObjectCommand.
  try {
    return decodeURIComponent(key);
  } catch {
    // Escape malformado (ex.: "%E0%A4%A"): devolve o caminho como veio.
    return key;
  }
}
