import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { AlertTriangle } from "lucide-react";
import Header from "./components/Header";
import SwapForm from "./components/SwapForm";

const MONAD_TESTNET_ID = 10143;

export default function App() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const needsNetworkSwitch = isConnected && chainId !== undefined && chainId !== MONAD_TESTNET_ID;

  return (
    <div>
      <Header />

      {needsNetworkSwitch && (
        <div
          style={{
            margin: "12px auto 0",
            maxWidth: 760,
            background: "#fff3cd",
            border: "1px solid #ffeeba",
            color: "#5c4700",
            padding: "10px 14px",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <AlertTriangle size={18} />
          <div style={{ flex: 1 }}>
            Estás en la red <b>{chainId}</b>. Cambia a <b>Monad Testnet (10143)</b> para operar.
          </div>
          <button onClick={() => switchChain({ chainId: MONAD_TESTNET_ID })}>
            Cambiar a Monad
          </button>
        </div>
      )}

      <main style={{ padding: 20, maxWidth: 760, margin: "16px auto" }}>
        <SwapForm />
      </main>

      <footer style={{ textAlign: "center", padding: "16px 12px 40px", color: "#6b7280", fontSize: 12 }}>
        GMonad
      </footer>
    </div>
  );
}