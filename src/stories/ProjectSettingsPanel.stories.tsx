import { useEffect, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { userEvent, within } from 'storybook/test';

import ProjectSettingsPanel from '@/components/ProjectSettingsPanel';
import { ToastProvider } from '@/components/Toast';
import { useStore } from '@/lib/store';

function SeededStoreWrapper({ children }: { children: ReactNode }) {
  useEffect(() => {
    useStore.setState({
      projectId: 'project-story-1',
      currentPage: 1,
      scale: { pixelsPerUnit: 1, unit: 'ft', label: 'feet', source: 'manual' },
    });

    return () => {
      useStore.setState({
        projectId: null,
      });
    };
  }, []);

  return (
    <ToastProvider>
      <div style={{ minHeight: '100vh', background: '#090b12' }}>{children}</div>
    </ToastProvider>
  );
}

const meta = {
  title: 'MeasureX/ProjectSettingsPanel',
  component: ProjectSettingsPanel,
  decorators: [
    (Story) => (
      <SeededStoreWrapper>
        <Story />
      </SeededStoreWrapper>
    ),
  ],
  args: {
    open: true,
    onClose: () => undefined,
  },
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ProjectSettingsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OpenState: Story = {
  args: {
    projectName: null,
  },
};

export const WithProjectName: Story = {
  args: {
    projectName: 'Acme Hospital Renovation',
  },
};

export const DeleteConfirmationState: Story = {
  args: {
    projectName: 'Acme Hospital Renovation',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Delete Project/i }));
  },
};
