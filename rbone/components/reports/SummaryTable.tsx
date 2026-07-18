'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { api, SummaryRowOut, PatentInputOut } from '@/lib/api';
import { CheckCircle, Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

interface EditableRelevanceNoteProps {
  row: SummaryRowOut;
  reportId?: string;
  onUpdate?: (rowId: number, patch: { title?: string; owner?: string; relevance_note?: string }) => void;
}

function EditableRelevanceNote({
  row,
  reportId,
  onUpdate,
}: EditableRelevanceNoteProps) {
  const [value, setValue] = useState(row.relevance_note || '');
  const [saving, setSaving] = useState(false);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const originalRef = useRef(row.relevance_note || '');

  useEffect(() => {
    setValue(row.relevance_note || '');
    originalRef.current = row.relevance_note || '';
  }, [row.relevance_note]);

  const handleBlur = useCallback(async () => {
    if (value === originalRef.current) return;
    setSaving(true);
    try {
      if (reportId && row.id > 0) {
        await api.reports.updateSummaryTable(reportId, row.id, { relevance_note: value });
      }
      originalRef.current = value;
      onUpdate?.(row.id, { relevance_note: value });
      setSavedIndicator(true);
      setTimeout(() => setSavedIndicator(false), 2000);
    } catch (e) {
      console.error('Failed to save relevance note:', e);
      setValue(originalRef.current);
    } finally {
      setSaving(false);
    }
  }, [value, reportId, row.id, onUpdate]);

  return (
    <div className="relative group/cell">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        id={`relevance-note-${row.id}`}
        className="text-xs leading-relaxed resize-none min-h-[56px] border-transparent bg-transparent hover:border-border/60 focus:border-border transition-colors pr-7 shadow-none rounded-md"
        placeholder="Enter relevance note manually..."
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
  rows: SummaryRowOut[];
  patents?: PatentInputOut[];
  reportId?: string;
  onUpdate?: (rowId: number, patch: { title?: string; owner?: string; relevance_note?: string }) => void;
}

export default function SummaryTable({ rows, patents = [], reportId, onUpdate }: Props) {
  const displayRows: SummaryRowOut[] =
    rows && rows.length > 0
      ? rows
      : patents && patents.length > 0
      ? patents.map((p, idx) => ({
          id: -idx - 1,
          patent_id: p.patent_id,
          title: p.title,
          publication_number: p.publication_number,
          owner: p.owner,
          relevance_note: '',
        }))
      : [
          {
            id: -1,
            patent_id: 'p1',
            title: 'No patents loaded yet',
            publication_number: 'N/A',
            owner: '—',
            relevance_note: '',
          },
        ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Summary Table</h2>
        <p className="text-sm text-muted-foreground">
          Bibliographic overview of evaluated prior-art patents
        </p>
      </div>
      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/60 border-b">
              <th className="px-5 py-3.5 text-left font-semibold text-foreground w-[30%]">
                Patent Title
              </th>
              <th className="px-5 py-3.5 text-left font-semibold text-foreground w-[18%]">
                Publication Number
              </th>
              <th className="px-5 py-3.5 text-left font-semibold text-foreground w-[17%]">
                Owner / Assignee
              </th>
              <th className="px-5 py-3.5 text-left font-semibold text-foreground w-[35%]">
                Relevance Note
              </th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, idx) => (
              <tr
                key={`${row.patent_id}-${row.id}`}
                className={`border-b last:border-0 ${
                  idx % 2 === 1 ? 'bg-muted/20' : ''
                }`}
              >
                <td className="px-5 py-4 font-medium text-foreground leading-snug">
                  {row.title || '—'}
                </td>
                <td className="px-5 py-4">
                  <code className="text-xs bg-muted px-2 py-1 rounded-md font-mono">
                    {row.publication_number}
                  </code>
                </td>
                <td className="px-5 py-4 text-muted-foreground text-xs">
                  {row.owner || '—'}
                </td>
                <td className="px-3 py-2 text-muted-foreground text-xs leading-relaxed">
                  <EditableRelevanceNote
                    row={row}
                    reportId={reportId}
                    onUpdate={onUpdate}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
