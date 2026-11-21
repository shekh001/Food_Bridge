import { useEffect, useState } from 'react';
import client from '../api/client.js';

/**
 * Renders an image that lives behind a protected API route (listing photos,
 * report evidence, verification docs). A plain <img src="..."> can't carry
 * an Authorization header, so this fetches the file as a blob through the
 * shared axios client (which does attach the token) and points the <img>
 * at the resulting object URL instead — same fix already used for
 * verification-doc viewing in the admin dashboard, generalized into one
 * reusable component.
 */
export default function AuthImage({ src, alt = '', className = '', fallback = null }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) return;
    let currentUrl = null;
    let cancelled = false;
    setFailed(false);
    setObjectUrl(null);

    client.get(src, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        currentUrl = URL.createObjectURL(res.data);
        setObjectUrl(currentUrl);
      })
      .catch(() => { if (!cancelled) setFailed(true); });

    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [src]);

  if (failed) return fallback;
  if (!objectUrl) return <div className={`${className} bg-line/40 animate-pulse`} />;
  return <img src={objectUrl} alt={alt} className={className} />;
}
