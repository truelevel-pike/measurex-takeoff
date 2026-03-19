import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import BottomStatusBar from './BottomStatusBar';

const meta = {
  title: 'Components/BottomStatusBar',
  component: BottomStatusBar,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof BottomStatusBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    zoomPercent: 100,
    activeToolName: 'Select',
    cursor: { x: 320, y: 450 },
  },
};

export const NoScale: Story = {
  args: {
    zoomPercent: 150,
    activeToolName: 'Draw',
  },
};

export const WithCursor: Story = {
  args: {
    zoomPercent: 75,
    activeToolName: 'Measure',
    cursor: { x: 1024, y: 768 },
  },
};
