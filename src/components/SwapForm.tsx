// /src/components/SwapForm.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Address } from "viem";
import { parseUnits } from "viem";
import { useAccount, useConnect } from "wagmi";
import { getPublicClient, getWalletClient } from "@wagmi/core";

import { config as wagmiConfig } from "../lib/wagmi";
import { getOxQuote, type OxQuote } from "../lib/zeroEx";
import { ensureAllowance } from "../lib/erc20";
import { swapAndPay } from "../actions/swapAndPay";
import {
  TOKENS,
  resolveSellTokenAddress,
  resolveTokenDecimals,
  getTokenBySymbol,
} from "../lib/tokens";

// Filtra tokens visibles en UI
const SELECTABLE = TOKENS.filter((t) => ["MON", "WMON", "USDC"].includes(t.symbol));
const getAddr = (sym: string) => getTokenBySymbol(sym)?.address as Address;

export default function SwapForm() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();

  // UI State
  const [sellSymbol, setSellSymbol] = useState<"MON" | "WMON" | "USDC">("WMON");
  const [buySymbol, setBuySymbol] = useState<"MON" | "WMON" | "USDC">("USDC");
  const [uiAmount, setUiAmount] = useState<string>("0.01");
  const [receiver, setReceiver] = useState<Address>("0x" as Address);

  // Exec State
  const [quote, setQuote] = useState<OxQuote | null>(null);
  const [swapHash, setSwapHash] = useState<`0x${string}` | null>(null);
  const [transferHash, setTransferHash] = useState<`0x${string}` | null>(null);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  // Debounce (cotización automática)
  const debounce = useRef<number | null>(null);

  const connectInjected = () => {
    const injected =
      connectors.find((c) => c.id === "injected" || c.name.toLowerCase().includes("injected")) ??
      connectors[0];
    if (!injected) {
      setError("No hay conectores disponibles.");
      return;
    }
    connect({ connector: injected });
  };

  const validateInputs = () => {
    if (!isConnected || !address) throw new Error("Conecta tu wallet.");
    if (!receiver || !receiver.startsWith("0x") || receiver.length < 42) {
      throw new Error("Ingresa una wallet destino válida.");
    }
    const n = Number(uiAmount);
    if (!uiAmount || isNaN(n) || n <= 0) {
      throw new Error("Monto inválido.");
    }
    if (sellSymbol === buySymbol) {
      throw new Error("Selecciona tokens distintos para vender y recibir.");
    }
  };

  // Resolver addresses/decimales (MON → WMON para hablar con 0x)
  const resolved = useMemo(() => {
    const sellToken = resolveSellTokenAddress(sellSymbol) as Address;
    const buyToken = resolveSellTokenAddress(buySymbol) as Address;
    const sellDecimals = resolveTokenDecimals(sellSymbol);
    return { sellToken, buyToken, sellDecimals };
  }, [sellSymbol, buySymbol]);

  // Cotización automática (debounced)
  useEffect(() => {
    if (!isConnected || !address) return;
    if (!receiver || receiver.length < 42) return;
    const n = Number(uiAmount);
    if (!uiAmount || isNaN(n) || n <= 0) return;
    if (sellSymbol === buySymbol) return;

    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      try {
        setError(null);
        setStatus("Cotizando…");
        const sellAmount = parseUnits(uiAmount, resolved.sellDecimals);
        const q = await getOxQuote({
          sellToken: resolved.sellToken,
          buyToken: resolved.buyToken,
          sellAmount,
          taker: address as Address,
          slippageBps: 100,
          chainId: 10143,
        });
        setQuote(q);
        setStatus("Quote listo.");
      } catch (err: any) {
        setQuote(null);
        setStatus("");
        setError(err?.message || "No se pudo obtener la cotización.");
      }
    }, 500);

    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [isConnected, address, receiver, uiAmount, sellSymbol, buySymbol, resolved.sellDecimals, resolved.sellToken, resolved.buyToken]);

  // Ejecutar: approve (si falta) → swap → transfer
  async function handleSwapAndPay() {
    try {
      validateInputs();
      if (!quote) throw new Error("Aún no hay una cotización. Revisa los campos.");

      setBusy(true);
      setError(null);
      setStatus("Preparando ejecución…");

      const taker = address as Address;
      const sellAmount = parseUnits(uiAmount, resolved.sellDecimals);

      const publicClient = getPublicClient(wagmiConfig);
      if (!publicClient) throw new Error("No hay publicClient. Revisa tu configuración de wagmi.");
      const walletClient = await getWalletClient(wagmiConfig);
      if (!walletClient) throw new Error("No hay wallet conectada.");

      if (quote.allowanceTarget) {
        setStatus("Verificando permiso (approve)...");
        const { approved, txHash } = await ensureAllowance({
          provider: publicClient as any,
          wallet: walletClient as any,
          token: resolved.sellToken,
          owner: taker,
          spender: quote.allowanceTarget as Address,
          requiredAmount: sellAmount,
          useExact: false, // approve infinito
        });
        if (!approved && txHash) {
          setStatus("Confirmando approve en la red…");
          await publicClient.waitForTransactionReceipt({ hash: txHash });
        }
      }

      setStatus("Ejecutando swap y pago…");
      const res = await swapAndPay({
        quote,
        receiver,
        buyTokenAddress: (getAddr(buySymbol) ?? resolved.buyToken) as Address,
      });

      setStatus("¡Listo! Swap & Pay ejecutado ✅");
      setSwapHash(res.swapHash);
      setTransferHash(res.transferHash);
    } catch (err: any) {
      setError(err?.message || "Fallo al ejecutar el swap y pago.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  const buyOptions = SELECTABLE.filter((t) => t.symbol !== sellSymbol);

  return (
    <div className="max-w-md mx-auto p-4 rounded-2xl border shadow">
      <h2 className="text-xl font-semibold mb-3">KIOSKO — Swap & Pay</h2>

      {!isConnected ? (
        <button
          className="px-4 py-2 rounded-xl shadow bg-indigo-600 text-white disabled:opacity-60"
          disabled={isConnecting}
          onClick={connectInjected}
        >
          {isConnecting ? "Conectando..." : "Conectar wallet"}
        </button>
      ) : (
        <div className="text-sm text-neutral-600 mb-2 break-all">
          Conectado: <span className="font-mono">{address}</span>
        </div>
      )}

      <div className="grid gap-3">
        {/* Sell token */}
        <label className="grid gap-1">
          <span className="text-sm">Token a vender</span>
          <select
            className="border rounded-lg px-3 py-2"
            value={sellSymbol}
            onChange={(e) => setSellSymbol(e.target.value as any)}
          >
            {SELECTABLE.map((t) => (
              <option key={t.symbol} value={t.symbol}>
                {t.symbol === "MON" ? "MON (nativo → WMON)" : t.symbol}
              </option>
            ))}
          </select>
        </label>

        {/* Buy token */}
        <label className="grid gap-1">
          <span className="text-sm">Token a recibir</span>
          <select
            className="border rounded-lg px-3 py-2"
            value={buySymbol}
            onChange={(e) => setBuySymbol(e.target.value as any)}
          >
            {buyOptions.map((t) => (
              <option key={t.symbol} value={t.symbol}>
                {t.symbol === "MON" ? "MON (nativo → WMON)" : t.symbol}
              </option>
            ))}
          </select>
        </label>

        {/* Amount */}
        <label className="grid gap-1">
          <span className="text-sm">Monto</span>
          <input
            className="border rounded-lg px-3 py-2"
            value={uiAmount}
            onChange={(e) => setUiAmount(e.target.value)}
            placeholder="0.01"
            inputMode="decimal"
          />
        </label>

        {/* Receiver */}
        <label className="grid gap-1">
          <span className="text-sm">Wallet destino (recibe {buySymbol})</span>
          <input
            className="border rounded-lg px-3 py-2 font-mono"
            value={receiver}
            onChange={(e) => setReceiver(e.target.value as Address)}
            placeholder="0x..."
          />
        </label>

        <button
          className="px-3 py-2 rounded-lg border bg-green-600 text-white disabled:opacity-60"
          disabled={!isConnected || !quote || busy}
          onClick={handleSwapAndPay}
        >
          {busy ? "Ejecutando..." : "Swap & Pagar"}
        </button>

        {!!status && <div className="text-xs text-neutral-700">{status}</div>}

        {!!quote && (
          <div className="text-xs text-neutral-700">
            <div>buyAmount (base units): <code>{quote.buyAmount}</code></div>
            {quote.allowanceTarget && <div>spender: <code>{quote.allowanceTarget}</code></div>}
          </div>
        )}
        {!!swapHash && (
          <div className="text-xs">
            Swap tx: <code className="break-all">{swapHash}</code>
          </div>
        )}
        {!!transferHash && (
          <div className="text-xs">
            Transfer tx: <code className="break-all">{transferHash}</code>
          </div>
        )}
        {!!error && <div className="text-red-600 text-sm">Error: {error}</div>}
      </div>
    </div>
  );
}