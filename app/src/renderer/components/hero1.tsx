import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';

import { cn } from '@renderer/lib/cn';

import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';

interface Hero1Props {
  badge?: string;
  heading?: string;
  description?: string;
  buttons?: {
    primary?: {
      text: string;
      url: string;
    };
    secondary?: {
      text: string;
      url: string;
    };
  };
  image?: {
    src: string;
    alt: string;
  };
  className?: string;
}

const FALLBACK_IMAGE_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#111827"/><stop offset="100%" stop-color="#1f2937"/></linearGradient></defs><rect width="960" height="540" fill="url(#g)"/><rect x="80" y="120" width="800" height="300" rx="24" fill="#0b1220" stroke="#334155" stroke-width="2"/><circle cx="140" cy="180" r="12" fill="#22c55e"/><rect x="176" y="168" width="220" height="24" rx="8" fill="#475569"/><rect x="120" y="230" width="240" height="12" rx="6" fill="#334155"/><rect x="120" y="260" width="180" height="12" rx="6" fill="#334155"/><rect x="520" y="170" width="320" height="180" rx="14" fill="#1e293b"/><rect x="548" y="205" width="264" height="16" rx="8" fill="#64748b"/><rect x="548" y="236" width="210" height="16" rx="8" fill="#475569"/><rect x="548" y="267" width="180" height="16" rx="8" fill="#475569"/></svg>'
)}`;

const Hero1 = ({
  badge = 'Kata Orchestrator',
  heading = 'Plan, execute, and verify from one workspace',
  description = 'Coordinate roadmap phases, validate outcomes, and keep implementation context visible while you ship.',
  buttons,
  image = {
    src: FALLBACK_IMAGE_SRC,
    alt: 'Kata Orchestrator interface preview',
  },
  className,
}: Hero1Props) => {
  const primaryButton = buttons?.primary;
  const secondaryButton = buttons?.secondary;
  const [imageSrc, setImageSrc] = useState(image.src);

  useEffect(() => {
    setImageSrc(image.src);
  }, [image.src]);

  const handleExternalClick = (url: string) => {
    void window.kata?.openExternalUrl?.(url);
  };

  return (
    <section className={cn('py-32', className)}>
      <div className="container">
        <div className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12">
          <div className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-left">
            {badge && (
              <Badge variant="outline">
                {badge}
                <ArrowUpRight className="ml-2 size-4" />
              </Badge>
            )}
            <h1 className="text-4xl font-bold text-pretty lg:text-6xl">
              {heading}
            </h1>
            <p className="max-w-xl text-muted-foreground lg:text-xl">
              {description}
            </p>
            <div className="flex w-full flex-col justify-center gap-2 sm:flex-row lg:justify-start">
              {primaryButton && (
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => {
                    handleExternalClick(primaryButton.url);
                  }}
                >
                  {primaryButton.text}
                </Button>
              )}
              {secondaryButton && (
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    handleExternalClick(secondaryButton.url);
                  }}
                >
                  {secondaryButton.text}
                  <ArrowRight className="size-4" />
                </Button>
              )}
            </div>
          </div>
          <img
            src={imageSrc}
            alt={image.alt}
            className="aspect-video w-full rounded-md object-cover"
            onError={() => {
              setImageSrc(FALLBACK_IMAGE_SRC);
            }}
          />
        </div>
      </div>
    </section>
  );
};

export { Hero1 };
