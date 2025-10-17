'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, User, Calendar, BarChart } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { AppHeader } from '@/components/AppHeader';
import Image from 'next/image';

interface ManualSection {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: React.ReactNode;
  imagePath: string;
  items: { titleKey: string; descriptionKey: string }[];
}

export default function ManualPage() {
  const { t } = useTranslation();
  const [expandedSections, setExpandedSections] = useState<string[]>(['basics']);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const sections: ManualSection[] = [
    {
      id: 'basics',
      titleKey: 'manual.sections.basics.title',
      descriptionKey: 'manual.sections.basics.description',
      icon: <User className="h-5 w-5" />,
      imagePath: '/manual/basics.png',
      items: [
        { titleKey: 'manual.sections.basics.items.languages.title', descriptionKey: 'manual.sections.basics.items.languages.description' },
        { titleKey: 'manual.sections.basics.items.credits.title', descriptionKey: 'manual.sections.basics.items.credits.description' },
        { titleKey: 'manual.sections.basics.items.profile.title', descriptionKey: 'manual.sections.basics.items.profile.description' },
        { titleKey: 'manual.sections.basics.items.friends.title', descriptionKey: 'manual.sections.basics.items.friends.description' },
        { titleKey: 'manual.sections.basics.items.managing.title', descriptionKey: 'manual.sections.basics.items.managing.description' }
      ]
    },
    {
      id: 'events',
      titleKey: 'manual.sections.events.title',
      descriptionKey: 'manual.sections.events.description',
      icon: <Calendar className="h-5 w-5" />,
      imagePath: '/manual/events.png',
      items: [
        { titleKey: 'manual.sections.events.items.refresh.title', descriptionKey: 'manual.sections.events.items.refresh.description' },
        { titleKey: 'manual.sections.events.items.showAll.title', descriptionKey: 'manual.sections.events.items.showAll.description' },
        { titleKey: 'manual.sections.events.items.multiEvent.title', descriptionKey: 'manual.sections.events.items.multiEvent.description' },
        { titleKey: 'manual.sections.events.items.select.title', descriptionKey: 'manual.sections.events.items.select.description' },
        { titleKey: 'manual.sections.events.items.search.title', descriptionKey: 'manual.sections.events.items.search.description' }
      ]
    },
    {
      id: 'dashboard',
      titleKey: 'manual.sections.dashboard.title',
      descriptionKey: 'manual.sections.dashboard.description',
      icon: <BarChart className="h-5 w-5" />,
      imagePath: '/manual/dashboard.png',
      items: [
        { titleKey: 'manual.sections.dashboard.items.startList.title', descriptionKey: 'manual.sections.dashboard.items.startList.description' },
        { titleKey: 'manual.sections.dashboard.items.refreshOffline.title', descriptionKey: 'manual.sections.dashboard.items.refreshOffline.description' },
        { titleKey: 'manual.sections.dashboard.items.riderInfo.title', descriptionKey: 'manual.sections.dashboard.items.riderInfo.description' },
        { titleKey: 'manual.sections.dashboard.items.commentatorInfo.title', descriptionKey: 'manual.sections.dashboard.items.commentatorInfo.description' },
        { titleKey: 'manual.sections.dashboard.items.eventHistory.title', descriptionKey: 'manual.sections.dashboard.items.eventHistory.description' },
        { titleKey: 'manual.sections.dashboard.items.performanceHistory.title', descriptionKey: 'manual.sections.dashboard.items.performanceHistory.description' },
        { titleKey: 'manual.sections.dashboard.items.allResults.title', descriptionKey: 'manual.sections.dashboard.items.allResults.description' },
        { titleKey: 'manual.sections.dashboard.items.seriesRanking.title', descriptionKey: 'manual.sections.dashboard.items.seriesRanking.description' }
      ]
    }
  ];

  const getItemNumber = (sectionId: string, itemIndex: number) => {
    const colorMap: { [key: string]: string } = {
      basics: 'bg-blue-600',
      events: 'bg-green-600',
      dashboard: 'bg-purple-600'
    };
    const bgColor = colorMap[sectionId] || 'bg-gray-600';

    return (
      <div className={`flex-shrink-0 w-6 h-6 ${bgColor} rounded-full flex items-center justify-center text-white text-xs font-bold`}>
        {itemIndex + 1}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        title={t('manual.title')}
        subtitle={t('manual.subtitle')}
        showBackButton={true}
        backUrl="/"
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Manual Overview */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-center">
                <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                  <BookOpen className="h-10 w-10" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-1">
                  {t('manual.welcome.title')}
                </h2>
                <p className="text-gray-500 mb-4">{t('manual.welcome.subtitle')}</p>

                <div className="space-y-2">
                  <div className="flex items-center justify-center">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                      <BookOpen className="h-4 w-4" />
                      {t('manual.welcome.sections', { count: sections.length })}
                    </span>
                  </div>

                  <p className="text-sm text-gray-600 mt-4">
                    {t('manual.welcome.description')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Manual Sections */}
          <div className="lg:col-span-2 space-y-6">
            {/* Introduction */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {t('manual.intro.title')}
              </h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                {t('manual.intro.content')}
              </p>
            </div>

            {/* Sections */}
            {sections.map((section) => {
              const isExpanded = expandedSections.includes(section.id);

              return (
                <div key={section.id} className="bg-white rounded-lg shadow">
                  <div
                    className="p-6 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleSection(section.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {section.icon}
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">
                            {t(section.titleKey)}
                          </h3>
                          <p className="text-sm text-gray-500">{t(section.descriptionKey)}</p>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-6">
                      {/* Screenshot with annotations */}
                      <div className="mb-6 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                        <div className="relative w-full">
                          <Image
                            src={section.imagePath}
                            alt={t(section.titleKey)}
                            width={1600}
                            height={900}
                            className="w-full h-auto"
                            priority={section.id === 'basics'}
                          />
                        </div>
                      </div>

                      {/* Item descriptions */}
                      <div className="space-y-4">
                        {section.items.map((item, index) => (
                          <div key={index} className="flex gap-3 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                            <div className="flex-shrink-0 mt-0.5">
                              {getItemNumber(section.id, index)}
                            </div>
                            <div>
                              <h4 className="font-medium text-gray-900 mb-1">
                                {t(item.titleKey)}
                              </h4>
                              <p className="text-sm text-gray-600 leading-relaxed">
                                {t(item.descriptionKey)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
