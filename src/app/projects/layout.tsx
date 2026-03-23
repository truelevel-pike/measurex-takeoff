import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Projects',
  description: 'Browse and manage your MeasureX construction takeoff projects.',
};

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
