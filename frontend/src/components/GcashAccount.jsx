import { useState } from 'react';
import { useGcashAccount } from '../lib/gcash.js';
import { money } from '../lib/format.js';
import { Spinner } from './ui.jsx';

/**
 * Our GCash QR, account name and number, and what to send. Shown wherever a
 * customer pays by GCash: the order page, the kiosk and the cashier's screen.
 *
 *   large  -> kiosk sizing (read from arm's length, no copy button)
 */
export default function GcashAccount({ amount, large = false }) {
  const account = useGcashAccount();
  const [copied, setCopied] = useState(false);

  if (account === undefined) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }
  if (account === null) {
    return <p className="text-center text-ink-soft">GCash isn't available right now. Please pay in cash.</p>;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(account.number.replace(/\s+/g, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (http, old browser): the number is on screen anyway.
    }
  };

  return (
    <div className={`flex flex-col items-center text-center ${large ? 'gap-4' : 'gap-3'}`}>
      <div className="w-fit rounded-3xl bg-white p-3 shadow ring-1 ring-line">
        <img
          src={account.qr_image}
          alt="GCash QR code"
          className={large ? 'h-72 w-72' : 'h-52 w-52'}
          draggable={false}
        />
      </div>
      <div>
        <p className={`font-bold ${large ? 'text-3xl' : 'text-lg'}`}>{account.name}</p>
        <p className={`font-mono tracking-wide ${large ? 'text-3xl' : 'text-lg'}`}>
          {account.number}
          {!large && (
            <button
              type="button"
              onClick={copy}
              className="ml-2 cursor-pointer align-middle font-sans text-xs font-semibold text-brand underline"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </p>
      </div>
      {amount != null && (
        <p className={large ? 'text-2xl' : 'text-base'}>
          Send exactly <strong className="text-brand">{money(amount)}</strong>
        </p>
      )}
    </div>
  );
}
