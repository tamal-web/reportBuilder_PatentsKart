// lib/api.ts — Typed API client for the Prior-Art Report Builder backend

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface PatentInput {
  publication_number: string;
  title?: string;
  content: string;
  owner?: string;
}

export interface CreateReportRequest {
  title: string;
  invention_summary?: string;
  key_features: string[];
  patents: PatentInput[];
}

export interface ReportListItem {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  created_at: string;
  patent_count: number;
  feature_count: number;
}

export interface KeyFeatureOut {
  id: number;
  index: number;
  description: string;
}

export interface PatentInputOut {
  id: number;
  patent_id: string;
  publication_number: string;
  title: string;
  owner: string;
}

export interface SummaryRowOut {
  id: number;
  patent_id: string;
  title: string;
  publication_number: string;
  owner: string;
  relevance_note: string;
}

export interface ClaimChartRowOut {
  id: number;
  patent_id: string;
  patent_pub_number: string;
  feature_index: number;
  feature_description: string;
  justification: string;
  found: boolean;
}

export interface MatrixEntryOut {
  id: number;
  patent_id: string;
  patent_title: string;
  publication_number: string;
  feature_results: Record<string, boolean>;
}

export interface ReportDetail {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  created_at: string;
  invention_summary: string | null;
  error_message: string | null;
  logs: string[];
  key_features: KeyFeatureOut[];
  patents: PatentInputOut[];
  summary_table: SummaryRowOut[];
  claim_charts: Record<string, ClaimChartRowOut[]>;
  matrix: MatrixEntryOut[];
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`API ${init?.method ?? 'GET'} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  reports: {
    create: (body: CreateReportRequest) =>
      fetchJson<{ id: string; status: string }>('/api/reports', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    list: () => fetchJson<ReportListItem[]>('/api/reports'),

    get: (id: string) => fetchJson<ReportDetail>(`/api/reports/${id}`),

    delete: (id: string) =>
      fetchJson<void>(`/api/reports/${id}`, { method: 'DELETE' }),

    updateClaimChart: (
      reportId: string,
      rowId: number,
      justification: string,
      found: boolean,
    ) =>
      fetchJson<ClaimChartRowOut>(
        `/api/reports/${reportId}/claim-chart/${rowId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ justification, found }),
        },
      ),

    updateSummaryTable: (
      reportId: string,
      rowId: number,
      patch: { title?: string; owner?: string; relevance_note?: string },
    ) =>
      fetchJson<SummaryRowOut>(
        `/api/reports/${reportId}/summary-table/${rowId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(patch),
        },
      ),

    updateMatrix: (
      reportId: string,
      rowId: number,
      featureIndex: number,
      found: boolean,
    ) =>
      fetchJson<MatrixEntryOut>(
        `/api/reports/${reportId}/matrix/${rowId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ feature_index: featureIndex, found }),
        },
      ),

    exportUrl: (id: string, template = 'default') =>
      `${API_URL}/api/reports/${id}/export?template=${template}`,
  },
};

