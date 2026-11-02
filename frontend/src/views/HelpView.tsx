import React from 'react';
import { HelpCircle, Command, Mail, ExternalLink, LifeBuoy } from 'lucide-react';

interface HelpViewProps {
  onOpenShortcuts: () => void;
}

export const HelpView: React.FC<HelpViewProps> = ({ onOpenShortcuts }) => {
  return (
    <div className="workspace" style={{ gridTemplateColumns: '1fr' }}>
      <section 
        className="floating-panel"
        style={{
          padding: 'var(--space-panel-padding)',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          overflowY: 'auto',
          maxWidth: '720px',
          margin: '0 auto',
          width: '100%',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HelpCircle size={24} color="var(--text)" />
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)' }}>
              Help & Documentation
            </h2>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
            Find quick reference shortcuts, keyboard navigations, and engine documentation.
          </p>
        </div>

        {/* Shortcuts Card */}
        <div 
          style={{ 
            background: 'var(--container)', 
            borderRadius: 'var(--radius-section)', 
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px'
          }}
        >
          <div>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', display: 'block' }}>
              Keyboard Shortcuts Cheatsheet
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
              Master rapid desktop commands for navigation, layer transformations, and exports.
            </span>
          </div>
          <button
            className="primary"
            style={{ height: '40px', padding: '0 16px', fontSize: '12px', fontWeight: 700, borderRadius: '12px', gap: '6px' }}
            onClick={onOpenShortcuts}
          >
            <Command size={14} />
            <span>View Shortcuts</span>
          </button>
        </div>

        {/* Quick FAQ / Guide Questions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ background: 'var(--container)', borderRadius: 'var(--radius-control)', padding: '16px 20px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '4px' }}>
              Where are my design files stored?
            </span>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              All designs are persisted locally in your browser's IndexedDB engine. To backup or move designs across computers, click Export and select .zph (Zenopher Project format).
            </p>
          </div>

          <div style={{ background: 'var(--container)', borderRadius: 'var(--radius-control)', padding: '16px 20px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '4px' }}>
              Can I use custom dimensions for artboards?
            </span>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Yes. Click 'New design' and choose the 'Custom' preset tile. Enter your desired width, height, and unit (px, mm, or in).
            </p>
          </div>

          <div style={{ background: 'var(--container)', borderRadius: 'var(--radius-control)', padding: '16px 20px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '4px' }}>
              How does the Corporate Mode review engine work?
            </span>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Corporate Mode evaluates WCAG contrast ratios, minimum text sizing, 8px grid alignment, canvas bleed margins, and style consistency. If a check fails, a 'Fix' button is provided to correct it immediately.
            </p>
          </div>
        </div>

        {/* Contact info */}
        <div style={{ background: 'var(--container)', borderRadius: 'var(--radius-section)', padding: '20px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '4px' }}>
            Support & Feedback
          </span>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Zenopher is actively built with community feedback. Report issues or request style presets through the developer console.
          </p>
        </div>
      </section>
    </div>
  );
};

