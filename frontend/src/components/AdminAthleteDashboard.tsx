'use client';

import { useState } from 'react';
import { AthleteSearchBar } from './AthleteSearchBar';
import { AthleteCard } from './AthleteCard';
import { AthleteSeriesRankings } from './AthleteSeriesRankings';
import { PerformanceCurve } from './PerformanceCurve';
import { AthleteEventHistory } from './AthleteEventHistory';
import { useAdminAthleteSeriesRankings } from '@/hooks/useAdminAthleteSeriesRankings';
import { useAthleteResults } from '@/hooks/useAthleteResults';
import { useBatchCommentatorInfo } from '@/hooks/useCommentatorInfo';
import { useAdminSeedAthletes } from '@/hooks/useAdminSeedAthletes';
import { Loader2, Database, CheckCircle, XCircle } from 'lucide-react';

export function AdminAthleteDashboard() {
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
  const [selectedAthleteName, setSelectedAthleteName] = useState<string>('');

  // Seed mutation
  const seedMutation = useAdminSeedAthletes();

  // Build athletes array for batch fetch
  const athletesForBatch = selectedAthleteId ? [{
    id: selectedAthleteId,
    name: selectedAthleteName,
    status: 'confirmed' as const,
  }] : [];

  // Data hooks - only fetch when athlete is selected
  const { data: seriesRankings, isLoading: seriesLoading } = useAdminAthleteSeriesRankings(selectedAthleteId);
  const { data: athleteResults, isLoading: resultsLoading } = useAthleteResults(selectedAthleteId || '');
  const { data: commentatorData, isLoading: commentatorLoading } = useBatchCommentatorInfo(`admin_${selectedAthleteId}`, athletesForBatch);

  const handleSelectAthlete = (athleteId: string, athleteName: string) => {
    setSelectedAthleteId(athleteId);
    setSelectedAthleteName(athleteName);
  };

  const handleSeedDatabase = async () => {
    try {
      await seedMutation.mutateAsync();
    } catch (error) {
      console.error('Seed failed:', error);
    }
  };

  const isLoading = seriesLoading || resultsLoading || commentatorLoading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Athlete Dashboard</h1>
          <p className="text-gray-600">Search and view detailed athlete information</p>
        </div>

        {/* Seed Database Section */}
        <div className="mb-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center">
                <Database className="h-5 w-5 mr-2 text-blue-600" />
                Database Management
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Initialize or update the athlete database with data from 2023, 2024, and 2025 FWT series.
              </p>

              {seedMutation.isSuccess && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-600 mr-2 mt-0.5" />
                  <div className="text-sm text-green-800">
                    <p className="font-medium">Seed successful!</p>
                    <p>Total: {seedMutation.data?.total_athletes} athletes</p>
                    <p>Inserted: {seedMutation.data?.inserted} | Updated: {seedMutation.data?.updated}</p>
                    <p>Series processed: {seedMutation.data?.series_processed}</p>
                  </div>
                </div>
              )}

              {seedMutation.isError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start">
                  <XCircle className="h-5 w-5 text-red-600 mr-2 mt-0.5" />
                  <div className="text-sm text-red-800">
                    <p className="font-medium">Seed failed</p>
                    <p>{seedMutation.error instanceof Error ? seedMutation.error.message : 'Unknown error'}</p>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleSeedDatabase}
              disabled={seedMutation.isPending}
              className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center ${
                seedMutation.isPending
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {seedMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Seeding...
                </>
              ) : (
                <>
                  <Database className="h-4 w-4 mr-2" />
                  Seed Database
                </>
              )}
            </button>
          </div>
        </div>

        {/* Search Section */}
        <div className="mb-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Search Athlete</h2>
          <AthleteSearchBar onSelectAthlete={handleSelectAthlete} />
        </div>

        {/* Athlete Data Section */}
        {selectedAthleteId && (
          <div className="space-y-6">
            {/* Selected Athlete Header */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h2 className="text-xl font-bold text-blue-900">
                {selectedAthleteName}
              </h2>
              <p className="text-sm text-blue-700">ID: {selectedAthleteId}</p>
            </div>

            {isLoading ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                <Loader2 className="h-12 w-12 mx-auto mb-4 text-blue-600 animate-spin" />
                <p className="text-gray-600">Loading athlete data...</p>
              </div>
            ) : (
              <>
                {/* Athlete Card */}
                {athleteResults && (
                  <AthleteCard
                    athlete={{
                      id: selectedAthleteId,
                      name: selectedAthleteName,
                      bib: undefined,
                      status: 'confirmed',
                      division: ''
                    }}
                    eventInfo={{
                      id: '',
                      name: 'Admin View',
                      date: '',
                      status: 'active'
                    }}
                    athletes={[]}
                    commentatorInfo={commentatorData?.[selectedAthleteId] || []}
                    commentatorBatchKey={`admin_${selectedAthleteId}`}
                  />
                )}

                {/* Event History */}
                <AthleteEventHistory
                  athleteId={selectedAthleteId}
                  eventId=""
                />

                {/* Series Rankings & Performance */}
                {seriesRankings && seriesRankings.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <PerformanceCurve
                      athleteId={selectedAthleteId}
                      athleteName={selectedAthleteName}
                      seriesData={seriesRankings}
                    />
                    <div>
                      <AthleteSeriesRankings
                        athleteId={selectedAthleteId}
                        athleteName={selectedAthleteName}
                        seriesData={seriesRankings}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Empty State */}
        {!selectedAthleteId && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <div className="text-gray-400 mb-4">
              <Database className="h-16 w-16 mx-auto mb-2" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Athlete Selected</h3>
            <p className="text-gray-600">Use the search bar above to find and select an athlete</p>
          </div>
        )}
      </div>
    </div>
  );
}
