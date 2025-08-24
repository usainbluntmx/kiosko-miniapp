// src/lib/erc20.ts
import { encodeFunctionData, type Address } from "viem";

// --- ABI mínimo: allowance/approve + balanceOf/transfer ---
export const ERC20_ABI = [
  { type: "function", name: "allowance", stateMutability: "view", inputs: [
      { name: "owner", type: "address" }, { name: "spender", type: "address" }
    ], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [
      { name: "spender", type: "address" }, { name: "amount", type: "uint256" }
    ], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [
      { name: "account", type: "address" }
    ], outputs: [{ type: "uint256" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [
      { name: "to", type: "address" }, { name: "amount", type: "uint256" }
    ], outputs: [{ type: "bool" }] },
] as const;

// --- (compat) sigue existiendo para quien lo use aún ---
export function encodeApprove(spender: `0x${string}`, amount: bigint) {
  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, amount],
  });
}

// --- HELPER: leer allowance on-chain ---
export async function readAllowance(
  provider: { readContract: Function },
  token: Address,
  owner: Address,
  spender: Address
): Promise<bigint> {
  return provider.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [owner, spender],
  }) as Promise<bigint>;
}

// --- HELPER: mandar approve (devuelve tx hash) ---
export async function sendApprove(
  wallet: { writeContract?: Function; sendTransaction?: Function; account?: { address?: Address } } | { sendTransaction: Function },
  token: Address,
  spender: Address,
  amount: bigint,
  account?: Address
): Promise<`0x${string}`> {
  // soporta tanto writeContract (wagmi) como sendTransaction con calldata pre-encoded
  if ((wallet as any).writeContract) {
    return (wallet as any).writeContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, amount],
      account,
    }) as Promise<`0x${string}`>;
  }
  const data = encodeApprove(spender as `0x${string}`, amount);
  return (wallet as any).sendTransaction({ to: token, data, account }) as Promise<`0x${string}`>;
}

/**
 * ensureAllowance — si allowance < requiredAmount ⇒ hace approve.
 * Por defecto aprueba infinito (one-time approve UX). Cambia useExact=true si quieres exacto.
 */
export async function ensureAllowance(opts: {
  provider: { readContract: Function };
  wallet: { writeContract?: Function; sendTransaction?: Function; account?: { address?: Address } };
  token: Address;
  owner: Address;
  spender: Address;
  requiredAmount: bigint;
  useExact?: boolean;              // default: false → approve infinito
}): Promise<{ approved: boolean; txHash?: `0x${string}` }> {
  const current = await readAllowance(opts.provider, opts.token, opts.owner, opts.spender);
  if (current >= opts.requiredAmount) return { approved: true };

  // approve infinito por UX (one-time approve)
  const max = (1n << 256n) - 1n;
  const amount = opts.useExact ? opts.requiredAmount : max;

  const txHash = await sendApprove(opts.wallet as any, opts.token, opts.spender, amount, opts.owner);
  return { approved: false, txHash };
}

// (opcionales) balance y transfer si los necesitas
export async function readBalanceOf(
  provider: { readContract: Function },
  token: Address,
  owner: Address
): Promise<bigint> {
  return provider.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [owner],
  }) as Promise<bigint>;
}

export async function sendTransfer(
  wallet: { writeContract?: Function; sendTransaction?: Function; account?: { address?: Address } },
  token: Address,
  to: Address,
  amount: bigint,
  account?: Address
): Promise<`0x${string}`> {
  if ((wallet as any).writeContract) {
    return (wallet as any).writeContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [to, amount],
      account,
    }) as Promise<`0x${string}`>;
  }
  // fallback a calldata si hiciera falta
  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [to, amount],
  });
  return (wallet as any).sendTransaction({ to: token, data, account }) as Promise<`0x${string}`>;
}