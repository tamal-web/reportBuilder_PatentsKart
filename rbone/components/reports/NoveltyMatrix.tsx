'use client';

import { useState, useCallback } from 'react';
import { api, KeyFeatureOut, MatrixEntryOut, PatentInputOut } from '@/lib/api';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface Props {
  keyFeatures: KeyFeatureOut[];
  matrix: MatrixEntryOut[];
  patents?: PatentInputOut[];
  reportId?: string;
  onUpdate?: (rowId: number, featureIndex: number, found: boolean) => void;
}

export default function NoveltyMatrix({
  keyFeatures,
  matrix,
  patents = [],
  reportId,
  onUpdate,
}: Props) {
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const displayFeatures: KeyFeatureOut[] =
    keyFeatures && keyFeatures.length > 0
      ? keyFeatures
      : [{ id: -1, index: 1, description: 'No features defined yet' }];

  const displayMatrix: MatrixEntryOut[] =
    matrix && matrix.length > 0
      ? matrix
      : patents && patents.length > 0
      ? patents.map((p, idx) => ({
          id: -idx - 1,
          patent_id: p.patent_id,
          patent_title: p.title,
          publication_number: p.publication_number,
          feature_results: {},
        }))
      : [
          {
            id: -1,
            patent_id: 'p1',
            patent_title: 'No patents loaded yet',
            publication_number: 'N/A',
            feature_results: {},
          },
        ];

  const handleCellClick = useCallback(
    async (m: MatrixEntryOut, featureIdx: number, newFound: boolean) => {
      const cellKey = `${m.id}-${featureIdx}`;
      setSavingCell(cellKey);
      try {
        if (reportId && m.id > 0) {
          await api.reports.updateMatrix(reportId, m.id, featureIdx, newFound);
        }
        onUpdate?.(m.id, featureIdx, newFound);
      } catch (e) {
        console.error('Failed to update novelty matrix cell:', e);
      } finally {
        setSavingCell(null);
      }
    },
    [reportId, onUpdate]
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Novelty Matrix</h2>
        <p className="text-sm text-muted-foreground">
          Feature-vs-patent disclosure grid derived from claim chart analysis. Click any cell to manually toggle Yes/No.
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="border rounded-xl overflow-hidden min-w-fit">
          <table className="text-sm">
            <thead>
              <tr className="bg-muted/60 border-b">
                <th className="px-5 py-4 text-left font-semibold text-foreground min-w-[260px] sticky left-0 bg-muted/60 border-r border-border/50">
                  Key Feature
                </th>
                {displayMatrix.map((m) => (
                  <th
                    key={m.patent_id}
                    className="px-4 py-4 text-center font-semibold text-foreground min-w-[130px]"
                  >
                    <code className="text-xs font-mono text-primary block">
                      {m.publication_number}
                    </code>
                    <span className="text-[11px] font-normal text-muted-foreground block mt-0.5 max-w-[110px] mx-auto truncate">
                      {m.patent_title || '—'}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayFeatures.map((feature, idx) => (
                <tr
                  key={feature.id}
                  className={`border-b last:border-0 ${
                    idx % 2 === 1 ? 'bg-muted/15' : ''
                  }`}
                >
                  <td
                    className={`px-5 py-3.5 text-xs leading-relaxed sticky left-0 border-r border-border/50 ${
                      idx % 2 === 1 ? 'bg-muted/15' : 'bg-background'
                    }`}
                  >
                    <span className="font-semibold text-foreground mr-1.5">
                      F{feature.index}.
                    </span>
                    <span className="text-muted-foreground">
                      {feature.description}
                    </span>
                  </td>
                  {displayMatrix.map((m) => {
                    const found =
                      m.feature_results[String(feature.index)] ?? false;
                    const cellKey = `${m.id}-${feature.index}`;
                    const isSaving = savingCell === cellKey;

                    return (
                      <td
                        key={m.patent_id}
                        onClick={() => handleCellClick(m, feature.index, !found)}
                        className={`px-4 py-3.5 text-center cursor-pointer transition-all hover:ring-2 hover:ring-primary/40 select-none ${
                          found
                            ? 'bg-emerald-50/60 dark:bg-emerald-950/20'
                            : 'bg-red-50/60 dark:bg-red-950/20'
                        }`}
                        title="Click to manually toggle disclosure status"
                      >
                        {isSaving ? (
                          <div className="inline-flex flex-col items-center justify-center py-1">
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : found ? (
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shadow-sm">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            </span>
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                              Yes
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span className="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center shadow-sm">
                              <XCircle className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                            </span>
                            <span className="text-[10px] font-bold text-red-500 dark:text-red-400">
                              No
                            </span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
            <CheckCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          </span>
          Feature disclosed in this patent
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
            <XCircle className="w-3 h-3 text-red-500 dark:text-red-400" />
          </span>
          Feature not found in this patent
        </div>
        <div className="text-xs text-primary/80 italic ml-auto">
          💡 Click on any cell to manually override Yes/No status.
        </div>
      </div>
    </div>
  );
}
