'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface ContractorReportButtonProps {
  projectId?: string | null;
  className?: string;
  label?: string;
}

export default function ContractorReportButton({
  projectId,
  className,
  label = 'Contractor Report',
}: ContractorReportButtonProps) {
  const [loading, setLoading] = useState(false);

  if (!projectId) return null;

  async function handleClick() {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId!)}/export/contractor`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Failed to export contractor report (${response.status})`);
      }

      const html = await response.text();
      const blob = new Blob([html], { type: 'text/html' });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `contractor-report-${projectId}.html`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      className={className}
      onClick={handleClick}
      disabled={loading}
      aria-label="Export contractor report"
    >
      {loading ? 'Preparing report...' : label}
    </Button>
  );
}
