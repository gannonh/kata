import type { ReactNode } from 'react';

export const siteConfig = {
  title: 'Kata Docs',
  description: 'Documentation for the Kata monorepo',
  nav: {
    links: [
      {
        label: 'GitHub',
        href: 'https://github.com/gannonh/kata-mono',
        external: true,
      },
    ],
  },
};

export function Logo(): ReactNode {
  return <span style={{ fontWeight: 700 }}>Kata</span>;
}
