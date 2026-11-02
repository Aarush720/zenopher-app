import React, { useState } from 'react';
import { BookOpen, Check, Layers, Sliders, Shield, ArrowRight } from 'lucide-react';

interface TutorialGuide {
  id: string;
  title: string;
  category: string;
  summary: string;
  content: string[];
}

const TUTORIALS: TutorialGuide[] = [
  {
    id: 'tut-modes',
    title: 'Creative vs Corporate Modes',
    category: 'Core Workflow',
    summary: 'Understand when to design quietly without checks and when to engage the review teacher.',
    content: [
      'Zenopher provides two fundamentally distinct operating modes for creative work:',
      '• Creative Mode: Works quietly. The teacher stays off. No findings, no badges, no counters, and no suggestion bubbles are ever shown. It is a distraction-free, pure creative canvas.',
      '• Corporate Mode: Monitors your design as you work. It measures contrast ratios, typographic sizes, column alignment, bounding margins, and crop boundaries against mathematical rules.',
      'You can switch modes at any time from the top bar in the editor without affecting your canvas objects.',
    ],
  },
  {
    id: 'tut-review-rules',
    title: 'The Six Automated Design Checks',
    category: 'Design Engine',
    summary: 'How the review engine evaluates your layers and suggests instant one-click fixes.',
    content: [
      'The Corporate Review engine monitors six critical production criteria:',
      '1. Contrast: Evaluates text fill against the underlying background. Flags ratios below 4.5:1 (WCAG AA) and offers a one-click fix to pure white.',
      '2. Text Size: Verifies body text is at or above 13px (or style minimum) to prevent unreadable desktop copy.',
      '3. Alignment: Checks that elements rest accurately on 8px grid intervals rather than drifting between pixels.',
      '4. Spacing: Ensures vital objects do not compress right against canvas boundaries, enforcing healthy breathing room.',
      '5. Crop: Detects objects extending beyond the export boundaries to eliminate accidental clipping.',
      '6. Style Consistency: When a style profile is attached, checks that typography and colors adhere strictly to the profile palette.',
    ],
  },
  {
    id: 'tut-monochrome-tokens',
    title: 'The Monochrome Design Language',
    category: 'Aesthetics',
    summary: 'Why Zenopher rejects shadows, glows, and glassmorphism in favor of pure flat surfaces.',
    content: [
      'Zenopher’s user interface relies entirely on spatial separation and value contrast:',
      '• #000000 (Surface): The deep workspace void, canvas background, and panel gaps.',
      '• #111111 (On-Surface): Floating navigation rail, floating top bar, and editor tool panels.',
      '• #2C2C2C (Container): Interactive controls, square selector tiles, buttons, and inputs.',
      '• #FFFFFF (Text): Primary headings, active selections, and essential accents.',
      'By eliminating borders, shadows, and neon glows, the interface maintains razor-sharp focus on the creative work itself.',
    ],
  },
  {
    id: 'tut-storage-export',
    title: 'Offline Storage & .zph Portability',
    category: 'Data & Formats',
    summary: 'Autosave to IndexedDB and exporting lossless project files.',
    content: [
      'Zenopher saves continuously to your browser’s IndexedDB sandbox. Even if your internet connection drops or you work on an airplane, everything continues saving locally.',
      'Because clearing browser history deletes browser storage, you can export your projects at any time as .zph (Zenopher Project) files.',
      '.zph files preserve all vector layers, hierarchy, custom fonts, mode settings, and attached style profiles in a compact, portable format.',
    ],
  },
];

export const TutorialsView: React.FC = () => {
  const [activeGuide, setActiveGuide] = useState<TutorialGuide>(TUTORIALS[0]);

  return (
    <div className="workspace">
      {/* Guides List */}
      <section 
        className="floating-panel"
        style={{
          padding: 'var(--space-panel-padding)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          overflowY: 'auto',
        }}
      >
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>
            Tutorials & Patterns
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Comprehensive guides on the teacher’s patterns, review checks, and monochrome workflow.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {TUTORIALS.map((guide) => {
            const isSelected = activeGuide.id === guide.id;
            return (
              <div
                key={guide.id}
                onClick={() => setActiveGuide(guide)}
                style={{
                  padding: '16px',
                  borderRadius: 'var(--radius-section)',
                  background: isSelected ? 'var(--container-hover)' : 'var(--container)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  transition: 'background var(--motion)',
                }}
              >
                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)' }}>
                  {guide.category}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                  {guide.title}
                </span>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                  {guide.summary}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Guide Detail Reader */}
      <section 
        className="floating-panel"
        style={{
          padding: 'var(--space-panel-padding)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          overflowY: 'auto',
        }}
      >
        <div>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)' }}>
            {activeGuide.category}
          </span>
          <h3 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text)', marginTop: '4px' }}>
            {activeGuide.title}
          </h3>
        </div>

        <div 
          style={{ 
            background: 'var(--container)', 
            borderRadius: 'var(--radius-section)', 
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {activeGuide.content.map((paragraph, index) => (
            <p 
              key={index} 
              style={{ 
                fontSize: '13px', 
                color: paragraph.startsWith('•') || paragraph.startsWith('1.') || paragraph.startsWith('2.') ? 'var(--text)' : 'var(--text-secondary)',
                lineHeight: 1.6,
                fontWeight: paragraph.startsWith('•') ? 500 : 400,
              }}
            >
              {paragraph}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
};

