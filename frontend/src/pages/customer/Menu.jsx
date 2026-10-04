import MenuBrowser from '../../components/MenuBrowser.jsx';
import { BottomDock, CartBar } from '../../components/BottomDock.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';

export default function Menu() {
  const cart = useCart();
  const toast = useToast();

  return (
    <>
      <div className="mb-2 mt-2">
        <h1 className="font-display text-4xl sm:text-5xl">
          Our menu
        </h1>
        <p className="mt-2 text-ink-soft">Tap a dish to add it to your order.</p>
      </div>

      <MenuBrowser
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
