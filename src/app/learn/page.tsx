'use client';

import React, { useState } from 'react';
import {
  ArrowLeft,
  Upload,
  Cpu,
  Layers,
  Download,
  FileUp,
  Play,
  Search,
  Ruler,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Mail,
} from 'lucide-react';
import Link from 'next/link';

const GETTING_STARTED = [
  {
    step: 1,
    icon: <Upload size={24} />,
    title: 'Upload PDF',
    desc: 'Click "New Project" and drag-and-drop your PDF plans. Multi-page PDFs are fully supported — each page becomes a separate takeoff sheet.',
    detail: 'Supported formats: PDF, TIFF, PNG, JPEG. Max 200 MB per file.',
  },
  {
    step: 2,
    icon: <Ruler size={24} />,
    title: 'Set Scale',
    desc: 'Use the Scale tool to draw a line between two known points on your drawing and enter the real-world distance. MeasureX calculates the exact pixels-per-foot ratio.',
    detail: 'Tip: Use a dimension line or a door width (standard 3 ft) as your reference.',
  },
  {
    step: 3,
    icon: <Cpu size={24} />,
    title: 'Run AI Takeoff',
    desc: 'Click "AI Takeoff" in the toolbar. The AI scans your drawing, identifies elements (walls, slabs, openings, etc.), and places polygons with measurements automatically.',
    detail: 'Review and edit any polygon before exporting. Export to Excel when ready.',
  },
];

const TUTORIALS = [
  { icon: <FileUp size={20} />, title: 'How to Upload Plans', time: '3 min read' },
  { icon: <Play size={20} />, title: 'Running Your First Takeoff', time: '5 min read' },
  { icon: <Search size={20} />, title: 'Using AI Image Search', time: '4 min read' },
  { icon: <Layers size={20} />, title: 'Using Assemblies', time: '6 min read' },
  { icon: <Download size={20} />, title: 'Exporting to Excel', time: '2 min read' },
  { icon: <Ruler size={20} />, title: 'Calibrating Scale', time: '3 min read' },
];

const VIDEOS = [
  { title: 'Full Walkthrough', duration: '12:34' },
  { title: 'Advanced Calibration', duration: '8:15' },
  { title: 'Team Collaboration', duration: '6:42' },
];

const FAQ_ITEMS = [
  { q: 'How accurate is the AI takeoff?', a: 'Our AI achieves 95%+ accuracy on standard construction drawings. Results can always be manually adjusted for full precision.' },
  { q: 'Can I import from other software?', a: 'Yes, MeasureX supports importing from common takeoff formats. You can also import classifications and assemblies from CSV files.' },
  { q: 'What file formats are supported?', a: 'We support PDF, TIFF, PNG, and JPEG file formats. Multi-page PDFs are fully supported with per-page navigation.' },
  { q: 'How do I share with my team?', a: 'Use the Share button on any project to invite team members by email. You can set view-only or edit permissions.' },
  { q: 'Can I export to Excel?', a: 'Absolutely. Click Export in the top toolbar to generate an Excel spreadsheet with all quantities, classifications, and cost breakdowns.' },
  { q: 'How does calibration work?', a: 'Draw a line between two known points on your plan and enter the real-world distance. MeasureX will calculate the scale for accurate measurements.' },
];

export default function LearnPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaq(prev => (prev === index ? null : index));
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <Link href="/projects" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold">Learn MeasureX</h1>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10 space-y-14">
        {/* Getting Started */}
        <section>
          <h2 className="text-lg font-semibold mb-6">Getting Started</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {GETTING_STARTED.map(item => (
              <div
                key={item.step}
                className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col gap-4 relative"
              >
                {/* Step badge */}
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
                    {item.step}
                  </span>
                  <span className="text-green-400">{item.icon}</span>
                </div>
                <h3 className="text-base font-semibold text-white">{item.title}</h3>
                <p className="text-sm text-gray-300 leading-relaxed">{item.desc}</p>
                {/* Detail hint */}
                <div className="mt-auto pt-3 border-t border-gray-800">
                  <p className="text-xs text-gray-500 leading-relaxed">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Connector arrows between steps */}
          <div className="hidden md:flex items-center justify-center gap-2 mt-2 text-gray-700 text-xs select-none">
            <span>Step 1</span>
            <ArrowRight size={14} />
            <span>Step 2</span>
            <ArrowRight size={14} />
            <span>Step 3</span>
          </div>
        </section>

        {/* Tutorial Links */}
        <section>
          <h2 className="text-lg font-semibold mb-6">Tutorials</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TUTORIALS.map((tut, i) => (
              <button
                key={i}
                className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center gap-4 hover:border-gray-600 transition-colors text-left group"
              >
                <span className="text-green-400 shrink-0">{tut.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{tut.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{tut.time}</div>
                </div>
                <ArrowRight size={16} className="text-gray-600 group-hover:text-gray-400 shrink-0 transition-colors" />
              </button>
            ))}
          </div>
        </section>

        {/* Video Placeholders */}
        <section>
          <h2 className="text-lg font-semibold mb-6">Video Guides</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {VIDEOS.map((vid, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="aspect-video bg-gray-800 flex items-center justify-center relative">
                  <button className="w-14 h-14 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors">
                    <Play size={24} className="text-white ml-1" />
                  </button>
                  <span className="absolute bottom-2 right-2 bg-black/70 text-xs text-gray-300 px-2 py-0.5 rounded">
                    {vid.duration}
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-medium text-white">{vid.title}</h3>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="text-lg font-semibold mb-6">Frequently Asked Questions</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
            {FAQ_ITEMS.map((faq, i) => (
              <div key={i}>
                <button
                  onClick={() => toggleFaq(i)}
                  className="w-full text-left px-6 py-4 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
                >
                  <span className="text-sm font-medium text-white">{faq.q}</span>
                  {openFaq === i ? (
                    <ChevronUp size={16} className="text-gray-400 shrink-0 ml-4" />
                  ) : (
                    <ChevronDown size={16} className="text-gray-400 shrink-0 ml-4" />
                  )}
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4 text-sm text-gray-400 leading-relaxed">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Bottom buttons */}
        <section className="flex items-center gap-4 pb-10">
          <button className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <HelpCircle size={16} /> Help Center
          </button>
          <button className="border border-gray-600 text-gray-300 hover:text-white hover:border-gray-500 px-6 py-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <Mail size={16} /> Contact Support
          </button>
        </section>
      </div>
    </div>
  );
}
