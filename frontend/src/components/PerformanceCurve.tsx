'use client';

import { useState } from 'react';
import { TrendingUp, Medal, Star, Trophy, Target, Zap, ChevronDown, Eye, EyeOff, Award, Crown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { SeriesData, isMainSeasonRanking, categorizeSeriesType, getAllEventsChronologically } from '@/hooks/useSeriesRankings';
import { useTranslation } from '@/hooks/useTranslation';

interface PerformanceCurveProps {
  athleteId: string;
  athleteName: string;
  seriesData: SeriesData[];
  className?: string;
}

interface ChartDataPoint {
  year: number;
  pro?: number;
  challenger?: number;
  qualifier?: number;
  junior?: number;
  [key: string]: number | undefined;
}

interface SeriesVisibility {
  pro: boolean;
  challenger: boolean;
  qualifier: boolean;
  junior: boolean;
}

export function PerformanceCurve({ 
  athleteId, 
  athleteName: _athleteName, 
  seriesData, 
  className = "" 
}: PerformanceCurveProps) {
  const { t } = useTranslation();
  const [seriesVisibility, setSeriesVisibility] = useState<SeriesVisibility>({
    pro: true,
    challenger: true,
    qualifier: true,
    junior: true
  });
  const [showControls, setShowControls] = useState(false);
  const [showEventsByPoints, setShowEventsByPoints] = useState(false);

  // Extract yearly performance data for line chart
  const getChartData = (): ChartDataPoint[] => {
    const yearlyData = new Map<number, ChartDataPoint>();

    for (const series of seriesData) {
      // Only include MAIN series
      if (!isMainSeasonRanking(series.series_name)) continue;

      const year = extractSeriesYear(series.series_name);
      const category = categorizeSeriesType(series.series_name);

      for (const [_divisionName, rankings] of Object.entries(series.divisions)) {
        const ranking = rankings.find(r => r.athlete.id === athleteId);
        if (ranking && ranking.place) {
          if (!yearlyData.has(year)) {
            yearlyData.set(year, { year });
          }

          const dataPoint = yearlyData.get(year)!;
          
          // For multiple series of same category in same year, keep the best (lowest) place
          if (!dataPoint[category] || ranking.place < dataPoint[category]!) {
            dataPoint[category] = ranking.place;
          }
        }
      }
    }

    return Array.from(yearlyData.values())
      .sort((a, b) => a.year - b.year); // Chronological order
  };



  // Helper function to extract year from series name
  const extractSeriesYear = (seriesName: string): number => {
    const match = seriesName.match(/\b(20[0-9]{2})\b/);
    return match ? parseInt(match[1]) : new Date().getFullYear();
  };

  // Get series colors (same as in other components)
  const getSeriesColor = (category: string): string => {
    switch (category) {
      case 'pro': return '#9333ea'; // Purple
      case 'challenger': return '#eab308'; // Yellow
      case 'qualifier': return '#16a34a'; // Green
      case 'junior': return '#2563eb'; // Blue
      default: return '#6b7280'; // Gray
    }
  };

  // Get category color classes (for backgrounds)
  const getCategoryColorClasses = (category: string): string => {
    switch (category) {
      case 'pro': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'challenger': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'qualifier': return 'bg-green-100 text-green-800 border-green-200';
      case 'junior': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Get series icon
  const getSeriesIcon = (category: string) => {
    switch (category) {
      case 'pro': return <Star className="h-4 w-4" />;
      case 'challenger': return <Trophy className="h-4 w-4" />;
      case 'qualifier': return <Target className="h-4 w-4" />;
      case 'junior': return <Zap className="h-4 w-4" />;
      default: return <Medal className="h-4 w-4" />;
    }
  };

  // Custom tooltip for better UX
  interface TooltipPayload {
    value: number;
    dataKey: string;
    color: string;
    name: string;
  }

  const CustomTooltip = ({ active, payload, label }: { 
    active?: boolean; 
    payload?: TooltipPayload[]; 
    label?: string | number; 
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-300 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900">{t('performance.year', { year: label || 'Unknown' })}</p>
          {payload.map((entry: TooltipPayload, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              <span className="font-medium capitalize">{entry.dataKey}:</span> #{entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Toggle series visibility
  const toggleSeriesVisibility = (series: keyof SeriesVisibility) => {
    setSeriesVisibility(prev => ({
      ...prev,
      [series]: !prev[series]
    }));
  };

  const chartData = getChartData();
  const availableSeries = ['pro', 'challenger', 'qualifier', 'junior'].filter(series => 
    chartData.some(point => point[series] !== undefined)
  );

  // Get all events for Top 3 display
  const allEvents = getAllEventsChronologically(seriesData, athleteId);
  
  // Filter out non-main series and bonus points series
  const filteredEvents = allEvents.filter(event => {
    const seriesName = event.rawResult?.seriesInfo?.seriesName || '';
    const eventName = event.eventName || '';
    
    // Only include MAIN series
    if (!isMainSeasonRanking(seriesName)) {
      return false;
    }
    
    // Exclude bonus points by series name or event name
    return !seriesName.includes('FWT Pro 2026 Qualified Riders - Bonus points') && 
           !seriesName.includes('Bonus points') &&
           !eventName.includes('Bonus points');
  });
  
  // Filter and sort for best placements (only meaningful placings)
  const bestByPlace = filteredEvents
    .filter(event => event.place && event.place <= 20) // Only top 20 placings
    .sort((a, b) => a.place! - b.place!) // Best place first
    .slice(0, 3);
    
  // Filter and sort for best points
  const bestByPoints = filteredEvents
    .filter(event => event.points && event.points > 0) // Only events with points
    .sort((a, b) => b.points! - a.points!) // Highest points first
    .slice(0, 3);

  if (chartData.length === 0) {
    return (
      <div className={`bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 ${className}`}>
        <div className="flex items-center space-x-2 mb-2">
          <TrendingUp className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Performance Curve</h3>
        </div>
        <p className="text-sm text-gray-700">{t('performance.noMainSeriesData')}</p>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5 text-gray-600" />
            <h3 className="font-semibold text-gray-900">{t('performance.title')}</h3>
            <span className="text-sm text-gray-500">({chartData.length} Jahre)</span>
          </div>
          
          <button
            onClick={() => setShowControls(!showControls)}
            className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${showControls ? 'rotate-180' : ''}`} />
            <span>{t('performance.series')}</span>
          </button>
        </div>
      </div>

      {/* Series Controls */}
      {showControls && (
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-sm font-medium text-gray-700">{t('performance.visibleSeries')}:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {availableSeries.map((series) => (
              <button
                key={series}
                onClick={() => toggleSeriesVisibility(series as keyof SeriesVisibility)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  seriesVisibility[series as keyof SeriesVisibility]
                    ? 'bg-white border-gray-300 text-gray-900'
                    : 'bg-gray-100 border-gray-200 text-gray-500'
                }`}
              >
                {seriesVisibility[series as keyof SeriesVisibility] ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
                {getSeriesIcon(series)}
                <span className="capitalize">{series}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="p-4">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={200}>
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="year" 
                tick={{ fontSize: 12 }}
                tickLine={{ stroke: '#d1d5db' }}
              />
              <YAxis 
                reversed={true} // Lower ranking is better
                tick={{ fontSize: 12 }}
                tickLine={{ stroke: '#d1d5db' }}
                label={{ value: t('performance.ranking'), angle: -90, position: 'insideLeft' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="line"
              />
              
              {availableSeries.map((series) => (
                seriesVisibility[series as keyof SeriesVisibility] && (
                  <Line
                    key={series}
                    type="monotone"
                    dataKey={series}
                    stroke={getSeriesColor(series)}
                    strokeWidth={3}
                    dot={{ r: 5, strokeWidth: 2 }}
                    activeDot={{ r: 7, strokeWidth: 2 }}
                    connectNulls={false}
                    name={series.charAt(0).toUpperCase() + series.slice(1)}
                  />
                )
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

             {/* Legend with Performance Stats */}
       <div className="px-4 pb-4">
         <div className="grid grid-cols-2 gap-3 mt-4">
           {availableSeries.map((series) => {
             const dataPoints = chartData.filter(point => point[series] !== undefined);
             const bestPlace = dataPoints.length > 0 ? Math.min(...dataPoints.map(p => p[series]!)) : null;
             const bestYear = bestPlace ? dataPoints.find(p => p[series] === bestPlace)?.year : null;
             const latestYear = dataPoints.length > 0 ? Math.max(...dataPoints.map(p => p.year)) : null;
             const latestPlace = latestYear ? chartData.find(p => p.year === latestYear)?.[series] : null;

             return (
               <div key={series} className="flex items-center space-x-2 p-2 bg-gray-50 rounded-lg">
                 <div style={{ color: getSeriesColor(series) }}>
                   {getSeriesIcon(series)}
                 </div>
                 <div className="flex-1 min-w-0">
                   <div className="text-sm font-medium text-gray-900 capitalize">{series}</div>
                   <div className="text-xs text-gray-500">
                     {bestPlace && bestYear && t('performance.bestPlace', { place: bestPlace, year: bestYear })}
                     {latestPlace && latestYear && ` • ${t('performance.currentPlace', { place: latestPlace })}`}
                   </div>
                 </div>
               </div>
             );
           })}
         </div>

         {/* Top 3 Event Results Section */}
         {(bestByPlace.length > 0 || bestByPoints.length > 0) && (
           <div className="mt-6 pt-4 border-t border-gray-200">
             <div className="flex items-center justify-between mb-4">
               <div className="flex items-center space-x-2">
                 <Crown className="h-5 w-5 text-amber-600" />
                 <h4 className="font-semibold text-gray-900">{t('performance.top3Results')}</h4>
               </div>
               
               {/* Toggle Switch */}
               <div className="relative">
                 <button
                   onClick={() => setShowEventsByPoints(!showEventsByPoints)}
                   className="relative flex items-center w-32 h-10 bg-gray-200 rounded-full p-1 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                 >
                   {/* Sliding background */}
                   <div
                     className={`absolute w-16 h-8 rounded-full shadow-md transition-transform duration-300 ${
                       showEventsByPoints 
                         ? 'transform translate-x-14 bg-blue-500' 
                         : 'transform translate-x-0 bg-amber-500'
                     }`}
                   />
                   
                   {/* Left label (Platzierung) */}
                   <div className={`relative flex items-center justify-center w-16 h-8 text-xs font-medium transition-colors duration-300 ${
                     !showEventsByPoints ? 'text-white' : 'text-gray-600'
                   }`}>
                     <Award className="h-3 w-3 mr-1" />
                     <span>{t('performance.place')}</span>
                   </div>
                   
                   {/* Right label (Punkte) */}
                   <div className={`relative flex items-center justify-center w-16 h-8 text-xs font-medium transition-colors duration-300 ${
                     showEventsByPoints ? 'text-white' : 'text-gray-600'
                   }`}>
                     <Star className="h-3 w-3 mr-1" />
                     <span>{t('performance.points')}</span>
                   </div>
                 </button>
               </div>
             </div>

             {/* Event Results Display */}
             <div className="space-y-2">
               {!showEventsByPoints && bestByPlace.map((event, index) => {
                 const seriesCategory = event.rawResult?.seriesInfo?.seriesCategory || 'other';
                 return (
                   <div key={index} className={`flex items-center space-x-3 p-3 rounded-lg border ${getCategoryColorClasses(seriesCategory)}`}>
                     <div className="flex items-center space-x-2">
                       {getSeriesIcon(seriesCategory)}
                       <span className={`w-8 h-8 rounded-full text-sm font-bold flex items-center justify-center text-white ${
                         event.place === 1 ? 'bg-yellow-500' : 
                         event.place === 2 ? 'bg-gray-400' : 
                         event.place === 3 ? 'bg-amber-600' : 'bg-gray-500'
                       }`}>
                         {event.place}
                       </span>
                     </div>
                     <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium leading-tight">
                         {event.eventName}
                       </div>
                       <div className="text-xs opacity-75 capitalize">
                         {seriesCategory}{event.points && ` • ${t('performance.pointsCount', { points: event.points })}`}
                       </div>
                     </div>
                     <div className="text-right">
                       <div className="text-sm font-bold">
                         #{event.place}
                       </div>
                     </div>
                   </div>
                 );
               })}

                               {showEventsByPoints && bestByPoints.map((event, index) => {
                  const seriesCategory = event.rawResult?.seriesInfo?.seriesCategory || 'other';
                  return (
                    <div key={index} className={`flex items-center space-x-3 p-3 rounded-lg border ${getCategoryColorClasses(seriesCategory)}`}>
                      <div className="flex items-center space-x-2">
                        {getSeriesIcon(seriesCategory)}
                        <span className={`w-8 h-8 rounded-full text-sm font-bold flex items-center justify-center text-white ${
                          event.place === 1 ? 'bg-yellow-500' : 
                          event.place === 2 ? 'bg-gray-400' : 
                          event.place === 3 ? 'bg-amber-600' : 'bg-blue-500'
                        }`}>
                          {event.place}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium leading-tight">
                          {event.eventName}
                        </div>
                        <div className="text-xs opacity-75 capitalize">
                          {seriesCategory} • #{event.place}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold">
                          {t('performance.pointsShort', { points: event.points || 0 })}
                        </div>
                      </div>
                    </div>
                  );
                })}
             </div>
           </div>
         )}

       </div>
    </div>
  );
} 
