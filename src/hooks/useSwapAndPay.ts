// /src/hooks/useSwapAndPay.ts
// Hook para flujo 2-pasos: approve (si hace falta) → swap (0x) → transfer (USDC → receiver)
//
// Requisitos:
// - wagmi v1
// - viem
// - tus utilidades:
//   - resolveSellTokenAddress, resolveTokenDecimals (de tokens.ts)
//   - getOxPrice, getOxQuote (de lib/zeroEx.ts)
//   - swapAndPay (de actions/swapAndPay.ts)

import { useCallback, useMemo, useState } from "react";
import type { Address } from "viem";
import { parseUnits } from "viem";
import { useAccount } from "wagmi";
import { resolveSellTokenAddress, resolveTokenDecimals } from "../lib/tokens";
import { getOxPrice, getOxQuote } from "../lib/zeroEx";
import { swapAndPay, type OxQuote } from "../actions/swapAndPay";

export type UseSwapAndPayOptions = {
  /** Dirección del token de salida (p.ej., USDC). */
  buyTokenAddress: Address;
  /** Bps de slippage (100 = 1%). Default: 100 */
  slippageBps?: number;
  /** Callback opcional cuando todo sale OK */
  onSuccess?: (res: { swapHash: `0x${string}`; transferHash: `0x${string}` }) => void;
  /** Callback opcional para errores */
  onError?: (err: unknown) => void;
  /** Validación opcional extra antes de ejecutar (ej. límites UI) */
  validate?: (args: {
    taker: Address;
    receiver: Address;
    sellSymbol: string;
    uiAmount: string;
  }) => void;
};

export type UseSwapAndPayState = {
  loadingPrice: boolean;
  loadingQuote: boolean;
  loadingExecute: boolean;
  price?: { price: string; buyAmount: string; sellAmount: string };
  quote?: OxQuote;
  lastSwapHash?: `0x${string}`;
  lastTransferHash?: `0x${string}`;
  error?: string;
};

export function useSwapAndPay(options: UseSwapAndPayOptions) {
  const { address: taker } = useAccount();
  const [state, setState] = useState<UseSwapAndPayState>({
    loadingPrice: false,
    loadingQuote: false,
    loadingExecute: false,
  });

  const slippageBps = options.slippageBps ?? 100;

  // Helpers internos
  const resetTransient = useCallback(() => {
    setState((s) => ({
      ...s,
      error: undefined,
      lastSwapHash: undefined,
      lastTransferHash: undefined,
    }));
  }, []);

  const canExecute = useMemo(() => !!taker && !!options.buyTokenAddress, [taker, options.buyTokenAddress]);

  // 1) Vista previa de precio (opcional, para UI)
  const preview = useCallback(
    async (args: { sellSymbol: "MON" | "WMON" | string; uiAmount: string; receiver?: Address }) => {
      resetTransient();
      if (!taker) throw new Error("Conecta tu wallet.");
      const { sellSymbol, uiAmount } = args;

      // Validación custom opcional
      options.validate?.({ taker, receiver: (args.receiver as Address) ?? taker, sellSymbol, uiAmount });

      const sellToken = resolveSellTokenAddress(sellSymbol) as Address;
      const decimals = resolveTokenDecimals(sellSymbol);
      const sellAmount = parseUnits(uiAmount || "0", decimals);

      setState((s) => ({ ...s, loadingPrice: true, error: undefined }));
      try {
        const p = await getOxPrice({
          sellToken,
          buyToken: options.buyTokenAddress,
          sellAmount,
          taker,
          slippageBps,
        });
        setState((s) => ({
          ...s,
          price: { price: p.price, buyAmount: p.buyAmount, sellAmount: p.sellAmount },
        }));
        return p;
      } catch (err: any) {
        const msg = err?.message || "No se pudo obtener el precio.";
        setState((s) => ({ ...s, error: msg }));
        options.onError?.(err);
        throw err;
      } finally {
        setState((s) => ({ ...s, loadingPrice: false }));
      }
    },
    [taker, options.buyTokenAddress, slippageBps, options, resetTransient]
  );

  // 2) Obtener quote ejecutable
  const quote = useCallback(
    async (args: { sellSymbol: "MON" | "WMON" | string; uiAmount: string; receiver?: Address }) => {
      resetTransient();
      if (!taker) throw new Error("Conecta tu wallet.");
      const { sellSymbol, uiAmount } = args;

      options.validate?.({ taker, receiver: (args.receiver as Address) ?? taker, sellSymbol, uiAmount });

      const sellToken = resolveSellTokenAddress(sellSymbol) as Address;
      const decimals = resolveTokenDecimals(sellSymbol);
      const sellAmount = parseUnits(uiAmount || "0", decimals);

      setState((s) => ({ ...s, loadingQuote: true, error: undefined }));
      try {
        const q = await getOxQuote({
          sellToken,
          buyToken: options.buyTokenAddress,
          sellAmount,
          taker,
          slippageBps,
        });
        setState((s) => ({ ...s, quote: q }));
        return { quote: q, sellToken, sellAmount };
      } catch (err: any) {
        const msg = err?.message || "No se pudo obtener la cotización (quote).";
        setState((s) => ({ ...s, error: msg }));
        options.onError?.(err);
        throw err;
      } finally {
        setState((s) => ({ ...s, loadingQuote: false }));
      }
    },
    [taker, options.buyTokenAddress, slippageBps, options, resetTransient]
  );

  // 3) Ejecutar: approve (si necesario) → swap → transfer
  const execute = useCallback(
    async (args: {
      sellSymbol: "MON" | "WMON" | string;
      uiAmount: string;
      receiver: Address; // requerido: a dónde enviar el USDC
    }) => {
      resetTransient();
      if (!taker) throw new Error("Conecta tu wallet.");
      const { sellSymbol, uiAmount, receiver } = args;

      options.validate?.({ taker, receiver, sellSymbol, uiAmount });

      // Aseguramos tener quote actual
      const { quote: q, sellToken, sellAmount } = await quote({ sellSymbol, uiAmount, receiver });

      setState((s) => ({ ...s, loadingExecute: true, error: undefined }));
      try {
        const res = await swapAndPay({
          quote: q as OxQuote,
          receiver,
          buyTokenAddress: options.buyTokenAddress,
          autoApprove: {
            sellToken,
            sellAmount,
          },
        });

        setState((s) => ({
          ...s,
          lastSwapHash: res.swapHash,
          lastTransferHash: res.transferHash,
        }));

        options.onSuccess?.({ swapHash: res.swapHash, transferHash: res.transferHash });
        return res;
      } catch (err: any) {
        const msg = err?.message || "Fallo al ejecutar el swap y pago.";
        setState((s) => ({ ...s, error: msg }));
        options.onError?.(err);
        throw err;
      } finally {
        setState((s) => ({ ...s, loadingExecute: false }));
      }
    },
    [taker, options.buyTokenAddress, options, quote, resetTransient]
  );

  return {
    ...state,
    canExecute,
    preview, // opcional
    quote,   // para precalentar el swap
    execute, // acción principal: approve (si falta) → swap → transfer
  };
}