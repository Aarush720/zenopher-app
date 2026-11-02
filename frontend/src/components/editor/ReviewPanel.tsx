import React, { useState } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  Wand2, 
  Sliders, 
  ChevronRight,
  ShieldCheck,
  Check,
  Cloud
} from 'lucide-react';
import { Design, ReviewFinding } from '../../types';
import { STYLE_PROFILES } from '../../data/styles';
import { ApiCritiqueResult } from '../../services/api';

interface ReviewPanelProps {
  design: Design;
  findings: ReviewFinding[];
  onApplyFix: (finding: ReviewFinding) => void;
  onApplyAllFixes: () => void;
  onOpenStylePicker: () => void;
  onRequestCloudCritique?: () => Promise<ApiCritiqueResult>;
  cloudReviewAvailable?: boolean;
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({
  design,
  findings,
  onApplyFix,
  onApplyAllFixes,
  onOpenStylePicker,
  onRequestCloudCritique,
  cloudReviewAvailable = false,
}) => {
  const [expandedExplanationId, setExpandedExplanationId] = useState<string | null>(null);
  const [cloudResult, setCloudResult] = useState<{ summary: string; points: Array<{ area: string; comment: string }> } | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudLoading, setCloudLoading] = useState(false);

  // Group findings by category
  const categories: { key: ReviewFinding['category']; label: string }[] = [
    { key: 'contrast', label: 'Contrast' },
    { key: 'text-size', label: 'Text size' },
    { key: 'alignment', label: 'Alignment' },
    { key: 'spacing', label: 'Spacing' },
    { key: 'crop', label: 'Crop' },
    { key: 'style-consistency', label: 'Style consistency' },
  ];

  const currentStyle = design.styleId ? STYLE_PROFILES.find((s) => s.id === design.styleId) : null;
  const fixableCount = findings.filter((f) => f.isFixable && f.confidence === 'must').length;

  return (
    <div className="review-panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px', height: '100%' }}>
      {/* Top Header / Mode Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
            Review
          </h2>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {currentStyle ? `Measuring against ${currentStyle.name}` : 'Base system checks (No style)'}
          </div>
        </div>

        {/* Apply All Action */}
        <button
          className={fixableCount > 0 ? 'primary' : ''}
          disabled={fixableCount === 0}
          onClick={onApplyAllFixes}
          style={{
            height: '34px',
            padding: '0 12px',
            fontSize: '11px',
            fontWeight: 600,
            borderRadius: '6px',
            gap: '6px',
          }}
          title={fixableCount === 0 ? 'No fixes available' : 'Apply all high-confidence fixes'}
        >
          <Check size={13} />
          <span>Apply all ({fixableCount})</span>
        </button>
      </div>

      {onRequestCloudCritique && (
        <div style={{ background: 'var(--container)', borderRadius: 'var(--radius-section)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <Cloud size={14} />
            <span style={{ fontSize: '12px', fontWeight: 700 }}>Cloud critique</span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Send the current PNG and measured findings to the configured review teacher. This is only available when signed in with critique consent.
          </p>
          <button
            className={cloudReviewAvailable ? 'primary' : ''}
            disabled={!cloudReviewAvailable || cloudLoading}
            onClick={async () => {
              setCloudLoading(true);
              setCloudError(null);
              try {
                const response = await onRequestCloudCritique();
                const parsed = JSON.parse(response.text) as { summary?: string; points?: Array<{ area?: string; comment?: string }> };
                setCloudResult({
                  summary: parsed.summary || 'The review teacher returned no summary.',
                  points: (parsed.points || []).filter((point): point is { area: string; comment: string } => Boolean(point.area && point.comment)).map((point) => ({ area: point.area!, comment: point.comment! })),
                });
              } catch (error) {
                setCloudError(error instanceof Error ? error.message : 'Cloud critique failed.');
              } finally {
                setCloudLoading(false);
              }
            }}
            style={{ height: '32px', fontSize: '11px', gap: '6px' }}
          >
            <Cloud size={13} /> {cloudLoading ? 'Reviewing…' : cloudReviewAvailable ? 'Run cloud critique' : 'Sign in and grant consent first'}
          </button>
          {cloudError && <p style={{ fontSize: '11px', color: '#F87171', lineHeight: 1.4 }}>{cloudError}</p>}
          {cloudResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', borderTop: '1px solid var(--surface)', paddingTop: '9px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.4 }}>{cloudResult.summary}</p>
              {cloudResult.points.map((point, index) => (
                <div key={`${point.area}-${index}`} style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  <strong style={{ color: 'var(--text)' }}>{point.area}:</strong> {point.comment}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Style Prompt Banner (when no style attached in corporate mode) */}
      {!design.styleId && (
        <div 
          style={{
            background: 'var(--container)',
            borderRadius: 'var(--radius-section)',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
              Style not set
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Attach a style to enable strict consistency rules.
            </span>
          </div>
          <button
            style={{
              height: '30px',
              padding: '0 10px',
              fontSize: '11px',
              fontWeight: 600,
              background: 'var(--container-hover)',
              color: 'var(--text)',
              borderRadius: '6px',
              whiteSpace: 'nowrap',
            }}
            onClick={onOpenStylePicker}
          >
            Choose style
          </button>
        </div>
      )}

      {/* Findings List or Clean State */}
      <div 
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '16px',
          paddingRight: '2px',
        }}
      >
        {findings.length === 0 ? (
          <div 
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              height: '220px',
              textAlign: 'center',
              gap: '10px',
              padding: '20px',
              background: 'var(--container)',
              borderRadius: 'var(--radius-section)',
            }}
          >
            <ShieldCheck size={32} color="var(--text)" />
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
              All checks passing
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4, maxWidth: '240px' }}>
              Your design satisfies all contrast, alignment, typography, and boundary rules.
            </p>
          </div>
        ) : (
          categories.map((cat) => {
            const catFindings = findings.filter((f) => f.category === cat.key);
            if (catFindings.length === 0) return null;

            return (
              <div key={cat.key} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {cat.label} ({catFindings.length})
                </div>

                {catFindings.map((finding) => {
                  const isExplExpanded = expandedExplanationId === finding.id;

                  return (
                    <div
                      key={finding.id}
                      style={{
                        background: 'var(--container)',
                        borderRadius: 'var(--radius-control)',
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      {/* Title & Info icon */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                          {finding.title}
                        </span>
                        <button
                          style={{
                            width: '20px',
                            height: '20px',
                            minWidth: '20px',
                            background: 'transparent',
                            color: isExplExpanded ? 'var(--text)' : 'var(--text-muted)',
                            padding: 0,
                          }}
                          onClick={() => setExpandedExplanationId(isExplExpanded ? null : finding.id)}
                          title="View rule explanation"
                          aria-label="View rule explanation"
                        >
                          <Info size={14} />
                        </button>
                      </div>

                      {/* Measured vs Required */}
                      <div 
                        style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '1fr 1fr', 
                          gap: '8px',
                          fontSize: '11px',
                          background: 'var(--on-surface)',
                          padding: '8px 10px',
                          borderRadius: '6px',
                        }}
                      >
                        <div>
                          <span style={{ color: 'var(--text-muted)', display: 'block' }}>Current value</span>
                          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{finding.currentValue}</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)', display: 'block' }}>Required value</span>
                          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{finding.requiredValue}</span>
                        </div>
                      </div>

                      {/* Expandable Explanation */}
                      {isExplExpanded && (
                        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4, margin: '2px 0' }}>
                          {finding.explanation}
                        </p>
                      )}

                      {/* Fix Action Button */}
                      {finding.isFixable && (
                        <button
                          className="primary"
                          style={{
                            height: '32px',
                            fontSize: '11px',
                            fontWeight: 600,
                            borderRadius: '6px',
                            marginTop: '2px',
                          }}
                          onClick={() => onApplyFix(finding)}
                        >
                          {finding.fixActionLabel}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

