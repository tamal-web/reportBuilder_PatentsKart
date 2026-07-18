import { redirect } from 'next/navigation';

// History is now shown on the dashboard with all reports listed
export default function HistoryPage() {
  redirect('/dashboard');
}
