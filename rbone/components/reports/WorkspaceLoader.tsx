import { Loader2 } from 'lucide-react';

interface Props {
  status: 'pending' | 'running';
  logs?: string[];
}

export default function WorkspaceLoader({ status, logs = [] }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
      <h2 className="text-lg font-semibold mb-1.5">
        {status === 'pending' ? 'Queued for Processing' : 'AI Pipeline Running…'}
      </h2>
      <p className="text-sm text-muted-foreground mb-8 max-w-sm text-center">
        {status === 'pending'
          ? 'The analysis pipeline will start shortly. This page auto-refreshes.'
          : 'The AI is analyzing your invention features against each patent. This may take a few minutes.'}
      </p>

      {logs.length > 0 && (
        <div className="w-full max-w-2xl rounded-xl border bg-muted/30 overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-muted/50">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Pipeline Logs
            </span>
          </div>
          <div className="p-4 space-y-1 max-h-64 overflow-y-auto font-mono text-xs text-muted-foreground">
            {logs.map((log, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-foreground/30 select-none">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{log}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
