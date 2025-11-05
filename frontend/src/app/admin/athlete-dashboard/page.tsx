'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AdminAthleteDashboard } from '@/components/AdminAthleteDashboard';
import { useAuth } from '@/providers/AuthProvider';

export default function AdminAthleteDashboardPage() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();

  // Check if user is admin
  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/');
    }
  }, [user, loading, isAdmin, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  return <AdminAthleteDashboard />;
}
