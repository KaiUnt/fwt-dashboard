import { jsPDF } from 'jspdf';
import { Athlete, CommentatorInfoWithAuthor, EventInfo } from '@/types/athletes';
import {
  SeriesData,
  getAllEventsChronologically,
  getAthleteSeriesOverview,
  isMainSeasonRanking,
  SeriesCategoryType,
  SERIES_CATEGORY_COLORS
} from '@/hooks/useSeriesRankings';

// Helper to calculate age from DOB
function calculateAge(dob: string): number | null {
  if (!dob) return null;
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

// Helper to get nationality flag emoji
function getNationalityDisplay(nationality?: string): string {
  if (!nationality) return '';
  // Return country code in brackets
  return `(${nationality.toUpperCase()})`;
}

// Helper to format date
function formatDate(dateString?: string): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateString;
  }
}

// Helper to get category display name
function getCategoryDisplayName(category: SeriesCategoryType): string {
  return SERIES_CATEGORY_COLORS[category]?.name || category;
}

// Helper to get trend arrow
function getTrendArrow(rankings: { year: number; place: number }[]): string {
  if (rankings.length < 2) return '';
  const sorted = [...rankings].sort((a, b) => a.year - b.year);
  const oldest = sorted[0].place;
  const newest = sorted[sorted.length - 1].place;

  if (newest < oldest) return '↗'; // Improved (lower rank number is better)
  if (newest > oldest) return '↘'; // Declined
  return '→'; // Stable
}

interface PDFGeneratorOptions {
  athletes: Athlete[];
  eventInfo: EventInfo | EventInfo[];
  seriesRankings?: SeriesData[];
  commentatorInfo?: Record<string, CommentatorInfoWithAuthor[]>;
  sortBy: 'bib' | 'name';
}

export async function generateEventPDF(options: PDFGeneratorOptions): Promise<void> {
  const { athletes, eventInfo, seriesRankings, commentatorInfo, sortBy } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);

  // Get event name(s)
  const events = Array.isArray(eventInfo) ? eventInfo : [eventInfo];
  const eventNames = events.map(e => e.name).join(' / ');
  const eventDate = events[0]?.date ? formatDate(events[0].date) : '';

  // Sort athletes
  const sortedAthletes = [...athletes].sort((a, b) => {
    if (sortBy === 'bib') {
      // Sort by BIB if available, otherwise by name
      const aBib = a.bib ? parseInt(a.bib, 10) : Infinity;
      const bBib = b.bib ? parseInt(b.bib, 10) : Infinity;
      if (aBib !== bBib) return aBib - bBib;
    }
    return a.name.localeCompare(b.name);
  });

  // Generate pages for each athlete
  for (let i = 0; i < sortedAthletes.length; i++) {
    const athlete = sortedAthletes[i];

    if (i > 0) {
      doc.addPage();
    }

    let y = margin;

    // ===== HEADER =====
    doc.setFillColor(30, 64, 175); // Blue header
    doc.rect(0, 0, pageWidth, 35, 'F');

    // Event info
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text(`FWT Commentator Cheatsheet`, margin, 8);
    doc.setFontSize(8);
    doc.text(`${eventNames} | ${eventDate}`, margin, 14);
    doc.text(`Stand: ${new Date().toLocaleDateString('de-DE')} ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`, margin, 20);

    // Athlete name in header
    const bibDisplay = athlete.bib ? `#${athlete.bib}` : '';
    const nationalityDisplay = getNationalityDisplay(athlete.nationality);
    const headerName = `${bibDisplay} ${athlete.name} ${nationalityDisplay}`.trim();

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(headerName, margin, 30);

    y = 42;

    // Division and Age
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const age = athlete.dob ? calculateAge(athlete.dob) : null;
    const divisionAge = [
      athlete.division || '',
      age ? `${age} Jahre` : ''
    ].filter(Boolean).join(' | ');
    doc.text(divisionAge, margin, y);
    y += 8;

    // Get commentator info for this athlete
    const athleteCommentatorInfo = commentatorInfo?.[athlete.id]?.[0];

    // ===== BASICS SECTION =====
    y = drawSectionHeader(doc, 'BASICS', margin, y, contentWidth);

    const basics: string[] = [];
    if (athleteCommentatorInfo?.homebase) basics.push(`Homebase: ${athleteCommentatorInfo.homebase}`);
    if (athleteCommentatorInfo?.team) basics.push(`Team: ${athleteCommentatorInfo.team}`);
    if (athleteCommentatorInfo?.sponsors) basics.push(`Sponsors: ${athleteCommentatorInfo.sponsors}`);

    if (basics.length > 0) {
      doc.setFontSize(9);
      for (const line of basics) {
        const lines = doc.splitTextToSize(line, contentWidth);
        doc.text(lines, margin, y);
        y += lines.length * 4 + 2;
      }
    } else {
      doc.setFontSize(9);
      doc.setTextColor(128, 128, 128);
      doc.text('Keine Informationen verfügbar', margin, y);
      doc.setTextColor(0, 0, 0);
      y += 6;
    }
    y += 4;

    // ===== CURRENT RANKINGS SECTION =====
    y = drawSectionHeader(doc, 'CURRENT RANKINGS', margin, y, contentWidth);

    if (seriesRankings && seriesRankings.length > 0) {
      const overview = getAthleteSeriesOverview(seriesRankings, athlete.id);

      if (overview && overview.currentSeries.length > 0) {
        const currentYear = new Date().getFullYear();
        const previousYear = currentYear - 1;

        // Current year rankings
        const currentYearRankings = overview.currentSeries.filter(s =>
          s.year === currentYear && isMainSeasonRanking(s.series.series_name)
        );

        // Previous year rankings
        const previousYearRankings = overview.currentSeries.filter(s =>
          s.year === previousYear && isMainSeasonRanking(s.series.series_name)
        );

        doc.setFontSize(9);

        if (currentYearRankings.length > 0) {
          doc.setFont('helvetica', 'bold');
          doc.text(`${currentYear}:`, margin, y);
          doc.setFont('helvetica', 'normal');
          y += 5;

          for (const ranking of currentYearRankings) {
            const category = getCategoryDisplayName(ranking.category);
            const place = ranking.ranking.place ? `#${ranking.ranking.place}` : '-';
            const points = ranking.ranking.points ? `(${ranking.ranking.points} pts)` : '';
            doc.text(`  ${category}: ${place} ${points}`, margin, y);
            y += 4;
          }
          y += 2;
        }

        if (previousYearRankings.length > 0) {
          doc.setFont('helvetica', 'bold');
          doc.text(`Vorjahr ${previousYear}:`, margin, y);
          doc.setFont('helvetica', 'normal');
          y += 5;

          for (const ranking of previousYearRankings) {
            const category = getCategoryDisplayName(ranking.category);
            const place = ranking.ranking.place ? `#${ranking.ranking.place}` : '-';
            const points = ranking.ranking.points ? `(${ranking.ranking.points} pts)` : '';
            doc.text(`  ${category}: ${place} ${points}`, margin, y);
            y += 4;
          }
        }
      } else {
        doc.setFontSize(9);
        doc.setTextColor(128, 128, 128);
        doc.text('Keine Rankings verfügbar', margin, y);
        doc.setTextColor(0, 0, 0);
        y += 6;
      }
    } else {
      doc.setFontSize(9);
      doc.setTextColor(128, 128, 128);
      doc.text('Keine Rankings verfügbar', margin, y);
      doc.setTextColor(0, 0, 0);
      y += 6;
    }
    y += 4;

    // ===== HIGHLIGHT RESULTS SECTION =====
    y = drawSectionHeader(doc, 'HIGHLIGHT RESULTS (Top 3)', margin, y, contentWidth);

    if (seriesRankings && seriesRankings.length > 0) {
      const allEvents = getAllEventsChronologically(seriesRankings, athlete.id);
      const top3 = allEvents
        .filter(e => e.place && e.place <= 20)
        .sort((a, b) => (a.place || 999) - (b.place || 999))
        .slice(0, 3);

      doc.setFontSize(9);

      if (top3.length > 0) {
        const medals = ['1.', '2.', '3.'];
        for (let j = 0; j < top3.length; j++) {
          const event = top3[j];
          const medal = medals[j] || `${j + 1}.`;
          const category = event.rawResult.seriesInfo?.seriesCategory
            ? getCategoryDisplayName(event.rawResult.seriesInfo.seriesCategory as SeriesCategoryType)
            : '';
          const points = event.points ? `(${event.points} pts)` : '';
          const line = `${medal} #${event.place} - ${event.eventName} ${category} ${points}`;
          const lines = doc.splitTextToSize(line, contentWidth);
          doc.text(lines, margin, y);
          y += lines.length * 4 + 1;
        }
      } else {
        doc.setTextColor(128, 128, 128);
        doc.text('Keine Highlight-Ergebnisse', margin, y);
        doc.setTextColor(0, 0, 0);
        y += 6;
      }
    } else {
      doc.setFontSize(9);
      doc.setTextColor(128, 128, 128);
      doc.text('Keine Ergebnisse verfügbar', margin, y);
      doc.setTextColor(0, 0, 0);
      y += 6;
    }
    y += 4;

    // ===== PERFORMANCE CURVE SECTION =====
    y = drawSectionHeader(doc, 'PERFORMANCE CURVE', margin, y, contentWidth);

    if (seriesRankings && seriesRankings.length > 0) {
      const overview = getAthleteSeriesOverview(seriesRankings, athlete.id);

      if (overview) {
        // Build performance table data
        const yearlyPerformance = new Map<number, Map<SeriesCategoryType, number>>();

        for (const series of [...overview.currentSeries, ...overview.historicalSeries]) {
          if (!isMainSeasonRanking(series.series.series_name)) continue;
          if (!series.ranking.place) continue;

          if (!yearlyPerformance.has(series.year)) {
            yearlyPerformance.set(series.year, new Map());
          }

          const yearMap = yearlyPerformance.get(series.year)!;
          const existing = yearMap.get(series.category);
          if (!existing || series.ranking.place < existing) {
            yearMap.set(series.category, series.ranking.place);
          }
        }

        if (yearlyPerformance.size > 0) {
          // Get all categories that have data
          const allCategories = new Set<SeriesCategoryType>();
          yearlyPerformance.forEach(yearMap => {
            yearMap.forEach((_, cat) => allCategories.add(cat));
          });

          const categories = Array.from(allCategories).sort((a, b) => {
            const order: SeriesCategoryType[] = ['pro', 'challenger', 'junior_wc', 'qualifier', 'junior', 'other'];
            return order.indexOf(a) - order.indexOf(b);
          });

          const years = Array.from(yearlyPerformance.keys()).sort((a, b) => a - b);

          // Draw table header
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');

          const colWidth = contentWidth / (categories.length + 1);
          doc.text('Jahr', margin, y);
          categories.forEach((cat, idx) => {
            doc.text(getCategoryDisplayName(cat), margin + colWidth * (idx + 1), y);
          });
          y += 5;

          // Draw separator line
          doc.setDrawColor(200, 200, 200);
          doc.line(margin, y - 2, margin + contentWidth, y - 2);

          // Draw table rows
          doc.setFont('helvetica', 'normal');
          for (const year of years) {
            const yearMap = yearlyPerformance.get(year)!;
            doc.text(year.toString(), margin, y);

            categories.forEach((cat, idx) => {
              const place = yearMap.get(cat);
              doc.text(place ? `#${place}` : '-', margin + colWidth * (idx + 1), y);
            });
            y += 4;
          }

          // Draw trend
          const proRankings = years
            .map(yr => ({ year: yr, place: yearlyPerformance.get(yr)?.get('pro') }))
            .filter(r => r.place !== undefined) as { year: number; place: number }[];

          const trend = getTrendArrow(proRankings);
          if (trend) {
            y += 2;
            doc.setFont('helvetica', 'bold');
            doc.text(`Trend: ${trend}`, margin, y);
            doc.setFont('helvetica', 'normal');
            y += 4;
          }
        } else {
          doc.setFontSize(9);
          doc.setTextColor(128, 128, 128);
          doc.text('Keine Performance-Daten verfügbar', margin, y);
          doc.setTextColor(0, 0, 0);
          y += 6;
        }
      }
    } else {
      doc.setFontSize(9);
      doc.setTextColor(128, 128, 128);
      doc.text('Keine Performance-Daten verfügbar', margin, y);
      doc.setTextColor(0, 0, 0);
      y += 6;
    }
    y += 4;

    // ===== LAST 10 RESULTS SECTION =====
    y = drawSectionHeader(doc, 'LETZTE 10 ERGEBNISSE', margin, y, contentWidth);

    if (seriesRankings && seriesRankings.length > 0) {
      const allEvents = getAllEventsChronologically(seriesRankings, athlete.id);
      const last10 = allEvents.slice(0, 10);

      doc.setFontSize(8);

      if (last10.length > 0) {
        for (let j = 0; j < last10.length; j++) {
          // Check if we need a new page
          if (y > pageHeight - 30) {
            doc.addPage();
            y = margin;
            // Re-add header for continuation
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            doc.text(`${athlete.name} - Fortsetzung`, margin, y);
            doc.setTextColor(0, 0, 0);
            y += 8;
          }

          const event = last10[j];
          const category = event.rawResult.seriesInfo?.seriesCategory
            ? getCategoryDisplayName(event.rawResult.seriesInfo.seriesCategory as SeriesCategoryType)
            : '';
          const place = event.place ? `#${event.place}` : '-';
          const points = event.points ? `(${event.points} pts)` : '';

          const line = `${j + 1}. ${event.eventName}`;
          const details = `   ${category} | ${place} ${points}`;

          const lines1 = doc.splitTextToSize(line, contentWidth);
          doc.text(lines1, margin, y);
          y += lines1.length * 3;

          doc.setTextColor(100, 100, 100);
          doc.text(details, margin, y);
          doc.setTextColor(0, 0, 0);
          y += 5;
        }
      } else {
        doc.setTextColor(128, 128, 128);
        doc.text('Keine Ergebnisse verfügbar', margin, y);
        doc.setTextColor(0, 0, 0);
        y += 6;
      }
    } else {
      doc.setFontSize(9);
      doc.setTextColor(128, 128, 128);
      doc.text('Keine Ergebnisse verfügbar', margin, y);
      doc.setTextColor(0, 0, 0);
      y += 6;
    }
    y += 4;

    // ===== STORYTELLING SECTION =====
    // Check if we need a new page
    if (y > pageHeight - 50) {
      doc.addPage();
      y = margin;
    }

    y = drawSectionHeader(doc, 'STORYTELLING / NOTIZEN', margin, y, contentWidth);

    doc.setFontSize(9);

    const storytellingItems: { label: string; value: string }[] = [];

    if (athleteCommentatorInfo?.achievements) {
      storytellingItems.push({ label: 'Achievements', value: athleteCommentatorInfo.achievements });
    }
    if (athleteCommentatorInfo?.favorite_trick) {
      storytellingItems.push({ label: 'Favorite Trick', value: athleteCommentatorInfo.favorite_trick });
    }
    if (athleteCommentatorInfo?.fun_facts) {
      storytellingItems.push({ label: 'Fun Facts', value: athleteCommentatorInfo.fun_facts });
    }
    if (athleteCommentatorInfo?.injuries) {
      storytellingItems.push({ label: 'Injuries', value: athleteCommentatorInfo.injuries });
    }
    if (athleteCommentatorInfo?.notes) {
      storytellingItems.push({ label: 'Notes', value: athleteCommentatorInfo.notes });
    }

    if (storytellingItems.length > 0) {
      for (const item of storytellingItems) {
        // Check if we need a new page
        if (y > pageHeight - 20) {
          doc.addPage();
          y = margin;
        }

        doc.setFont('helvetica', 'bold');
        doc.text(`${item.label}:`, margin, y);
        doc.setFont('helvetica', 'normal');
        y += 4;

        const lines = doc.splitTextToSize(item.value, contentWidth);
        doc.text(lines, margin, y);
        y += lines.length * 4 + 3;
      }
    } else {
      doc.setTextColor(128, 128, 128);
      doc.text('Keine Storytelling-Informationen verfügbar', margin, y);
      doc.setTextColor(0, 0, 0);
    }

    // Footer with page number
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Athlet ${i + 1} von ${sortedAthletes.length}`, pageWidth - margin - 30, pageHeight - 10);
  }

  // Generate filename
  const eventSlug = events[0]?.name?.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30) || 'event';
  const dateSlug = new Date().toISOString().split('T')[0];
  const filename = `FWT_Cheatsheet_${eventSlug}_${dateSlug}.pdf`;

  // Save the PDF
  doc.save(filename);
}

// Helper function to draw section headers
function drawSectionHeader(doc: jsPDF, title: string, x: number, y: number, width: number): number {
  doc.setFillColor(240, 240, 240);
  doc.rect(x, y - 4, width, 7, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(60, 60, 60);
  doc.text(title, x + 2, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');

  return y + 6;
}
