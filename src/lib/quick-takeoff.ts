'use client';

import { useCallback, useEffect, useMemo } from 'react';
import type { Classification } from '@/lib/types';
import { useStore } from '@/lib/store';

export interface QuickTakeoffState {
  isActive: boolean;
  toggle: () => void;
  nextClassification: () => void;
  prevClassification: () => void;
  currentClassification: Classification | null;
}

function isEditableElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
}

export function useQuickTakeoff(): QuickTakeoffState {
  const currentTool = useStore((s) => s.currentTool);
  const setTool = useStore((s) => s.setTool);
  const classifications = useStore((s) => s.classifications);
  const selectedClassification = useStore((s) => s.selectedClassification);
  const setSelectedClassification = useStore((s) => s.setSelectedClassification);

  const isActive = currentTool === 'draw';

  const currentClassification = useMemo<Classification | null>(() => {
    if (classifications.length === 0) return null;

    if (selectedClassification) {
      const selected = classifications.find((c) => c.id === selectedClassification);
      if (selected) return selected;
    }

    return classifications[0] ?? null;
  }, [classifications, selectedClassification]);

  const toggle = useCallback(() => {
    if (isActive) {
      setTool('select');
      return;
    }

    setTool('draw');
    if (!selectedClassification && classifications[0]) {
      setSelectedClassification(classifications[0].id);
    }
  }, [classifications, isActive, selectedClassification, setSelectedClassification, setTool]);

  const nextClassification = useCallback(() => {
    if (classifications.length === 0) return;

    const currentIndex = currentClassification
      ? classifications.findIndex((c) => c.id === currentClassification.id)
      : -1;

    const nextIndex = currentIndex >= 0
      ? (currentIndex + 1) % classifications.length
      : 0;

    setSelectedClassification(classifications[nextIndex].id);
  }, [classifications, currentClassification, setSelectedClassification]);

  const prevClassification = useCallback(() => {
    if (classifications.length === 0) return;

    const currentIndex = currentClassification
      ? classifications.findIndex((c) => c.id === currentClassification.id)
      : -1;

    const prevIndex = currentIndex >= 0
      ? (currentIndex - 1 + classifications.length) % classifications.length
      : 0;

    setSelectedClassification(classifications[prevIndex].id);
  }, [classifications, currentClassification, setSelectedClassification]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(document.activeElement)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() !== 'f') return;

      event.preventDefault();
      toggle();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  return {
    isActive,
    toggle,
    nextClassification,
    prevClassification,
    currentClassification,
  };
}
