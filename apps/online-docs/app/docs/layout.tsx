import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { siteConfig, Logo } from '@/geistdocs';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      nav={{
        title: <Logo />,
      }}
      links={siteConfig.nav.links.map((link) => ({
        text: link.label,
        url: link.href,
        external: link.external,
      }))}
    >
      {children}
    </DocsLayout>
  );
}
