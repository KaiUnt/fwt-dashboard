export interface SeriesInfo {
  id: string;
  name: string;
  year?: number;
  category: 'Pro Tour' | 'Challenger' | 'Qualifier' | 'Junior' | 'Other';
}

export interface SeriesListResponse {
  series: SeriesInfo[];
  total: number;
  categories: string[];
  years: number[];
  message: string;
}

export interface SeriesRanking {
  athlete: {
    id: string;
    name: string;
    nationality?: string;
    dob?: string;
    image?: string;
  };
  place?: number;
  points?: number;
  results: SeriesResult[];
}

export interface SeriesResult {
  place?: number;
  points?: number;
  eventDivision: {
    event: {
      name: string;
      date: string;
    };
  };
}

export interface SeriesRankingsResponse {
  series_id: string;
  series_name: string;
  divisions: Record<string, SeriesRanking[]>;
  total_athletes: number;
  message: string;
}