// src/lib/tokens.ts
export type Token = {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
};

export const TOKENS: readonly Token[] = [
  // Nativo (solo para UI). NO se usa esta address para 0x, se resuelve a WMON.
  {
    symbol: "MON",
    name: "Monad Native Token",
    address: "0x0000000000000000000000000000000000000000",
    decimals: 18,
  },
  // Wrapped MON — usar este address como sellToken/buyToken en 0x
  {
    symbol: "WMON",
    name: "Wrapped MON",
    address: "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701",
    decimals: 18,
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0xf817257fed379853cDe0fa4F97AB987181B1E5Ea",
    decimals: 6,
  },
  // (opcionales) Deja activos solo los que realmente existan/liquiden en testnet:
  {
    symbol: "USDT",
    name: "Tether USD",
    address: "0x88b8E2161DEDC77EF4ab7585569D2415a1C1055D",
    decimals: 6,
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0xB5a30b0FDc5EA94A52fDc42e3E9760Cb8449Fb37",
    decimals: 18,
  },
] as const;

export function getTokenBySymbol(symbol: string): Token | undefined {
  return TOKENS.find((t) => t.symbol === symbol);
}

/**
 * Usa esta función cuando armes el request a 0x:
 * - Si el usuario eligió MON (nativo), lo resolvemos a WMON.
 * - Si eligió cualquier ERC-20, devolvemos el address tal cual.
 */
export function resolveSellTokenAddress(symbol: string): `0x${string}` {
  if (symbol === "MON") {
    const wmon = getTokenBySymbol("WMON");
    if (!wmon) throw new Error("WMON no está configurado en TOKENS");
    return wmon.address;
  }
  const t = getTokenBySymbol(symbol);
  if (!t) throw new Error(`Token no soportado: ${symbol}`);
  return t.address;
}

/** Devuelve los decimales que debes usar en sellAmount (base units) */
export function resolveTokenDecimals(symbol: string): number {
  if (symbol === "MON") return 18; // nativo → WMON (18)
  const t = getTokenBySymbol(symbol);
  if (!t) throw new Error(`Token no soportado: ${symbol}`);
  return t.decimals;
}