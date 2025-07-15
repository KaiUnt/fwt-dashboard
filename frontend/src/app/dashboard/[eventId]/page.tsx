import { DashboardPage } from '@/components/DashboardPage';

interface PageProps {
  params: Promise<{ eventId: string }>;
}

export default async function EventDashboard({ params }: PageProps) {
  const { eventId } = await params;
  
  return <DashboardPage eventId={eventId} />;
} 