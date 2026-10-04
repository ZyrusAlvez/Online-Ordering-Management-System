import { useState } from 'react';
import { api } from '../../lib/api.js';
import { refreshSiteImages, siteImageDefault, useSiteImage } from '../../lib/siteImages.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Button, Card, ErrorNote } from '../../components/ui.jsx';
import ImageField from '../../components/ImageField.jsx';

function ImageCard({ imageKey, title, description, shape }) {
  const toast = useToast();
  const shown = useSiteImage(imageKey);
  const customised = shown !== siteImageDefault(imageKey);
  const [pick, setPick] = useState(null);
  // Re-mounts the picker after a save so its preview resets to the new saved image.
  const [version, setVersion] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async (action) => {
    setBusy(true);
    setError(null);
    try {
      const res = action.blob
        ? await api.put(`/admin/site-images/${imageKey}`, action.blob, { auth: true })
        : await api.del(`/admin/site-images/${imageKey}`, { auth: true });
      refreshSiteImages(res.data);
      toast.success(action.blob ? `${title} updated` : `${title} reset to default`);
      setPick(null);
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-sm text-ink-soft">{description}</p>
      </div>
      <ImageField
        key={version}
        current={customised ? shown : null}
        shape={shape}
        fallbackLabel="Default image"
        onChange={setPick}
      />
      <ErrorNote error={error} />
      <div className="flex gap-2">
        <Button loading={busy} disabled={!pick} onClick={() => save(pick.blob ? pick : { remove: true })}>
          {pick?.remove ? 'Reset to default' : 'Save image'}
        </Button>
      </div>
    </Card>
  );
}

export default function AdminBranding() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">Site images</h1>
      <p className="max-w-2xl text-sm text-ink-soft">
        The logo and promo photo shown on the home page, headers and kiosk. Product photos are edited
        per product under Menu.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <ImageCard imageKey="logo" title="Logo" description="Round logo in the header, home page and kiosk welcome screen. Use a square image." shape="square" />
        <ImageCard imageKey="promo" title="Home page photo" description="Large photo beside the headline on the home page." shape="wide" />
      </div>
    </div>
  );
}
