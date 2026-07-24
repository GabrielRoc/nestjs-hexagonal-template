import { generateNanoId, slugify } from './slug.util';

describe('slugify', () => {
  it('remove acentos e normaliza para minusculas', () => {
    expect(slugify('João & Maria')).toBe('joao-maria');
  });

  it('colapsa separadores repetidos', () => {
    expect(slugify('a---b   c')).toBe('a-b-c');
  });

  it('remove hifens das pontas', () => {
    expect(slugify('  !ola!  ')).toBe('ola');
  });

  it('devolve string vazia quando nao sobra nada', () => {
    expect(slugify('!!!')).toBe('');
  });

  it('devolve string vazia para textos sem caracteres ASCII', () => {
    // Alfabetos nao latinos nao sao transliterados: quem usa slugify precisa
    // tratar o resultado vazio (ex.: caindo para um id gerado).
    expect(slugify('日本語')).toBe('');
    expect(slugify('Привет')).toBe('');
  });
});

describe('generateNanoId', () => {
  it('gera 8 caracteres alfanumericos', () => {
    expect(generateNanoId()).toMatch(/^[A-Za-z0-9]{8}$/);
  });

  it('usa somente o alfabeto declarado e mantem o tamanho', () => {
    const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (const id of Array.from({ length: 200 }, () => generateNanoId())) {
      expect(id).toHaveLength(8);
      for (const char of id) {
        expect(alphabet).toContain(char);
      }
    }
  });

  it('nao repete em 100 chamadas', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateNanoId()));
    expect(ids.size).toBe(100);
  });
});
