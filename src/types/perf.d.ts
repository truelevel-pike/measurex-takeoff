export {};

declare global {
  interface PerfMarks {
    pdfRender: number | null;
    aiTakeoff: number | null;
    polygonDraw: number | null;
  }

  interface Window {
    __perfMarks: PerfMarks;
  }
}
