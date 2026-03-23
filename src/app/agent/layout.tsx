import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent API',
  description: 'MeasureX agent integration reference — browser control API, SSE events, and automation contract.',
};

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
