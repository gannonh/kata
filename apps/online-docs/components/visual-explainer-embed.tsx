'use client';

import { useEffect, useRef } from 'react';

interface VisualExplainerEmbedProps {
  src: string;
  height?: number;
  title: string;
}

export function VisualExplainerEmbed({
  src,
  height = 600,
  title,
}: VisualExplainerEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const html = document.documentElement;

    function sendTheme() {
      const isDark = html.classList.contains('dark');
      iframeRef.current?.contentWindow?.postMessage(
        { theme: isDark ? 'dark' : 'light' },
        window.location.origin,
      );
    }

    const iframe = iframeRef.current;
    if (iframe) {
      iframe.addEventListener('load', sendTheme);
      sendTheme();
    }

    const observer = new MutationObserver(sendTheme);
    observer.observe(html, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      observer.disconnect();
      iframe?.removeEventListener('load', sendTheme);
    };
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={title}
      width="100%"
      height={height}
      sandbox="allow-scripts"
      style={{ border: 'none', borderRadius: '8px' }}
    />
  );
}
