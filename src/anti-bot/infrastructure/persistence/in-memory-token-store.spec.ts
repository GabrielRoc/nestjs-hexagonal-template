import { InMemoryTokenStore } from './in-memory-token-store';

const TTL_MS = 30 * 60 * 1000;
const START = 1_700_000_000_000;

describe('InMemoryTokenStore', () => {
  let store: InMemoryTokenStore;
  let now: number;

  function entryCount(): number {
    return store['used'].size;
  }

  beforeEach(() => {
    now = START;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    store = new InMemoryTokenStore();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('aceita o primeiro uso e recusa o segundo', async () => {
    await expect(store.markUsed('jti-1', TTL_MS)).resolves.toBe(true);
    await expect(store.markUsed('jti-1', TTL_MS)).resolves.toBe(false);
    await expect(store.markUsed('jti-1', TTL_MS)).resolves.toBe(false);
  });

  it('nao confunde tokens diferentes', async () => {
    await expect(store.markUsed('jti-1', TTL_MS)).resolves.toBe(true);
    await expect(store.markUsed('jti-2', TTL_MS)).resolves.toBe(true);
  });

  it('mantem a marca de uso durante todo o TTL', async () => {
    await store.markUsed('jti-1', TTL_MS);

    now = START + TTL_MS - 1;

    await expect(store.markUsed('jti-1', TTL_MS)).resolves.toBe(false);
  });

  it('remove a marca depois do TTL (o token em si ja expirou antes)', async () => {
    await store.markUsed('jti-1', TTL_MS);

    now = START + TTL_MS + 1;

    await expect(store.markUsed('jti-1', TTL_MS)).resolves.toBe(true);
  });

  it('varre as entradas expiradas sem depender de scheduler', async () => {
    for (let i = 0; i < 50; i += 1) {
      await store.markUsed(`jti-${i}`, TTL_MS);
    }
    expect(entryCount()).toBe(50);

    // A varredura e amortizada na escrita e roda no maximo uma vez por minuto.
    now = START + TTL_MS + 60_001;
    await store.markUsed('jti-novo', TTL_MS);

    expect(entryCount()).toBe(1);
  });

  it('nao varre mais de uma vez por minuto', async () => {
    await store.markUsed('jti-1', TTL_MS);
    now = START + TTL_MS + 60_001;
    await store.markUsed('jti-2', TTL_MS);

    // Entrada expirada criada logo depois da varredura anterior: continua no Map
    // ate a proxima janela, e e isso que o teto de entradas cobre.
    now += 1;
    store['used'].set('jti-velho', now - 1);
    await store.markUsed('jti-3', TTL_MS);

    expect(entryCount()).toBe(3);
    expect(store['used'].has('jti-velho')).toBe(true);
  });
});
