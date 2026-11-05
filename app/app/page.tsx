'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  WagmiProvider, createConfig, http, useAccount, useBalance, useChainId, useConnect, useDisconnect,
  useReadContracts, useSendTransaction, useSignMessage, useSignTypedData, useSwitchChain,
  useWaitForTransactionReceipt, useWriteContract,
} from 'wagmi';
import { bsc, bscTestnet } from 'wagmi/chains';
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors';
import {
  erc20Abi, formatEther, formatUnits, isAddress, parseEther, parseUnits,
  recoverMessageAddress, recoverTypedDataAddress, type Hash, type Hex,
} from 'viem';

/* ───────────── Config ───────────── */

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

const config = createConfig({
  chains: [bsc, bscTestnet],
  ssr: true,
  // Installed wallets (MetaMask, Trust Wallet extension, Rabby, OKX…) are discovered via EIP-6963.
  connectors: [
    injected(),
    ...(projectId ? [walletConnect({ projectId, showQrModal: true })] : []),
    coinbaseWallet({ appName: 'BSC Console' }),
  ],
  transports: {
    [bsc.id]: http(process.env.NEXT_PUBLIC_BSC_RPC || undefined),
    [bscTestnet.id]: http(process.env.NEXT_PUBLIC_BSC_TESTNET_RPC || undefined),
  },
});

/* ───────────── Helpers & styles ───────────── */

const short = (s?: string, a = 6, b = 4) => (s ? `${s.slice(0, a)}…${s.slice(-b)}` : '');
const errMsg = (e: unknown) => {
  const x = e as { shortMessage?: string; message?: string };
  return x?.shortMessage ?? x?.message?.split('\n')[0] ?? 'Something went wrong';
};

const INPUT = 'w-full rounded-lg border border-[#252932] bg-[#0b0c0f] px-3 py-2.5 text-sm text-[#e8e9ec] outline-none placeholder:text-[#8b909c]/60 focus:border-[#f0b90b]';
const LABEL = 'mb-1.5 block text-sm text-[#8b909c]';
const BTN = 'rounded-lg bg-[#f0b90b] px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50';
const BTN2 = 'rounded-lg border border-[#252932] px-4 py-2.5 text-sm hover:border-[#f0b90b] disabled:opacity-50';
const CARD = 'rounded-2xl border border-[#252932] bg-[#14161b] p-6';
const REVIEW = 'mt-4 rounded-lg border border-[#f0b90b]/40 bg-[#0b0c0f] p-3 text-sm';

/* ───────────── Connect modal ───────────── */

function ConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { connectors, connect, isPending, variables, error, reset } = useConnect();
  const { isConnected } = useAccount();

  const list = connectors.filter(
    (c) => !(c.id === 'injected' && connectors.some((o) => o.type === 'injected' && o.id !== 'injected')),
  );

  useEffect(() => { if (isConnected && open) onClose(); }, [isConnected, open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); reset(); };
  }, [open, onClose, reset]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Connect a wallet"
        className="w-full max-w-sm rounded-2xl border border-[#252932] bg-[#14161b] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Connect a wallet</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md px-2 py-1 text-[#8b909c] hover:text-white">✕</button>
        </div>
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.uid}>
              <button disabled={isPending} onClick={() => connect({ connector: c })}
                className="flex w-full items-center gap-3 rounded-xl border border-[#252932] bg-[#1b1e25] px-4 py-3 text-left transition hover:border-[#f0b90b] disabled:opacity-60">
                {c.icon
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={c.icon} alt="" className="h-7 w-7 rounded-md" />
                  : <span className="grid h-7 w-7 place-items-center rounded-md bg-[#252932] text-xs">{c.name[0]}</span>}
                <span className="flex-1 font-medium">{c.name}</span>
                {isPending && variables?.connector === c && <span className="text-xs text-[#8b909c]">Check your wallet…</span>}
              </button>
            </li>
          ))}
        </ul>
        {error && <p className="mt-3 text-sm text-red-400">{errMsg(error)}</p>}
        <p className="mt-4 text-xs leading-relaxed text-[#8b909c]">
          Connecting only shares your public address. Nothing is signed or sent until you review and confirm it in your wallet.
        </p>
      </div>
    </div>
  );
}

/* ───────────── Transaction status ───────────── */

function TxStatus({ hash }: { hash?: Hash }) {
  const { chain } = useAccount();
  const { isLoading, isSuccess, isError, data } = useWaitForTransactionReceipt({ hash });
  if (!hash) return null;
  const url = chain?.blockExplorers?.default.url;
  const reverted = isSuccess && data?.status === 'reverted';
  return (
    <div className="mt-4 rounded-lg border border-[#252932] bg-[#0b0c0f] p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className={reverted || isError ? 'text-red-400' : isSuccess ? 'text-emerald-400' : 'text-[#f0b90b]'}>
          {isLoading ? 'Waiting for confirmation…' : reverted ? 'Transaction reverted' : isSuccess ? 'Confirmed' : isError ? 'Could not fetch receipt' : 'Submitted'}
        </span>
        {url
          ? <a href={`${url}/tx/${hash}`} target="_blank" rel="noreferrer" className="font-mono text-xs text-[#8b909c] underline">{short(hash, 10, 8)}</a>
          : <span className="font-mono text-xs text-[#8b909c]">{short(hash, 10, 8)}</span>}
      </div>
    </div>
  );
}

/* ───────────── Sign panel ───────────── */

function SignPanel() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync, isPending: p1 } = useSignMessage();
  const { signTypedDataAsync, isPending: p2 } = useSignTypedData();
  const [message, setMessage] = useState('Sign in to BSC Console');
  const [res, setRes] = useState<{ sig: Hex; valid: boolean } | null>(null);
  const [err, setErr] = useState('');

  const typed = {
    domain: { name: 'BSC Console', version: '1', chainId },
    types: { Authorize: [
      { name: 'wallet', type: 'address' },
      { name: 'statement', type: 'string' },
      { name: 'nonce', type: 'uint256' },
    ] },
    primaryType: 'Authorize' as const,
  };

  async function run(kind: 'message' | 'typed') {
    if (!address) return;
    setErr(''); setRes(null);
    try {
      if (kind === 'message') {
        const sig = await signMessageAsync({ message });
        const who = await recoverMessageAddress({ message, signature: sig });
        setRes({ sig, valid: who.toLowerCase() === address.toLowerCase() });
      } else {
        const msg = { wallet: address, statement: 'Authorize this session. No funds are moved.', nonce: BigInt(Date.now()) };
        const sig = await signTypedDataAsync({ ...typed, message: msg });
        const who = await recoverTypedDataAddress({ ...typed, message: msg, signature: sig });
        setRes({ sig, valid: who.toLowerCase() === address.toLowerCase() });
      }
    } catch (e) { setErr(errMsg(e)); }
  }

  return (
    <div>
      <label htmlFor="msg" className={LABEL}>Message</label>
      <textarea id="msg" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className={INPUT} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => run('message')} disabled={p1 || p2 || !message} className={BTN}>
          {p1 ? 'Confirm in wallet…' : 'Sign message'}
        </button>
        <button onClick={() => run('typed')} disabled={p1 || p2} className={BTN2}>
          {p2 ? 'Confirm in wallet…' : 'Sign typed data (EIP-712)'}
        </button>
      </div>
      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
      {res && (
        <div className="mt-4 rounded-lg border border-[#252932] bg-[#0b0c0f] p-3 text-sm">
          <p className={res.valid ? 'text-emerald-400' : 'text-red-400'}>
            {res.valid ? `Signature verified for ${short(address)}` : 'Signature does not match this wallet'}
          </p>
          <p className="mt-2 break-all font-mono text-xs text-[#8b909c]">{res.sig}</p>
        </div>
      )}
    </div>
  );
}

/* ───────────── Send BNB panel ───────────── */

function SendPanel() {
  const { address, chain } = useAccount();
  const { data: bal } = useBalance({ address });
  const { sendTransaction, data: hash, isPending, error, reset } = useSendTransaction();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [review, setReview] = useState(false);

  let value: bigint | null = null;
  try { value = amount ? parseEther(amount) : null; } catch { value = null; }
  const valid = isAddress(to) && value !== null && value > 0n && (!bal || value <= bal.value);
  const symbol = chain?.nativeCurrency.symbol ?? 'BNB';
  const touch = () => { setReview(false); reset(); };

  return (
    <div>
      <div className="space-y-3">
        <div>
          <label htmlFor="to" className={LABEL}>Recipient</label>
          <input id="to" className={INPUT} value={to} onChange={(e) => { setTo(e.target.value.trim()); touch(); }} placeholder="0x…" spellCheck={false} />
        </div>
        <div>
          <label htmlFor="amt" className={LABEL}>Amount ({symbol})</label>
          <input id="amt" className={INPUT} inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); touch(); }} placeholder="0.0" />
          {bal && <p className="mt-1 text-xs text-[#8b909c]">Available: {Number(formatEther(bal.value)).toFixed(6)} {symbol}</p>}
        </div>
      </div>

      {!review ? (
        <button disabled={!valid} onClick={() => setReview(true)} className={`mt-4 ${BTN}`}>Review transfer</button>
      ) : (
        <div className={REVIEW}>
          <p>Send <b>{amount} {symbol}</b> to</p>
          <p className="my-1 break-all font-mono text-xs text-[#8b909c]">{to}</p>
          <p className="text-xs text-[#8b909c]">on {chain?.name}. The network fee is shown in your wallet.</p>
          <div className="mt-3 flex gap-2">
            <button disabled={isPending} onClick={() => value && sendTransaction({ to: to as `0x${string}`, value })} className={BTN}>
              {isPending ? 'Confirm in wallet…' : `Send to ${short(to)}`}
            </button>
            <button onClick={() => setReview(false)} className={BTN2}>Edit</button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-400">{errMsg(error)}</p>}
      <TxStatus hash={hash} />
    </div>
  );
}

/* ───────────── BEP-20 token panel ───────────── */

function TokenPanel() {
  const { address, chain } = useAccount();
  const [token, setToken] = useState('');
  const [mode, setMode] = useState<'transfer' | 'approve'>('transfer');
  const [target, setTarget] = useState('');
  const [amount, setAmount] = useState('');
  const [review, setReview] = useState(false);
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();

  const ok = isAddress(token);
  const c = { address: token as `0x${string}`, abi: erc20Abi } as const;
  const { data, isLoading, refetch } = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...c, functionName: 'name' },
      { ...c, functionName: 'symbol' },
      { ...c, functionName: 'decimals' },
      { ...c, functionName: 'balanceOf', args: [address ?? '0x0000000000000000000000000000000000000000'] },
    ],
    query: { enabled: ok && !!address },
  });

  const name = data?.[0].result as string | undefined;
  const symbol = data?.[1].result as string | undefined;
  const decimals = data?.[2].result as number | undefined;
  const balance = data?.[3].result as bigint | undefined;
  const isToken = decimals !== undefined && symbol !== undefined;

  let units: bigint | null = null;
  try { units = amount && decimals !== undefined ? parseUnits(amount, decimals) : null; } catch { units = null; }
  const canReview = isToken && isAddress(target) && units !== null && units > 0n &&
    (mode === 'approve' || (balance !== undefined && units <= balance));
  const touch = () => { setReview(false); reset(); };

  function submit() {
    if (!units) return;
    writeContract(
      mode === 'transfer'
        ? { ...c, functionName: 'transfer', args: [target as `0x${string}`, units] }
        : { ...c, functionName: 'approve', args: [target as `0x${string}`, units] },
      { onSuccess: () => setTimeout(() => refetch(), 4000) },
    );
  }

  return (
    <div>
      <label htmlFor="tok" className={LABEL}>Token contract address</label>
      <input id="tok" className={INPUT} value={token} onChange={(e) => { setToken(e.target.value.trim()); touch(); }} placeholder="0x… (BEP-20)" spellCheck={false} />
      {ok && isLoading && <p className="mt-2 text-sm text-[#8b909c]">Reading token…</p>}
      {ok && !isLoading && !isToken && <p className="mt-2 text-sm text-red-400">No BEP-20 token found at this address on {chain?.name}.</p>}
      {isToken && (
        <p className="mt-2 text-sm"><b>{name}</b> ({symbol}) · Balance: {balance !== undefined ? formatUnits(balance, decimals!) : '—'}</p>
      )}

      {isToken && (
        <div className="mt-4 space-y-3">
          <div className="inline-flex rounded-lg border border-[#252932] p-0.5 text-sm">
            {(['transfer', 'approve'] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); touch(); }}
                className={`rounded-md px-3 py-1.5 ${mode === m ? 'bg-[#1b1e25] text-white' : 'text-[#8b909c]'}`}>
                {m === 'transfer' ? 'Transfer' : 'Approve spending'}
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="tgt" className={LABEL}>{mode === 'transfer' ? 'Recipient' : 'Spender contract'}</label>
            <input id="tgt" className={INPUT} value={target} onChange={(e) => { setTarget(e.target.value.trim()); touch(); }} placeholder="0x…" spellCheck={false} />
          </div>
          <div>
            <label htmlFor="tamt" className={LABEL}>Amount ({symbol})</label>
            <input id="tamt" className={INPUT} inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); touch(); }} placeholder="0.0" />
          </div>
        </div>
      )}

      {isToken && !review && (
        <button disabled={!canReview} onClick={() => setReview(true)} className={`mt-4 ${BTN}`}>Review {mode}</button>
      )}
      {isToken && review && (
        <div className={REVIEW}>
          {mode === 'transfer'
            ? <p>Transfer <b>{amount} {symbol}</b> to <span className="font-mono text-xs">{target}</span></p>
            : <p>Allow <span className="font-mono text-xs">{target}</span> to spend up to <b>{amount} {symbol}</b> from your wallet. Only approve contracts you trust. You can revoke by approving 0.</p>}
          <div className="mt-3 flex gap-2">
            <button disabled={isPending} onClick={submit} className={BTN}>
              {isPending ? 'Confirm in wallet…' : mode === 'transfer' ? `Send to ${short(target)}` : 'Approve'}
            </button>
            <button onClick={() => setReview(false)} className={BTN2}>Edit</button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-400">{errMsg(error)}</p>}
      <TxStatus hash={hash} />
    </div>
  );
}

/* ───────────── Dashboard ───────────── */

const TABS = [
  { id: 'sign', label: 'Sign' },
  { id: 'send', label: 'Send BNB' },
  { id: 'token', label: 'Tokens' },
] as const;

function Dashboard() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('sign');
  const { address, isConnected, chain, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { data: bal } = useBalance({ address });

  useEffect(() => setMounted(true), []);
  const connected = mounted && isConnected && !!address;
  const wrongNetwork = connected && !chain;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:py-14">
      <header className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="h-3 w-3 rotate-45 bg-[#f0b90b]" aria-hidden />
          <span className="text-lg font-semibold tracking-tight">BSC Console</span>
        </div>
        {connected ? (
          <div className="flex items-center gap-2">
            <span className="hidden rounded-lg border border-[#252932] px-3 py-2 text-sm sm:block">
              <span className={`mr-2 inline-block h-2 w-2 rounded-full ${chain ? 'bg-emerald-400' : 'bg-red-400'}`} />
              {chain?.name ?? 'Unsupported network'}
            </span>
            <button onClick={() => disconnect()} title="Disconnect" className="rounded-lg border border-[#252932] px-3 py-2 font-mono text-sm hover:border-[#f0b90b]">
              {short(address)}
            </button>
          </div>
        ) : (
          <button onClick={() => setOpen(true)} className={BTN}>Connect wallet</button>
        )}
      </header>

      {!connected ? (
        <section className="py-16 sm:py-24">
          <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Your wallet, working on BNB Smart Chain.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-[#8b909c]">
            Connect a browser wallet or scan with a mobile wallet like Trust Wallet. Sign messages, send BNB and move BEP-20 tokens, reviewing every step before your wallet asks you to confirm.
          </p>
          <button onClick={() => setOpen(true)} className={`mt-8 !px-6 !py-3 ${BTN}`}>Connect wallet</button>
        </section>
      ) : (
        <>
          {wrongNetwork && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm">
              <span>This app runs on BNB Smart Chain. Switch networks to continue.</span>
              <div className="flex gap-2">
                <button disabled={switching} onClick={() => switchChain({ chainId: bsc.id })} className={BTN}>BSC Mainnet</button>
                <button disabled={switching} onClick={() => switchChain({ chainId: bscTestnet.id })} className={BTN2}>Testnet</button>
              </div>
            </div>
          )}

          <section className={`mb-6 ${CARD}`}>
            <p className="text-sm text-[#8b909c]">Balance · {connector?.name}</p>
            <p className="mt-1 text-4xl font-semibold tabular-nums">
              {bal ? Number(formatEther(bal.value)).toFixed(4) : '—'} <span className="text-xl text-[#8b909c]">{bal?.symbol ?? 'BNB'}</span>
            </p>
            <p className="mt-2 break-all font-mono text-xs text-[#8b909c]">{address}</p>
          </section>

          <section className={`${CARD} ${wrongNetwork ? 'pointer-events-none opacity-40' : ''}`}>
            <div role="tablist" className="mb-6 inline-flex rounded-lg border border-[#252932] p-0.5 text-sm">
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                  className={`rounded-md px-4 py-1.5 ${tab === t.id ? 'bg-[#1b1e25] text-white' : 'text-[#8b909c] hover:text-white'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            {tab === 'sign' && <SignPanel />}
            {tab === 'send' && <SendPanel />}
            {tab === 'token' && <TokenPanel />}
          </section>
        </>
      )}

      <ConnectModal open={open} onClose={() => setOpen(false)} />
    </main>
  );
}

/* ───────────── Page (providers + dashboard) ───────────── */

function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

export default function Page() {
  return (
    <Providers>
      <Dashboard />
    </Providers>
  );
}
