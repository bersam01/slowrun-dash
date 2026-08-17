// Catalogue des réseaux crypto supportés (miroir du catalogue de l'edge function crypto-topup).
export type CryptoCatalogEntry = {
  id: string;
  label: string;
  token_symbol: string;
  /** "native" ou adresse de contrat / mint SPL */
  contract: string;
  sort_order: number;
};

export const CRYPTO_CATALOG: CryptoCatalogEntry[] = [
  { id: "TRC20", label: "USDT · TRON (TRC20)", token_symbol: "USDT", contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", sort_order: 1 },
  { id: "TRXNATIVE", label: "TRX · TRON", token_symbol: "TRX", contract: "native", sort_order: 2 },
  { id: "SOL", label: "USDC · Solana (SPL)", token_symbol: "USDC", contract: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", sort_order: 3 },
  { id: "SOLUSDT", label: "USDT · Solana (SPL)", token_symbol: "USDT", contract: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", sort_order: 4 },
  { id: "SOLNATIVE", label: "SOL · Solana", token_symbol: "SOL", contract: "native", sort_order: 5 },
  { id: "ETH", label: "ETH · Ethereum", token_symbol: "ETH", contract: "native", sort_order: 6 },
  { id: "ETHUSDT", label: "USDT · Ethereum (ERC20)", token_symbol: "USDT", contract: "0xdac17f958d2ee523a2206206994597c13d831ec7", sort_order: 7 },
  { id: "ETHUSDC", label: "USDC · Ethereum (ERC20)", token_symbol: "USDC", contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", sort_order: 8 },
  { id: "BNB", label: "BNB · BNB Chain", token_symbol: "BNB", contract: "native", sort_order: 9 },
  { id: "BSCUSDT", label: "USDT · BNB Chain (BEP20)", token_symbol: "USDT", contract: "0x55d398326f99059ff775485246999027b3197955", sort_order: 10 },
  { id: "BASEETH", label: "ETH · Base", token_symbol: "ETH", contract: "native", sort_order: 11 },
  { id: "BASEUSDC", label: "USDC · Base", token_symbol: "USDC", contract: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", sort_order: 12 },
  { id: "ARBETH", label: "ETH · Arbitrum", token_symbol: "ETH", contract: "native", sort_order: 13 },
  { id: "ARBUSDT", label: "USDT · Arbitrum", token_symbol: "USDT", contract: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", sort_order: 14 },
  { id: "OPETH", label: "ETH · Optimism", token_symbol: "ETH", contract: "native", sort_order: 15 },
  { id: "POLNATIVE", label: "POL · Polygon", token_symbol: "POL", contract: "native", sort_order: 16 },
  { id: "POLUSDT", label: "USDT · Polygon", token_symbol: "USDT", contract: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", sort_order: 17 },
  { id: "AVAX", label: "AVAX · Avalanche C-Chain", token_symbol: "AVAX", contract: "native", sort_order: 18 },
  { id: "BTC", label: "BTC · Bitcoin", token_symbol: "BTC", contract: "native", sort_order: 19 },
  { id: "LTC", label: "LTC · Litecoin", token_symbol: "LTC", contract: "native", sort_order: 20 },
  { id: "DOGE", label: "DOGE · Dogecoin", token_symbol: "DOGE", contract: "native", sort_order: 21 },
  { id: "BCH", label: "BCH · Bitcoin Cash", token_symbol: "BCH", contract: "native", sort_order: 22 },
];
