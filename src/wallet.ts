import { useCallback, useEffect, useState } from "react";
import { isAddress, toHex, type Address, type Hex } from "viem";
import { RPC_URLS } from "./chain";
export type Provider = {
  request: (request: {
    method: string;
    params?: unknown[] | object;
  }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => void;
  providers?: Provider[];
};
export type Wallet = {
  info: { uuid: string; name: string; rdns?: string };
  provider: Provider;
};
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
export function useWallet() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selected, setSelected] = useState<Wallet>();
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<string>();
  useEffect(() => {
    const announce = (event: Event) => {
      const detail = (event as CustomEvent<Wallet>).detail;
      if (!detail?.provider?.request || !detail.info?.uuid || !detail.info.name)
        return;
      setWallets((current) => [
        ...current.filter(
          (w) =>
            w.info.uuid !== detail.info.uuid && w.provider !== detail.provider,
        ),
        detail,
      ]);
    };
    const fallback = () => {
      const providers =
        window.ethereum?.providers ??
        (window.ethereum ? [window.ethereum] : []);
      setWallets((current) => {
        const next = [...current];
        for (const [index, provider] of providers.entries())
          if (!next.some((w) => w.provider === provider))
            next.push({
              info: {
                uuid: `legacy-${index}`,
                name:
                  providers.length > 1
                    ? `Browser wallet ${index + 1}`
                    : "Browser wallet",
              },
              provider,
            });
        return next;
      });
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const timer = setTimeout(fallback, 500);
    return () => {
      window.removeEventListener("eip6963:announceProvider", announce);
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    const provider = selected?.provider;
    if (!provider) return;
    const accounts = (value: unknown) => {
      const first = Array.isArray(value) ? value[0] : undefined;
      setAccount(
        typeof first === "string" && isAddress(first) ? first : undefined,
      );
    };
    const chain = (value: unknown) =>
      setChainId(typeof value === "string" ? value : undefined);
    const disconnect = () => {
      setAccount(undefined);
      setChainId(undefined);
    };
    provider.on?.("accountsChanged", accounts);
    provider.on?.("chainChanged", chain);
    provider.on?.("disconnect", disconnect);
    return () => {
      provider.removeListener?.("accountsChanged", accounts);
      provider.removeListener?.("chainChanged", chain);
      provider.removeListener?.("disconnect", disconnect);
    };
  }, [selected]);
  const connect = useCallback(async (wallet: Wallet) => {
    const accounts = (await wallet.provider.request({
      method: "eth_requestAccounts",
    })) as string[];
    if (!accounts[0] || !isAddress(accounts[0]))
      throw new Error("No account shared. Unlock your wallet and try again.");
    setSelected(wallet);
    setAccount(accounts[0]);
    setChainId(
      (await wallet.provider.request({ method: "eth_chainId" })) as string,
    );
  }, []);
  const ensureMainnet = async () => {
    if (!selected || !account) throw new Error("Connect a wallet first.");
    const provider = selected.provider;
    const current = (await provider.request({
      method: "eth_chainId",
    })) as string;
    if (Number(current) !== 1) {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x1" }],
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 4902) throw error;
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x1",
              chainName: "Ethereum Mainnet",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: [...RPC_URLS],
              blockExplorerUrls: ["https://etherscan.io"],
            },
          ],
        });
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x1" }],
        });
      }
    }
    const finalChain = (await provider.request({
      method: "eth_chainId",
    })) as string;
    setChainId(finalChain);
    if (Number(finalChain) !== 1)
      throw new Error("Switch your wallet to Ethereum mainnet to continue.");
    const accounts = (await provider.request({
      method: "eth_accounts",
    })) as string[];
    if (accounts[0]?.toLowerCase() !== account.toLowerCase())
      throw new Error(
        "Your account changed. Reconnect your wallet and try again.",
      );
    return account;
  };
  const send = async (
    tx: { to: Address; data: Hex; value?: bigint },
    expectedAccount: Address,
  ) => {
    const from = await ensureMainnet();
    if (from.toLowerCase() !== expectedAccount.toLowerCase())
      throw new Error("Your account changed. Try again.");
    return (await selected!.provider.request({
      method: "eth_sendTransaction",
      params: [
        { from, to: tx.to, data: tx.data, value: toHex(tx.value ?? 0n) },
      ],
    })) as Hex;
  };
  return {
    wallets,
    selected,
    account,
    chainId,
    connect,
    ensureMainnet,
    send,
    disconnect: () => {
      setSelected(undefined);
      setAccount(undefined);
      setChainId(undefined);
    },
  };
}
export function walletLinks(url: string) {
  return [
    {
      name: "MetaMask",
      href: `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, "")}`,
    },
    {
      name: "Coinbase Wallet",
      href: `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
    },
    {
      name: "Trust",
      href: `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}`,
    },
  ];
}
