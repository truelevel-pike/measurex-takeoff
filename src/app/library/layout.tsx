import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Library',
  description: 'Browse and manage classification templates, assemblies, and reusable takeoff libraries.',
};

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
