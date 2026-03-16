'use client';

import React, { useState } from 'react';
import { User, Settings, Building2, Shield, Bell, ArrowLeft, Check } from 'lucide-react';
import Link from 'next/link';

type SettingsTab = 'profile' | 'measurements' | 'organization' | 'account';

const SCALE_OPTIONS = [
  '1/8" = 1\'',
  '1/4" = 1\'',
  '3/8" = 1\'',
  '1/2" = 1\'',
  '3/4" = 1\'',
  '1" = 1\'',
  '1-1/2" = 1\'',
  '3" = 1\'',
  '1:10',
  '1:20',
  '1:50',
  '1:100',
  '1:200',
  '1:500',
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  // Profile state
  const [name, setName] = useState('Nathan Solis');
  const [email] = useState('nathan@measurex.io');
  const [orgName, setOrgName] = useState('MeasureX Inc.');

  // Measurements state
  const [unitSystem, setUnitSystem] = useState<'imperial' | 'metric'>('imperial');
  const [defaultScale, setDefaultScale] = useState('1/4" = 1\'');
  const [applyToAll, setApplyToAll] = useState(false);

  // Organization state
  const [teamName, setTeamName] = useState('MeasureX Team');

  const tabs: { key: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { key: 'profile', label: 'Profile', icon: <User size={16} /> },
    { key: 'measurements', label: 'Measurements', icon: <Settings size={16} /> },
    { key: 'organization', label: 'Organization', icon: <Building2 size={16} /> },
    { key: 'account', label: 'Account', icon: <Shield size={16} /> },
  ];

  const handleDeleteAccount = () => {
    if (window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      // placeholder
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <Link href="/projects" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold">Settings</h1>
      </header>

      <div className="flex max-w-5xl mx-auto mt-8 gap-8 px-6">
        {/* Sidebar tabs */}
        <nav className="w-52 shrink-0 space-y-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm flex items-center gap-3 transition-colors ${
                activeTab === t.key
                  ? 'bg-gray-800 text-white font-medium'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 min-w-0">
          {activeTab === 'profile' && (
            <section className="space-y-6">
              <h2 className="text-lg font-semibold mb-4">Profile</h2>

              {/* Avatar */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xl font-bold text-green-400">
                  NS
                </div>
                <div>
                  <div className="text-sm font-medium">{name}</div>
                  <div className="text-xs text-gray-400">{email}</div>
                </div>
              </div>

              <div className="bg-gray-900 rounded-xl p-6 space-y-5 border border-gray-800">
                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Name</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-green-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Email</label>
                  <div className="flex items-center gap-3">
                    <input
                      value={email}
                      readOnly
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-400 outline-none cursor-not-allowed"
                    />
                    <button className="text-sm text-green-400 hover:text-green-300 whitespace-nowrap transition-colors">
                      Change Email
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Organization</label>
                  <input
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-green-500 transition-colors"
                  />
                </div>

                <div className="pt-2">
                  <button className="bg-green-600 hover:bg-green-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                    <Check size={14} /> Save Changes
                  </button>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'measurements' && (
            <section className="space-y-6">
              <h2 className="text-lg font-semibold mb-4">Measurements</h2>

              <div className="bg-gray-900 rounded-xl p-6 space-y-6 border border-gray-800">
                {/* Unit system toggle */}
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Unit System</label>
                  <div className="flex gap-0 border border-gray-700 rounded-lg overflow-hidden w-fit">
                    <button
                      onClick={() => setUnitSystem('imperial')}
                      className={`px-6 py-2.5 text-sm font-medium transition-colors ${
                        unitSystem === 'imperial'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      Imperial
                    </button>
                    <button
                      onClick={() => setUnitSystem('metric')}
                      className={`px-6 py-2.5 text-sm font-medium transition-colors ${
                        unitSystem === 'metric'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      Metric
                    </button>
                  </div>
                </div>

                {/* Default scale */}
                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Default Scale</label>
                  <select
                    value={defaultScale}
                    onChange={e => setDefaultScale(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-green-500 w-64 transition-colors"
                  >
                    {SCALE_OPTIONS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* Apply to all */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyToAll}
                    onChange={e => setApplyToAll(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-green-500 focus:ring-green-500"
                  />
                  <span className="text-sm text-gray-300">Apply to all new projects</span>
                </label>
              </div>
            </section>
          )}

          {activeTab === 'organization' && (
            <section className="space-y-6">
              <h2 className="text-lg font-semibold mb-4">Organization</h2>

              <div className="bg-gray-900 rounded-xl p-6 space-y-6 border border-gray-800">
                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Team Name</label>
                  <input
                    value={teamName}
                    onChange={e => setTeamName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-green-500 transition-colors"
                  />
                </div>

                {/* Billing placeholder */}
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Billing</label>
                  <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-white">Free Plan</div>
                      <div className="text-xs text-gray-400 mt-0.5">5 projects, 1 team member</div>
                    </div>
                    <button className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                      Upgrade to Pro
                    </button>
                  </div>
                </div>

                {/* Member count */}
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Team Members</label>
                  <div className="flex items-center gap-3">
                    <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white">
                      <span className="text-green-400 font-semibold">1</span> / 1 members
                    </div>
                    <Bell size={16} className="text-gray-500" />
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'account' && (
            <section className="space-y-6">
              <h2 className="text-lg font-semibold mb-4">Account</h2>

              <div className="bg-gray-900 rounded-xl p-6 space-y-5 border border-gray-800">
                {/* Change password */}
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Password</label>
                  <button className="border border-gray-600 text-gray-300 hover:text-white hover:border-gray-500 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
                    Change Password
                  </button>
                </div>

                {/* Sign out */}
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Session</label>
                  <button className="border border-gray-600 text-gray-300 hover:text-white hover:border-gray-500 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
                    Sign Out
                  </button>
                </div>

                {/* Danger zone */}
                <div className="border-t border-gray-800 pt-5 mt-5">
                  <label className="block text-sm text-red-400 mb-2">Danger Zone</label>
                  <button
                    onClick={handleDeleteAccount}
                    className="border border-red-500/50 text-red-400 hover:bg-red-500/10 hover:border-red-500 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    Delete Account
                  </button>
                  <p className="text-xs text-gray-500 mt-2">
                    This will permanently delete your account and all associated data.
                  </p>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
