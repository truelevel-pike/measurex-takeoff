import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help',
  description: 'Learn how to use MeasureX — tutorials, walkthroughs, and reference guides.',
};

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
