import type { AssetGroup, AssetMeta } from '../types/domain.js';

/**
 * The tradable universe.
 *
 * Every entry is a live MEXC USDT spot pair — verified against
 * `/api/v3/ticker/24hr`, which lists all 28 of these.
 */
export type AssetEntry = AssetMeta;

export const ASSET_GROUPS: AssetGroup[] = ['majors', 'layer1', 'layer2', 'defi', 'meme', 'ai'];

export const ASSETS: AssetEntry[] = [
  // ---- majors ------------------------------------------------------------
  a('BTCUSDT', 'Bitcoin', 'majors'),
  a('ETHUSDT', 'Ethereum', 'majors'),
  a('BNBUSDT', 'BNB', 'majors'),
  a('SOLUSDT', 'Solana', 'majors'),
  a('XRPUSDT', 'XRP', 'majors'),

  // ---- layer 1 -----------------------------------------------------------
  a('ADAUSDT', 'Cardano', 'layer1'),
  a('AVAXUSDT', 'Avalanche', 'layer1'),
  a('ICPUSDT', 'Internet Computer', 'layer1'),
  a('HBARUSDT', 'Hedera', 'layer1'),
  a('DOTUSDT', 'Polkadot', 'layer1'),
  a('NEARUSDT', 'NEAR Protocol', 'layer1'),
  a('APTUSDT', 'Aptos', 'layer1'),
  a('SUIUSDT', 'Sui', 'layer1'),
  a('ATOMUSDT', 'Cosmos', 'layer1'),
  a('TRXUSDT', 'TRON', 'layer1'),
  a('LTCUSDT', 'Litecoin', 'layer1'),
  a('XLMUSDT', 'Stellar', 'layer1'),

  // ---- layer 2 -----------------------------------------------------------
  a('ARBUSDT', 'Arbitrum', 'layer2'),
  a('OPUSDT', 'Optimism', 'layer2'),

  // ---- defi --------------------------------------------------------------
  a('LINKUSDT', 'Chainlink', 'defi'),
  a('UNIUSDT', 'Uniswap', 'defi'),
  a('AAVEUSDT', 'Aave', 'defi'),
  a('INJUSDT', 'Injective', 'defi'),

  // ---- memecoins ---------------------------------------------------------
  a('DOGEUSDT', 'Dogecoin', 'meme'),
  a('SHIBUSDT', 'Shiba Inu', 'meme'),
  a('PEPEUSDT', 'Pepe', 'meme'),

  // ---- ai / depin --------------------------------------------------------
  a('FETUSDT', 'Artificial Superintelligence Alliance', 'ai'),
  a('TAOUSDT', 'Bittensor', 'ai'),
];

function a(symbol: string, name: string, group: AssetGroup): AssetEntry {
  const quote = 'USDT';
  return { symbol, base: symbol.slice(0, symbol.length - quote.length), quote, name, group };
}

const BY_SYMBOL = new Map(ASSETS.map((asset) => [asset.symbol, asset]));

export const assetBySymbol = (symbol: string): AssetEntry | undefined => BY_SYMBOL.get(symbol);

export const isKnownSymbol = (symbol: string): boolean => BY_SYMBOL.has(symbol);

export const assetCatalog = (): AssetMeta[] =>
  ASSETS.map(({ symbol, base, quote, name, group }) => ({ symbol, base, quote, name, group }));

/** Default watchlist: the majors plus the memecoin the project started with. */
export const DEFAULT_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'SHIBUSDT',
  'LINKUSDT',
];
