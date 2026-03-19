import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { ToastProvider, useToast } from '@/components/Toast';

function ToastStoryHarness({
  toasts,
}: {
  toasts: Array<{ message: string; type: 'success' | 'error' | 'warning' | 'info'; duration?: number }>;
}) {
  const { addToast } = useToast();

  useEffect(() => {
    toasts.forEach((toast) => {
      addToast(toast.message, toast.type, toast.duration ?? 6000);
    });
  }, [addToast, toasts]);

  return <div style={{ minHeight: 220, padding: 16, color: '#cbd5e1' }}>Toast preview area</div>;
}

const meta = {
  title: 'MeasureX/Toast',
  component: ToastStoryHarness,
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ToastStoryHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    toasts: [{ message: 'Project saved successfully.', type: 'success' }],
  },
};

export const ErrorToast: Story = {
  args: {
    toasts: [{ message: 'Failed to update project settings.', type: 'error' }],
  },
};

export const MultipleToastsStacked: Story = {
  args: {
    toasts: [
      { message: 'Takeoff imported.', type: 'success' },
      { message: 'Scale calibration may be inaccurate.', type: 'warning' },
      { message: 'Could not sync one annotation.', type: 'error' },
    ],
  },
};
