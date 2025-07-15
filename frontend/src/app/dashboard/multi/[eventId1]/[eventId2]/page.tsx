import { MultiEventDashboard } from '@/components/MultiEventDashboard';

interface PageProps {
  params: Promise<{ eventId1: string; eventId2: string }>;
}

export default async function MultiEventDashboardPage({ params }: PageProps) {
  const { eventId1, eventId2 } = await params;
  
  return <MultiEventDashboard eventId1={eventId1} eventId2={eventId2} />;
} 