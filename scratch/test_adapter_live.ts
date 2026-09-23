import { LiveSectorsClient, SectorsAdapter } from './packages/sectors-adapter/src/index';
import fs from 'fs';

const env = fs.readFileSync('apps/web/.env.local', 'utf-8');
const keyMatch = env.match(/SECTORS_API_KEY=([^\r\n]+)/);
const key = keyMatch ? keyMatch[1].replace(/["']/g, '').trim() : '';

async function test() {
  const client = new LiveSectorsClient({
    baseUrl: 'https://api.sectors.app',
    apiKey: key,
  });
  const mockCache: any = {
    get: async () => null,
    set: async () => {},
  };
  const adapter = new SectorsAdapter(client, mockCache);

  console.log('Fetching most traded...');
  const mt = await adapter.getMostTraded();
  console.log('Most traded items count:', mt.data.length);
  console.log('Sample most traded:', mt.data.slice(0, 3));

  console.log('Fetching top company movers...');
  const movers = await adapter.getTopCompanyMovers();
  console.log('Gainers count:', movers.data.gainers.length);
  console.log('Losers count:', movers.data.losers.length);
  console.log('Sample gainer:', movers.data.gainers.slice(0, 3));
  console.log('Sample loser:', movers.data.losers.slice(0, 3));
}

test().catch(e => console.error(e));
