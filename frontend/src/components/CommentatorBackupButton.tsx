'use client';

import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import { CommentatorBackup } from './CommentatorBackup';

interface CommentatorBackupButtonProps {
  className?: string;
  variant?: 'primary' | 'secondary';
}

export function CommentatorBackupButton({ 
  className = '', 
  variant = 'secondary' 
}: CommentatorBackupButtonProps) {
  const [showModal, setShowModal] = useState(false);

  const baseClasses = "flex items-center space-x-2 px-3 py-2 rounded-lg font-medium transition-colors";
  const variantClasses = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white",
    secondary: "bg-gray-100 hover:bg-gray-200 text-gray-700"
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`${baseClasses} ${variantClasses[variant]} ${className}`}
        title="Kommentatoren-Daten Backup"
      >
        <Shield className="h-4 w-4" />
        <span className="text-sm">Backup</span>
      </button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Kommentatoren-Daten Backup</h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>
              
              <CommentatorBackup />
            </div>
          </div>
        </div>
      )}
    </>
  );
} 