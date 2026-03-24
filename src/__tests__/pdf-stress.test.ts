import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import PDFViewer from '@/components/PDFViewer';
import PageThumbnailSidebar from '@/components/PageThumbnailSidebar';

const mockGetDocument = jest.fn();

jest.mock('pdfjs-dist', () => ({
  version: '5.5.207',
  GlobalWorkerOptions: {},
  getDocument: mockGetDocument,
}));

const mockStoreState = {
  drawingSets: {} as Record<number, string>,
  setDrawingSet: jest.fn(),
  sheetNames: {} as Record<number, string>,
  setPageBaseDimensions: jest.fn(),
};

jest.mock('@/lib/store', () => ({
  useStore: Object.assign(
    (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
    { getState: () => mockStoreState }
  ),
}));

type MockIntersectionObserverCallback = (
  entries: Array<Pick<IntersectionObserverEntry, 'target' | 'isIntersecting'>>,
  observer: IntersectionObserver
) => void;

class MockIntersectionObserver implements IntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly root: Element | Document | null = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];
  private callback: MockIntersectionObserverCallback;

  constructor(callback: MockIntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe(target: Element): void {
    const pageNumber = Number((target as HTMLElement).dataset.pageNumber ?? '0');
    const isIntersecting = Number.isFinite(pageNumber) && pageNumber > 0 && pageNumber <= 10;
    this.callback([{ target, isIntersecting }], this as unknown as IntersectionObserver);
  }

  unobserve(): void {}

  disconnect(): void {}

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

function createMockPdfDoc(numPages: number) {
  const getPage = jest.fn(async () => ({
    getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
    render: () => ({ promise: Promise.resolve() }),
    getTextContent: async () => ({ items: [{ str: 'mock text' }] }),
  }));

  return {
    numPages,
    getPage,
    destroy: jest.fn(async () => undefined),
  };
}

describe('PDF stress', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      writable: true,
      configurable: true,
      value: MockIntersectionObserver,
    });

    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: jest.fn(() => ({
        setTransform: jest.fn(),
        clearRect: jest.fn(),
        fillRect: jest.fn(),
        fillStyle: '',
      })),
    });

    Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
      configurable: true,
      value: jest.fn(() => 'data:image/png;base64,mock-thumb'),
    });

    Object.defineProperty(performance, 'mark', {
      configurable: true,
      value: jest.fn(
        (name: string): PerformanceMark =>
          ({
            name,
            entryType: 'mark',
            startTime: 0,
            duration: 0,
            toJSON: () => ({}),
          }) as PerformanceMark
      ),
    });

    Object.defineProperty(performance, 'measure', {
      configurable: true,
      value: jest.fn(
        (name: string): PerformanceMeasure =>
          ({
            name,
            entryType: 'measure',
            startTime: 0,
            duration: 0,
            detail: null,
            toJSON: () => ({}),
          }) as PerformanceMeasure
      ),
    });

  });

  beforeEach(() => {
    jest.clearAllMocks();
    MockIntersectionObserver.instances = [];
  });

  it('renders PDFViewer without crashing for a 40-page PDF', async () => {
    const mockDoc = createMockPdfDoc(40);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockDoc) });

    const file = {
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as unknown as File;

    render(React.createElement(PDFViewer, { file }));

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'PDF page 1 of 40' })).toBeInTheDocument();
    });

    expect(mockDoc.getPage).toHaveBeenCalledWith(1);
  });

  it('does not eagerly render thumbnails beyond page 10', async () => {
    const mockDoc = createMockPdfDoc(40);

    render(
      React.createElement(PageThumbnailSidebar, {
        totalPages: 40,
        currentPage: 1,
        onPageSelect: () => {},
        pdfDoc: mockDoc as never,
      })
    );

    await waitFor(() => {
      expect(mockDoc.getPage).toHaveBeenCalled();
    });

    const requestedPages = (mockDoc.getPage as jest.Mock).mock.calls
      .map((call) => call[0] as number)
      .sort((a, b) => a - b);

    expect(requestedPages.length).toBeGreaterThan(0);
    expect(requestedPages.every((page) => page <= 10)).toBe(true);
  });
});
