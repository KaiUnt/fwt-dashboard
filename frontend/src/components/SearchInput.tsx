'use client';

import { Search, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchInput({ value, onChange, placeholder = "Suchen..." }: SearchInputProps) {
  return (
    <div className="relative max-w-md mx-auto">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="h-5 w-5 text-gray-400" />
      </div>
      
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="
          w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl
          focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          placeholder-gray-400 text-gray-900 
          bg-white shadow-sm transition-all duration-200
          hover:shadow-md focus:shadow-md
        "
      />
      
      {value && (
        <button
          onClick={() => onChange('')}
          className="
            absolute inset-y-0 right-0 pr-3 flex items-center
            text-gray-400 hover:text-gray-600 transition-colors
          "
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
} 