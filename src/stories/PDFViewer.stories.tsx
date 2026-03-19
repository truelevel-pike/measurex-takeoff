import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import PDFViewer from '../components/PDFViewer';

/**
 * PDFViewer — renders a PDF with pan/zoom, page navigation, and overlay support.
 *
 * Because pdfjs-dist requires a real File/ArrayBuffer to render pages,
 * these stories focus on the component shell states (upload prompt and loaded wrapper).
 */
const meta = {
  title: 'Viewers/PDFViewer',
  component: PDFViewer,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    file: { control: false },
    cursor: { control: 'text' },
  },
  decorators: [
    (Story) => (
      <div style={{ width: '100%', height: '100vh', background: '#111' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PDFViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Upload state — no file provided.
 * Shows the empty/upload prompt the user sees before selecting a PDF.
 */
export const Upload: Story = {
  args: {
    file: null,
  },
};

/**
 * Loaded state — a mock File is passed to demonstrate the component wrapper.
 *
 * Note: In Storybook the PDF will fail to parse since this is a fake blob,
 * but this shows the component's loading/error handling UI.
 * For real rendering, use the running app or integration tests.
 */
export const Loaded: Story = {
  args: {
    file: new File(['%PDF-1.4 mock content'], 'blueprint.pdf', {
      type: 'application/pdf',
    }),
    cursor: 'crosshair',
  },
};
