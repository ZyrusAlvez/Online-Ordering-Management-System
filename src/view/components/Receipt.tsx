'use client';

import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { RESTAURANT } from '@/view/components/Logo';
import { CHANNEL, FULFILLMENT, dateTime, lineLabel, money } from '@/utils/format';

/**
 * Menu prices already include 12% VAT, so the total is what the customer pays and the
 * receipt only splits it: sales = total / 1.12, VAT = the rest. Worked in centavos so
 * the two always add back up to the total.
 */
const vatBreakdown = (total) => {
  const centavos = Math.round(Number(total) * 100);
  const sales = Math.round(centavos / 1.12);
  return { sales: sales / 100, tax: (centavos - sales) / 100 };
};

/**
 * The customer's copy of a paid order, sized for a 58/80 mm receipt printer.
 * `cash` ({ tendered, change }) is only known right after a cash payment; a reprint leaves it out.
 */
export function Receipt({ order, cash = null }: any) {
  const gcashRef = order.payment_method === 'gcash' ? order.gcash_payment?.reference_number : null;
  const vat = vatBreakdown(order.total_amount);
  return (
    <div className="mx-auto w-[72mm] font-mono text-[11px] leading-snug text-black">
      <div className="text-center">
        <p className="text-sm font-bold">{RESTAURANT}</p>
        {order.branch?.name && <p>{order.branch.name}</p>}
        <p className="mt-2 text-2xl font-bold">{order.order_number}</p>
        <p>{dateTime(order.created_at)}</p>
      </div>

      <div className="mt-2 border-t border-dashed border-black pt-1">
        <p>Customer: {order.customer_name || 'Guest'}</p>
        <p>
          {FULFILLMENT[order.fulfillment_type] ?? order.fulfillment_type}
          {order.channel ? ` · ${CHANNEL[order.channel] ?? order.channel}` : ''}
        </p>
      </div>

      <ul className="mt-1 border-t border-dashed border-black pt-1">
        {order.order_items.map((i) => (
          <li key={i.id} className="py-0.5">
            <div className="flex justify-between gap-2">
              <span>
                {i.quantity}× {lineLabel(i)}
              </span>
              <span className="shrink-0">{money(i.unit_price * i.quantity)}</span>
            </div>
            {i.notes && <p className="pl-4">“{i.notes}”</p>}
          </li>
        ))}
      </ul>

      <div className="mt-1 border-t border-dashed border-black pt-1">
        <div className="flex justify-between text-sm font-bold">
          <span>TOTAL</span>
          <span>{money(order.total_amount)}</span>
        </div>
        <div className="flex justify-between">
          <span>VATable sales</span>
          <span>{money(vat.sales)}</span>
        </div>
        <div className="flex justify-between">
          <span>VAT (12%)</span>
          <span>{money(vat.tax)}</span>
        </div>
        <div className="flex justify-between">
          <span>Paid by</span>
          <span>{order.payment_method === 'gcash' ? 'GCash' : 'Cash'}</span>
        </div>
        {cash?.tendered != null && (
          <>
            <div className="flex justify-between">
              <span>Tendered</span>
              <span>{money(cash.tendered)}</span>
            </div>
            <div className="flex justify-between">
              <span>Change</span>
              <span>{money(cash.change)}</span>
            </div>
          </>
        )}
        {gcashRef && <p>Ref no. {gcashRef}</p>}
      </div>

      {order.notes && <p className="mt-1 border-t border-dashed border-black pt-1">Note: “{order.notes}”</p>}

      <p className="mt-3 text-center">Thank you! Salamat po!</p>
    </div>
  );
}

/**
 * Prints the receipt on its own: it is rendered into a `.print-receipt` box at the end of
 * <body>, which globals.css shows only when printing (and hides everything else), then removed.
 */
export function printReceipt(order, cash = null) {
  const host = document.createElement('div');
  host.className = 'print-receipt';
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(<Receipt order={order} cash={cash} />));

  window.addEventListener(
    'afterprint',
    () => {
      root.unmount();
      host.remove();
    },
    { once: true },
  );
  window.print();
}
