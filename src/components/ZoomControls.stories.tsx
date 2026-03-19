import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import ZoomControls from './ZoomControls';

const meta = {
  title: 'Components/ZoomControls',
  component: ZoomControls,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ZoomControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
