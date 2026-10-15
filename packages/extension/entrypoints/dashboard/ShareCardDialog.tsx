import { useEffect, useState } from 'react';
import { renderShareCard, type ShareCardModel } from '../../src/dashboard/shareCard';

export function ShareCardDialog({ model, showProjects, onClose }: { model: ShareCardModel; showProjects: boolean; onClose: () => void }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle');

  useEffect(() => {
    let objectUrl: string | null = null;
    void renderShareCard(model).then((b) => {
      objectUrl = URL.createObjectURL(b);
      setBlob(b);
      setUrl(objectUrl);
    });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [model]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A user click grants the transient activation clipboard.write needs; no permission required.
  const copyImage = async () => {
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopy('done');
    } catch {
      setCopy('failed');
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Share card" onClick={(e) => e.stopPropagation()}>
        {url ? <img src={url} alt={`${model.title}: ${model.value} ${model.caption}`} /> : <p className="muted">Drawing…</p>}
        <div className="dialog-actions">
          <a className={url ? 'button' : 'button disabled'} href={url ?? undefined} download="paceline.png">
            Download PNG
          </a>
          <button type="button" onClick={() => void copyImage()} disabled={!blob}>
            {copy === 'done' ? 'Copied' : 'Copy image'}
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {copy === 'failed' && <p className="warn">Couldn't copy the image. Use Download instead.</p>}
        {!showProjects && <p className="muted">Project names stay off the card. You can turn them on in Options.</p>}
      </div>
    </div>
  );
}
