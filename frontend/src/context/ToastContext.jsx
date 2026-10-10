import { Toaster, toast } from 'sonner';

/**
 * Notifications, drawn by sonner with its rich (tinted) colours: green for
 * success, red for errors. They sit at the top centre, under the header: the
 * bottom of the screen belongs to the cart bar and the chat button.
 *
 * Pages call `useToast().success(message)` / `.error(message)`; that is sonner's
 * own `toast`, so its other options (`toast.info`, descriptions, actions) work too.
 */
export function ToastProvider({ children }) {
  return (
    <>
      {children}
      <Toaster
        richColors
        position="top-center"
        offset={76}
        mobileOffset={72}
        duration={4000}
        toastOptions={{ style: { fontFamily: 'var(--font-sans)' } }}
      />
    </>
  );
}

export const useToast = () => toast;
