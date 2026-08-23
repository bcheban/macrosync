import type { AssetGroup, AssetMeta } from '../types/domain.js';

/**
 * The tradable universe.
 *
 * Every entry is a live Binance USDT spot pair, so the same list drives the real
 * feed and the offline simulator. `anchor` is only used by the simulator: a
 * rough spot price, a per-bar volatility and a daily quote volume, which keeps
 * an offline demo believable across very different price scales (BTC at ~96k,
 * PEPE at ~0.00001).
 */
export interface AssetEntry extends AssetMeta {
  anchor: { price: number; vol: number; volume: number };
}

export const ASSET_GROUPS: AssetGroup[] = ['majors', 'layer1', 'layer2', 'defi', 'meme', 'ai'];

export const ASSETS: AssetEntry[] = [
  // ---- majors ------------------------------------------------------------
  a('BTCUSDT', 'Bitcoin', 'majors', 96_400, 0.008, 1.9e9),
  a('ETHUSDT', 'Ethereum', 'majors', 3_310, 0.011, 9.4e8),
  a('BNBUSDT', 'BNB', 'majors', 682.4, 0.012, 2.4e8),
  a('SOLUSDT', 'Solana', 'majors', 184.2, 0.017, 3.1e8),
  a('XRPUSDT', 'XRP', 'majors', 2.31, 0.019, 4.2e8),

  // ---- layer 1 -----------------------------------------------------------
  a('ADAUSDT', 'Cardano', 'layer1', 0.892, 0.019, 1.4e8),
  a('AVAXUSDT', 'Avalanche', 'layer1', 36.8, 0.021, 1.1e8),
  a('ICPUSDT', 'Internet Computer', 'layer1', 11.42, 0.024, 5.9e7),
  a('HBARUSDT', 'Hedera', 'layer1', 0.2814, 0.023, 8.4e7),
  a('DOTUSDT', 'Polkadot', 'layer1', 6.94, 0.019, 5.6e7),
  a('NEARUSDT', 'NEAR Protocol', 'layer1', 5.12, 0.023, 7.2e7),
  a('APTUSDT', 'Aptos', 'layer1', 8.64, 0.024, 6.1e7),
  a('SUIUSDT', 'Sui', 'layer1', 4.18, 0.028, 1.6e8),
  a('ATOMUSDT', 'Cosmos', 'layer1', 6.42, 0.02, 4.4e7),
  a('TRXUSDT', 'TRON', 'layer1', 0.2461, 0.011, 9.1e7),
  a('LTCUSDT', 'Litecoin', 'layer1', 104.6, 0.015, 8.3e7),
  a('XLMUSDT', 'Stellar', 'layer1', 0.3418, 0.022, 5.2e7),

  // ---- layer 2 -----------------------------------------------------------
  a('ARBUSDT', 'Arbitrum', 'layer2', 0.7412, 0.026, 6.4e7),
  a('OPUSDT', 'Optimism', 'layer2', 1.684, 0.026, 4.1e7),

  // ---- defi --------------------------------------------------------------
  a('LINKUSDT', 'Chainlink', 'defi', 21.84, 0.021, 1.9e8),
  a('UNIUSDT', 'Uniswap', 'defi', 12.42, 0.024, 7.8e7),
  a('AAVEUSDT', 'Aave', 'defi', 271.5, 0.025, 6.2e7),
  a('INJUSDT', 'Injective', 'defi', 21.06, 0.03, 4.8e7),

  // ---- memecoins ---------------------------------------------------------
  a('DOGEUSDT', 'Dogecoin', 'meme', 0.3182, 0.022, 2.6e8),
  a('SHIBUSDT', 'Shiba Inu', 'meme', 0.00002214, 0.024, 1.4e8),
  a('PEPEUSDT', 'Pepe', 'meme', 0.00001842, 0.033, 1.8e8),

  // ---- ai / depin --------------------------------------------------------
  a('FETUSDT', 'Artificial Superintelligence Alliance', 'ai', 1.284, 0.031, 8.6e7),
  a('TAOUSDT', 'Bittensor', 'ai', 462.8, 0.034, 5.4e7),
];

function a(
  symbol: string,
  name: string,
  group: AssetGroup,
  price: number,
  vol: number,
  volume: number,
): AssetEntry {
  const quote = 'USDT';
  return {
    symbol,
    base: symbol.slice(0, symbol.length - quote.length),
    quote,
    name,
    group,
    anchor: { price, vol, volume },
  };
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
