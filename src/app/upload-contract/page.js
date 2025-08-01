'use client';

import React from 'react';
import HeaderSidebarLayout from '@/app/components/HeaderSidebarLayout';

export default function Page() {
  return (
    <HeaderSidebarLayout>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg text-black max-w-md w-full">
          <h1 className="text-2xl font-bold mb-4">New Features Coming Soon</h1>
          <p className="mb-6">Contract Upload & Certification Management</p>
          <ul className="list-disc list-inside mb-6">
            <li>🔒 Secure Contract Upload</li>
            <li>🎓 Certification Tracking</li>
          </ul>
          <button
            className="bg-indigo-600 text-white py-2 px-4 rounded opacity-50 cursor-not-allowed"
            disabled
          >
            Stay Tuned
          </button>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
