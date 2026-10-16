/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ActiveDoc, RecentDocItem } from './types';
import { getRecentDocs, saveRecentDoc } from './utils/storage';
import { Dashboard } from './components/Dashboard';
import { ReaderView } from './components/ReaderView';

export default function App() {
  const [activeDoc, setActiveDoc] = useState<ActiveDoc | null>(null);
  const [recentDocs, setRecentDocs] = useState<RecentDocItem[]>([]);

  useEffect(() => {
    // Load recent files on mount
    const stored = getRecentDocs();
    setRecentDocs(stored);
  }, []);

  // Keyboard shortcut listener for convenient reading
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If user presses Escape while in reader, return to dashboard
      if (e.key === 'Escape' && activeDoc) {
        setActiveDoc(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDoc]);

  const handleOpenDoc = (doc: ActiveDoc) => {
    setActiveDoc(doc);
  };

  const handlePreviewExtracted = (preview: string) => {
    if (!activeDoc) return;
    const updated = saveRecentDoc({
      name: activeDoc.name,
      ext: activeDoc.ext,
      preview: preview.slice(0, 240),
      date: Date.now(),
    });
    setRecentDocs(updated);
  };

  if (activeDoc) {
    return (
      <ReaderView
        key={activeDoc.name}
        doc={activeDoc}
        onBack={() => setActiveDoc(null)}
        onPreviewExtracted={handlePreviewExtracted}
      />
    );
  }

  return (
    <Dashboard
      recentDocs={recentDocs}
      onOpenDoc={handleOpenDoc}
      onRefreshRecent={(updated) => setRecentDocs(updated)}
    />
  );
}
