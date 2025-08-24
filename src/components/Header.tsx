import { Wallet, ShoppingBag } from "lucide-react";
import { useAccount } from "wagmi";
import { appKit } from "../lib/wagmi";

export default function Header() {
  const { isConnected, address } = useAccount();
  const onConnect = () => appKit.open();

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 20px",
        background: "white",
        borderBottom: "1px solid #eee",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <img
          src="/icon.png"
          alt="KIOSKO"
          width={32}
          height={32}
          style={{ borderRadius: 6 }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#6c5ce7" }}>
          <ShoppingBag size={20} style={{ marginRight: 4, verticalAlign: "middle" }} />
          KIOSKO
        </h1>
      </div>

      <div>
        <button
          onClick={onConnect}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "#6c5ce7",
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "8px 14px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Wallet size={18} />
          {isConnected ? "Wallet conectada" : "Conectar"}
        </button>
        {isConnected && (
          <div style={{ fontSize: 12, marginTop: 4, textAlign: "right", opacity: 0.7 }}>
            {address?.slice(0, 6)}…{address?.slice(-4)}
          </div>
        )}
      </div>
    </header>
  );
}