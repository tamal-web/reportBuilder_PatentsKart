'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { api, ClaimChartRowOut, KeyFeatureOut, PatentInputOut } from '@/lib/api';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface EditableJustificationProps {
  row: ClaimChartRowOut;
  reportId: string;
  onUpdate: (rowId: number, justification: string, found: boolean) => void;
}

function EditableJustification({
  row,
  reportId,
  onUpdate,
}: EditableJustificationProps) {
  const [value, setValue] = useState(row.justification);
  const [saving, setSaving] = useState(false);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const originalRef = useRef(row.justification);

  useEffect(() => {
    setValue(row.justification);
    originalRef.current = row.justification;
  }, [row.justification]);

  const handleBlur = useCallback(async () => {
    if (value === originalRef.current) return;
    setSaving(true);
    try {
      if (reportId && row.id > 0) {
        await api.reports.updateClaimChart(reportId, row.id, value, row.found);
      }
      originalRef.current = value;
      onUpdate(row.id, value, row.found);
      setSavedIndicator(true);
      setTimeout(() => setSavedIndicator(false), 2000);
    } catch (e) {
      console.error('Failed to save justification:', e);
      setValue(originalRef.current);
    } finally {
      setSaving(false);
    }
  }, [value, reportId, row.id, row.found, onUpdate]);

  return (
    <div className="relative group/cell">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        id={`justification-${row.id}`}
        className="text-xs leading-relaxed resize-none min-h-[72px] border-transparent bg-transparent hover:border-border/60 focus:border-border transition-colors pr-7 shadow-none rounded-md"
        placeholder="Enter justification from patent manually..."
      />
      {saving && (
        <Loader2 className="absolute top-2 right-2 w-3 h-3 animate-spin text-muted-foreground" />
      )}
      {savedIndicator && !saving && (
        <CheckCircle className="absolute top-2 right-2 w-3 h-3 text-emerald-500" />
      )}
    </div>
  );
}

interface Props {
  reportId: string;
  patents: PatentInputOut[];
  keyFeatures: KeyFeatureOut[];
  claimCharts: Record<string, ClaimChartRowOut[]>;
  onUpdate: (rowId: number, justification: string, found: boolean) => void;
}

export default function ClaimChartTable({
  reportId,
  patents = [],
  keyFeatures = [],
  claimCharts = {},
  onUpdate,
}: Props) {
  const displayPatents: PatentInputOut[] =
    patents && patents.length > 0
      ? patents
      : [
          {
            id: -1,
            patent_id: 'p1',
            publication_number: 'N/A',
            title: 'No patents loaded yet',
            owner: '—',
          },
        ];

  const displayFeatures: KeyFeatureOut[] =
    keyFeatures && keyFeatures.length > 0
      ? keyFeatures
      : [{ id: -1, index: 1, description: 'No features defined yet' }];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-base font-semibold">Claim Charts</h2>
        <p className="text-sm text-muted-foreground">
          Feature-by-feature analysis per patent.{' '}
          <span className="text-foreground/60">
            Click any justification cell to edit inline — changes save on blur. Click any Yes/No badge to toggle.
          </span>
        </p>
      </div>

      {displayPatents.map((patent) => {
        const existingRows = claimCharts[patent.patent_id] ?? [];
        const existingMap = new Map(existingRows.map((r) => [r.feature_index, r]));

        const rows: ClaimChartRowOut[] = displayFeatures.map((feature, fIdx) => {
          if (existingMap.has(feature.index)) {
            return existingMap.get(feature.index)!;
          }
          return {
            id: -Math.abs(patent.id * 1000) - feature.index - fIdx,
            patent_id: patent.patent_id,
            patent_pub_number: patent.publication_number,
            feature_index: feature.index,
            feature_description: feature.description,
            justification: '',
            found: false,
          };
        }).sort((a, b) => a.feature_index - b.feature_index);

        const foundCount = rows.filter((r) => r.found).length;

        return (
          <div key={patent.patent_id} className="border rounded-xl overflow-hidden">
            {/* Patent header */}
            <div className="px-5 py-3.5 bg-primary/5 border-b flex items-center justify-between">
              <div className="flex items-center gap-3">
                <code className="text-xs font-mono font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                  {patent.publication_number}
                </code>
                {patent.title && (
                  <span className="text-sm text-muted-foreground hidden sm:inline">
                    — {patent.title}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  {foundCount} found
                </span>
                <span className="text-muted-foreground">/ {rows.length}</span>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="px-4 py-2.5 text-center font-semibold text-foreground/80 text-xs w-10">
                    #
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-foreground/80 text-xs w-[28%]">
                    Key Feature
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold text-foreground/80 text-xs">
                    Justification from Patent
                  </th>
                  <th className="px-4 py-2.5 text-center font-semibold text-foreground/80 text-xs w-24">
                    Found
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={`${patent.patent_id}-${row.id}`}
                    className={`border-b last:border-0 ${
                      idx % 2 === 1 ? 'bg-muted/10' : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-center text-xs text-muted-foreground font-mono">
                      {row.feature_index}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground leading-relaxed align-top">
                      {row.feature_description}
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <EditableJustification
                        row={row}
                        reportId={reportId}
                        onUpdate={onUpdate}
                      />
                    </td>
                    <td
                      className="px-4 py-3 text-center align-top pt-4 cursor-pointer select-none transition-opacity hover:opacity-80"
                      onClick={() => {
                        if (reportId && row.id > 0) {
                          api.reports.updateClaimChart(reportId, row.id, row.justification, !row.found).catch(console.error);
                        }
                        onUpdate(row.id, row.justification, !row.found);
                      }}
                      title="Click to toggle Yes/No status"
                    >
                      {row.found ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800/50 shadow-sm">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-2.5 py-1 rounded-full border border-red-200 dark:border-red-800/50 shadow-sm">
                          <XCircle className="w-3.5 h-3.5" />
                          No
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
