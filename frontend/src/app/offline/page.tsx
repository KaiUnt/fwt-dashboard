'use client'

import Image from 'next/image'
import Link from 'next/link'

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto w-24 h-24 relative mb-6">
          <Image src="/offline-image.svg" alt="Offline" fill priority />
        </div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Du bist offline</h1>
        <p className="text-gray-600 mb-6">
          Keine Internetverbindung. Einige Daten sind möglicherweise nicht verfügbar.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => window.location.reload()}
          >
            Erneut versuchen
          </button>
          <Link href="/" className="px-4 py-2 rounded-md border border-gray-300 text-gray-800 hover:bg-gray-100">
            Zur Startseite
          </Link>
        </div>
      </div>
    </div>
  )
}



