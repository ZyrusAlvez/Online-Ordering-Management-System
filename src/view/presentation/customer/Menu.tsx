'use client';

import MenuBrowser from '@/view/components/MenuBrowser';
import OrderBranchPicker from '@/view/components/OrderBranchPicker';
import { useSelectedBranch } from '@/hooks/useBranches';
import { BottomDock, CartBar } from '@/view/components/BottomDock';
import { useCart } from '@/context/CartContext';
import { useToast } from '@/context/ToastContext';

export default function Menu() {
  const cart = useCart();
  const toast = useToast();
  const { branchId } = useSelectedBranch();

  return (
    <>
      <div className="mb-2 mt-2">
        <h1 className="font-display text-4xl sm:text-5xl">
          Our menu
        </h1>
        <p className="mt-2 text-ink-soft">Tap a dish to add it to your order.</p>
        <div className="mt-3">
          <OrderBranchPicker compact />
        </div>
      </div>

      <MenuBrowser
        branchId={branchId}
        stickyTop="top-[69px]"
        onAdd={(line) => {
          cart.add(line);
          toast.success(`Added ${line.quantity}× ${line.name}`);
        }}
      />

      <BottomDock>
        <CartBar count={cart.count} total={cart.estimate} label="View cart" />
      </BottomDock>
    </>
  );
}
