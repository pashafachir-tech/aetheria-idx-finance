import { describe, it, expect } from 'vitest';
import { LiveSectorsClient, SectorsAdapter } from '../packages/sectors-adapter/src/index';
import fs from 'fs';

describe('Live SectorsAdapter Integration', () => {
  it('fetches most traded and top company movers cleanly', async () => {
    const env = fs.readFileSync('apps/web/.env.local', 'utf-8');
    const keyMatch = env.match(/SECTORS_API_KEY=([^\r\n]+)/);
    const key = keyMatch ? keyMatch[1].replace(/["']/g, '').trim() : '';

    const client = new LiveSectorsClient({
      baseUrl: 'https://api.sectors.app',
      apiKey: key,
    });
    const mockCache: any = {
      get: async () => null,
      set: async () => {},
    };
    const adapter = new SectorsAdapter(client, mockCache);

    const mt = await adapter.getMostTraded();
    console.log('Most traded count:', mt.data.length);
    expect(mt.data.length).toBeGreaterThan(0);
    expect(mt.data[0].symbol).toBeTruthy();
    expect(mt.data[0].price).toBeGreaterThan(0);

    const movers = await adapter.getTopCompanyMovers();
    console.log('Gainers count:', movers.data.gainers.length);
    console.log('Losers count:', movers.data.losers.length);
    expect(movers.data.gainers.length).toBeGreaterThan(0);
    expect(movers.data.losers.length).toBeGreaterThan(0);

    const topG = await adapter.getTopGainers();
    expect(topG.data.length).toBeGreaterThan(0);

    const topL = await adapter.getTopLosers();
    expect(topL.data.length).toBeGreaterThan(0);
  }, 20000);
});
