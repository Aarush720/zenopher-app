import React, { useState } from 'react';
import { FileText, Shield, Code, ChevronRight } from 'lucide-react';

export const LegalView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'notices' | 'terms' | 'privacy'>('notices');

  return (
    <div className="workspace" style={{ gridTemplateColumns: '260px minmax(0, 1fr)' }}>
      {/* Sub-nav */}
      <section 
        className="floating-panel"
        style={{
          padding: 'var(--space-panel-padding)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>
          Legal & Notices
        </h2>

        <button
          className={activeTab === 'notices' ? 'selected' : ''}
          style={{ height: '40px', justifyContent: 'flex-start', padding: '0 14px', fontSize: '13px', borderRadius: '12px', gap: '8px' }}
          onClick={() => setActiveTab('notices')}
        >
          <Code size={16} />
          <span>Open-Source Notices</span>
        </button>

        <button
          className={activeTab === 'terms' ? 'selected' : ''}
          style={{ height: '40px', justifyContent: 'flex-start', padding: '0 14px', fontSize: '13px', borderRadius: '12px', gap: '8px' }}
          onClick={() => setActiveTab('terms')}
        >
          <FileText size={16} />
          <span>Terms of Service</span>
        </button>

        <button
          className={activeTab === 'privacy' ? 'selected' : ''}
          style={{ height: '40px', justifyContent: 'flex-start', padding: '0 14px', fontSize: '13px', borderRadius: '12px', gap: '8px' }}
          onClick={() => setActiveTab('privacy')}
        >
          <Shield size={16} />
          <span>Privacy Policy</span>
        </button>
      </section>

      {/* Main Content */}
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
        {activeTab === 'notices' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>
                Open-Source Attribution & Licenses
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
                Zenopher’s graphics engine and architecture incorporate and build upon the PhotoCraft open-source project.
              </p>
            </div>

            {/* PhotoCraft MIT Notice */}
            <div style={{ background: 'var(--container)', borderRadius: 'var(--radius-section)', padding: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>
                PhotoCraft — MIT License
              </div>
              <pre 
                style={{ 
                  fontFamily: 'var(--font-mono)', 
                  fontSize: '11px', 
                  color: 'var(--text-secondary)', 
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  background: 'var(--on-surface)',
                  padding: '16px',
                  borderRadius: '12px',
                }}
              >
{`Copyright (c) 2024-2026 PhotoCraft Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.`}
              </pre>
            </div>

            {/* PhotoCraft Apache 2.0 Notice */}
            <div style={{ background: 'var(--container)', borderRadius: 'var(--radius-section)', padding: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>
                PhotoCraft — Apache License, Version 2.0
              </div>
              <pre 
                style={{ 
                  fontFamily: 'var(--font-mono)', 
                  fontSize: '11px', 
                  color: 'var(--text-secondary)', 
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  background: 'var(--on-surface)',
                  padding: '16px',
                  borderRadius: '12px',
                }}
              >
{`Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.`}
              </pre>
            </div>
          </div>
        )}

        {activeTab === 'terms' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>
              Terms of Service
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Zenopher is provided as a local-first creative application. All vector geometry, raster elements, layouts, and typography constructed within the tool remain the exclusive intellectual property of the author.
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              No subscriptions, usage metering, or licensing fees apply to local desktop usage in version 1.
            </p>
          </div>
        )}

        {activeTab === 'privacy' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>
              Privacy Policy
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Zenopher does not store, transmit, or monetize your creative projects or personal identity. All designs, style profiles, and review calculations execute client-side inside the secure browser runtime.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};

