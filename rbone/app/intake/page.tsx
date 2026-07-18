import type { Metadata } from 'next';
import IntakeForm from '@/components/IntakeForm';

export const metadata: Metadata = {
  title: 'New Report — Prior-Art Report Builder',
  description:
    'Start a new prior-art search analysis by entering invention features and patent documents.',
};

export default function IntakePage() {
  return (
    <div className="min-h-full bg-background">
      <IntakeForm />
    </div>
  );
}
