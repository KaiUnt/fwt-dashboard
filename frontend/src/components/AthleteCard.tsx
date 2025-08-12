'use client';

import { useState } from 'react';
import { Calendar } from 'lucide-react';
import Image from 'next/image';
import { Athlete, EventInfo } from '@/types/athletes';
import { useCommentatorInfoWithFriends } from '@/hooks/useCommentatorInfo';
import { CommentatorInfoSection } from './CommentatorInfoSection';
import { CommentatorInfoModal } from './CommentatorInfoModal';
import { getCountryFlag, getNationalityDisplay } from '@/utils/nationality';
import { useTranslation } from '@/hooks/useTranslation';

interface AthleteCardProps {
  athlete: Athlete;
  eventInfo: EventInfo;
}

export function AthleteCard({ athlete, eventInfo }: AthleteCardProps) {
  const { t } = useTranslation();
  const [showCommentatorModal, setShowCommentatorModal] = useState(false);
  
  // Fetch only own commentator info for editing
  const { data: myCommentatorInfo } = useCommentatorInfoWithFriends(athlete.id, 'mine');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            {t('athlete.status.confirmed')}
          </span>
        );
      case 'waitlisted':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            {t('athlete.status.waitlisted')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {status}
          </span>
        );
    }
  };

  const calculateAge = (dob?: string) => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  };

  const age = calculateAge(athlete.dob);

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Header with BIB and Status */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-4">
            {athlete.bib && (
              <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2">
                <div className="text-2xl font-bold">#{athlete.bib}</div>
                <div className="text-xs opacity-75">BIB</div>
              </div>
            )}
            
            <div>
              <h2 className="text-3xl font-bold mb-1">{athlete.name}</h2>
              <div className="flex items-center space-x-3 text-blue-100">
                <div className="flex items-center space-x-1">
                  <span className="text-lg">{getCountryFlag(athlete.nationality)}</span>
                  <span className="text-sm">{getNationalityDisplay(athlete.nationality)}</span>
                </div>
                {age && (
                  <div className="flex items-center space-x-1">
                    <Calendar className="h-4 w-4" />
                    <span className="text-sm">{t('athlete.age', { age })}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="text-right">
            {getStatusBadge(athlete.status)}
            {athlete.division && (
              <div className="mt-2 text-sm text-blue-100">
                {athlete.division}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Athlete Photo */}
      <div className="p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-shrink-0">
            {athlete.image ? (
              <Image 
                src={athlete.image} 
                alt={athlete.name}
                width={192}
                height={256}
                className="w-48 h-64 object-cover rounded-lg shadow-md"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <div className="w-48 h-64 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg shadow-md flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <div className="text-6xl mb-2">👤</div>
                  <div className="text-sm">{t('athlete.noPhoto')}</div>
                </div>
              </div>
            )}
          </div>

          {/* Athlete Details */}
          <div className="flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">{t('athlete.info.title')}</h3>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-700">{t('athlete.info.name')}:</span>
                      <span className="font-semibold text-gray-900">{athlete.name}</span>
                    </div>
                    
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-700">{t('athlete.info.nationality')}:</span>
                      <span className="font-semibold text-gray-900">
                        {getCountryFlag(athlete.nationality)} {getNationalityDisplay(athlete.nationality)}
                      </span>
                    </div>
                    
                    {athlete.dob && (
                      <div className="flex items-center justify-between py-2 border-b border-gray-100">
                        <span className="text-sm text-gray-700">{t('athlete.info.birthDate')}:</span>
                        <span className="font-semibold text-gray-900">
                          {new Date(athlete.dob).toLocaleDateString('de-DE')}
                          {age && ` (${t('athlete.age', { age })})`}
                        </span>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-700">{t('athlete.info.status')}:</span>
                      <span className="font-medium">{getStatusBadge(athlete.status)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Event Info */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">{t('athlete.eventInfo.title')}</h3>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-700">{t('athlete.eventInfo.currentEvent')}:</span>
                      <span className="font-semibold text-gray-900">{eventInfo.name}</span>
                    </div>
                    
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-700">{t('athlete.eventInfo.date')}:</span>
                      <span className="font-semibold text-gray-900">
                        {new Date(eventInfo.date).toLocaleDateString('de-DE')}
                      </span>
                    </div>
                    
                    {athlete.division && (
                      <div className="flex items-center justify-between py-2 border-b border-gray-100">
                        <span className="text-sm text-gray-700">{t('athlete.eventInfo.division')}:</span>
                        <span className="font-semibold text-gray-900">{athlete.division}</span>
                      </div>
                    )}
                    
                    {athlete.bib && (
                      <div className="flex items-center justify-between py-2 border-b border-gray-100">
                        <span className="text-sm text-gray-700">{t('athlete.eventInfo.bibNumber')}:</span>
                        <span className="font-bold text-xl text-blue-600">#{athlete.bib}</span>
                      </div>
                    )}
                  </div>
                </div>
                
              </div>
            </div>
          </div>
        </div>
        
        {/* Commentator Info Section */}
        <CommentatorInfoSection
          athleteId={athlete.id}
          athleteName={athlete.name}
          onEdit={() => setShowCommentatorModal(true)}
        />
      </div>
      
      {/* Commentator Info Modal */}
      <CommentatorInfoModal
        athleteId={athlete.id}
        athleteName={athlete.name}
        initialData={myCommentatorInfo?.[0] || null}
        isOpen={showCommentatorModal}
        onClose={() => setShowCommentatorModal(false)}
      />
    </div>
  );
} 