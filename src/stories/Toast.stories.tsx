import React, { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ToastProvider, useToast, type ToastType } from '../components/Toast';

/* ------------------------------------------------------------------ */
/*  Helper: renders inside ToastProvider and fires a toast on mount   */
/* ------------------------------------------------------------------ */

function ToastTrigger({ type, message, duration }: { type: ToastType; message: string; duration?: number }) {
  const { addToast } = useToast();

  useEffect(() => {
    addToast(message, type, duration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function ToastStory({ type, message, duration }: { type: ToastType; message: string; duration?: number }) {
  return (
    <ToastProvider>
      <ToastTrigger type={type} message={message} duration={duration} />
      <div style={{ padding: 24, color: '#999', fontSize: 14 }}>
        Toast rendered at bottom-right &rarr;
      </div>
    </ToastProvider>
  );
}

/* ------------------------------------------------------------------ */
/*  Meta                                                              */
/* ------------------------------------------------------------------ */

const meta = {
  title: 'Feedback/Toast',
  component: ToastStory,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    type: {
      control: 'select',
      options: ['success', 'error', 'warning', 'info'] as ToastType[],
    },
    message: { control: 'text' },
    duration: { control: 'number' },
  },
} satisfies Meta<typeof ToastStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/*  Stories                                                           */
/* ------------------------------------------------------------------ */

/** Success toast — green accent, check icon. */
export const Success: Story = {
  args: {
    type: 'success',
    message: 'Project saved successfully',
    duration: 60000,
  },
};

/** Error toast — red accent, X-circle icon. */
export const Error: Story = {
  args: {
    type: 'error',
    message: 'Failed to upload PDF — file size exceeds 50 MB limit',
    duration: 60000,
  },
};

/** Info toast — blue accent, info icon. */
export const Info: Story = {
  args: {
    type: 'info',
    message: 'AI takeoff is running on 12 pages…',
    duration: 60000,
  },
};
