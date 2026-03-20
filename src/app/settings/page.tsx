'use client';

import React, { useState } from 'react';
import { User, Settings, Building2, Shield, Bell, ArrowLeft, Check, Brain, Eye, EyeOff, Key, Plus, Trash2, Copy } from 'lucide-react';
import Link from 'next/link';
import {
  type MeasurementSettings,
  type AreaUnit,
  type LinearUnit,
  type DecimalPlaces,
  type ScaleDisplayFormat,
  AREA_UNIT_LABELS,
  LINEAR_UNIT_LABELS,
  loadMeasurementSettings,
  saveMeasurementSettings,
} from '@/lib/measurement-settings';
import { type AiSettings, loadAiSettings, saveAiSettings } from '@/lib/ai-settings';

type SettingsTab = 'profile' | 'measurements' | 'ai' | 'organization' | 'account' | 'api-keys';

interface ApiKey {
  id: string;
  label: string;
  key: string;
  createdAt: string;
  lastUsed: string | null;
}

const AI_MODEL_OPTIONS = [
  { value: 'gpt-5.4', label: 'GPT-5.4' },
  { value: 'gemini-3.1', label: 'Gemini 3.1' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
];

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
  const PROFILE_KEY = 'mx-profile-settings';
  const [name, setName] = useState<string>(() => {
    if (typeof window === 'undefined') return 'Nathan Solis';
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) return JSON.parse(raw).name ?? 'Nathan Solis';
    } catch { /* ignore */ }
    return 'Nathan Solis';
  });
  const [email] = useState('nathan@measurex.io');
  const [orgName, setOrgName] = useState<string>(() => {
    if (typeof window === 'undefined') return 'MeasureX Inc.';
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) return JSON.parse(raw).orgName ?? 'MeasureX Inc.';
    } catch { /* ignore */ }
    return 'MeasureX Inc.';
  });
  const [profileSaved, setProfileSaved] = useState(false);

  const handleSaveProfile = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ name, orgName }));
    }
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  // Measurements state
  const [defaultScale, setDefaultScale] = useState('1/4" = 1\'');
  const [applyToAll, setApplyToAll] = useState(false);

  // Measurement precision settings (persisted in localStorage)
  const [ms, setMs] = useState<MeasurementSettings | null>(() => loadMeasurementSettings());

  const updateSetting = (patch: Partial<MeasurementSettings>) => {
    if (!ms) return;
    const next: MeasurementSettings = { ...ms, ...patch };
    setMs(next);
    saveMeasurementSettings(next);
  };

  // AI settings state
  const [ai, setAi] = useState<AiSettings>(() => loadAiSettings());
  const [showApiKey, setShowApiKey] = useState(false);

  const updateAi = (patch: Partial<AiSettings>) => {
    const next: AiSettings = { ...ai, ...patch };
    setAi(next);
    saveAiSettings(next);
  };

  // Organization state
  const [teamName, setTeamName] = useState('MeasureX Team');

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [showNewKey, setShowNewKey] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  const addApiKey = () => {
    if (!newKeyLabel.trim() || !newKeyValue.trim()) return;
    const key: ApiKey = {
      id: Math.random().toString(36).slice(2),
      label: newKeyLabel.trim(),
      key: newKeyValue.trim(),
      createdAt: new Date().toISOString(),
      lastUsed: null,
    };
    setApiKeys(prev => [...prev, key]);
    setNewKeyLabel('');
    setNewKeyValue('');
    setShowNewKey(false);
  };

  const removeApiKey = (id: string) => {
    setApiKeys(prev => prev.filter(k => k.id !== id));
  };

  const copyKey = (id: string, value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedKeyId(id);
      setTimeout(() => setCopiedKeyId(null), 2000);
    });
  };

  const tabs: { key: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { key: 'profile', label: 'Profile', icon: <User size={16} /> },
    { key: 'measurements', label: 'Measurements', icon: <Settings size={16} /> },
    { key: 'ai', label: 'AI', icon: <Brain size={16} /> },
    { key: 'api-keys', label: 'API Keys', icon: <Key size={16} /> },
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
                  <button
                    onClick={handleSaveProfile}
                    className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${profileSaved ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-green-600 hover:bg-green-500'} text-white`}
                  >
                    <Check size={14} /> {profileSaved ? 'Saved!' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'measurements' && ms && (
            <section className="space-y-6">
              <h2 className="text-lg font-semibold mb-4">Measurements</h2>

              <div className="bg-gray-900 rounded-xl p-6 space-y-6 border border-gray-800">
                {/* Unit system toggle */}
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Unit System</label>
                  <div className="flex gap-0 border border-gray-700 rounded-lg overflow-hidden w-fit">
                    {(['imperial', 'metric'] as const).map(u => (
                      <button
                        key={u}
                        onClick={() => {
                          if (u === 'metric') {
                            updateSetting({ unit: u, areaUnit: 'sm', linearUnit: 'm' });
                          } else {
                            updateSetting({ unit: u, areaUnit: 'sf', linearUnit: 'ft' });
                          }
                        }}
                        className={`px-6 py-2.5 text-sm font-medium capitalize transition-colors ${
                          ms.unit === u
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:text-white'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
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

              {/* Measurement Precision Settings */}
              <div className="bg-gray-900 rounded-xl p-6 space-y-6 border border-gray-800">
                <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">Precision &amp; Display</h3>

                {/* Area units */}
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Area Unit</label>
                  <div className="flex gap-0 border border-gray-700 rounded-lg overflow-hidden w-fit">
                    {(['sf', 'sy', 'sm', 'sm2'] as AreaUnit[]).map(u => (
                      <button
                        key={u}
                        onClick={() => updateSetting({ areaUnit: u })}
                        className={`px-5 py-2.5 text-sm font-medium transition-colors ${
                          ms.areaUnit === u
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:text-white'
                        }`}
                      >
                        {AREA_UNIT_LABELS[u].toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Linear units */}
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Linear Unit</label>
                  <div className="flex gap-0 border border-gray-700 rounded-lg overflow-hidden w-fit">
                    {(['ft', 'in', 'm', 'cm'] as LinearUnit[]).map(u => (
                      <button
                        key={u}
                        onClick={() => updateSetting({ linearUnit: u })}
                        className={`px-5 py-2.5 text-sm font-medium transition-colors ${
                          ms.linearUnit === u
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:text-white'
                        }`}
                      >
                        {LINEAR_UNIT_LABELS[u].toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Decimal places */}
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Decimal Places</label>
                  <div className="flex gap-0 border border-gray-700 rounded-lg overflow-hidden w-fit">
                    {([0, 1, 2, 3] as DecimalPlaces[]).map(d => (
                      <button
                        key={d}
                        onClick={() => updateSetting({ decimals: d })}
                        className={`px-6 py-2.5 text-sm font-medium transition-colors ${
                          ms.decimals === d
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:text-white'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scale display format */}
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Scale Display Format</label>
                  <div className="flex gap-0 border border-gray-700 rounded-lg overflow-hidden w-fit">
                    {([
                      { value: 'architectural' as ScaleDisplayFormat, label: 'Architectural', example: '1/4" = 1\'' },
                      { value: 'engineering' as ScaleDisplayFormat, label: 'Engineering', example: '1" = 20\'' },
                      { value: 'ratio' as ScaleDisplayFormat, label: 'Ratio', example: '1:48' },
                    ]).map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => updateSetting({ scaleDisplayFormat: opt.value })}
                        className={`px-5 py-2.5 text-sm font-medium transition-colors ${
                          ms.scaleDisplayFormat === opt.value
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:text-white'
                        }`}
                        title={opt.example}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">
                    {ms.scaleDisplayFormat === 'architectural' && 'e.g. 1/4" = 1\''}
                    {ms.scaleDisplayFormat === 'engineering' && 'e.g. 1" = 20\''}
                    {ms.scaleDisplayFormat === 'ratio' && 'e.g. 1:48'}
                  </p>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'ai' && (
            <section className="space-y-6">
              <h2 className="text-lg font-semibold mb-4">AI</h2>

              <div className="bg-gray-900 rounded-xl p-6 space-y-6 border border-gray-800">
                {/* Default AI Model */}
                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Default AI Model</label>
                  <select
                    value={ai.defaultModel}
                    onChange={e => updateAi({ defaultModel: e.target.value })}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-green-500 w-64 transition-colors"
                  >
                    {AI_MODEL_OPTIONS.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>

                {/* Default Scale Unit */}
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Default Scale Unit</label>
                  <div className="flex gap-0 border border-gray-700 rounded-lg overflow-hidden w-fit">
                    {(['ft', 'm'] as const).map(u => (
                      <button
                        key={u}
                        onClick={() => updateAi({ defaultScaleUnit: u })}
                        className={`px-6 py-2.5 text-sm font-medium transition-colors ${
                          ai.defaultScaleUnit === u
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:text-white'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Auto-run Scale Detection */}
                <div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      onClick={() => updateAi({ autoRunScaleDetection: !ai.autoRunScaleDetection })}
                      className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                        ai.autoRunScaleDetection ? 'bg-green-600' : 'bg-gray-700'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          ai.autoRunScaleDetection ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </div>
                    <span className="text-sm text-gray-300">Auto-run Scale Detection</span>
                  </label>
                </div>

                {/* Theme */}
                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Theme</label>
                  <span className="inline-block bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-400">
                    Dark
                  </span>
                </div>

                {/* OpenAI API Key */}
                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">OpenAI API Key</label>
                  <div className="flex items-center gap-2">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={ai.openaiApiKey}
                      onChange={e => updateAi({ openaiApiKey: e.target.value })}
                      placeholder="sk-..."
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-green-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="text-gray-400 hover:text-white p-2 transition-colors"
                    >
                      {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">
                    Used for direct GPT-5.4 calls (optional override)
                  </p>
                </div>
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
          {activeTab === 'api-keys' && (
            <section className="space-y-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">API Keys</h2>
                  <p className="text-xs text-gray-500 mt-1">Use your own OpenAI API key to avoid platform quotas.</p>
                </div>
                <button
                  onClick={() => setShowNewKey(v => !v)}
                  className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Plus size={14} /> Add Key
                </button>
              </div>

              {/* Add new key form */}
              {showNewKey && (
                <div className="bg-gray-900 border border-green-600/30 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-white">New API Key</h3>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">Label</label>
                    <input
                      value={newKeyLabel}
                      onChange={e => setNewKeyLabel(e.target.value)}
                      placeholder="e.g. My OpenAI Key"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-green-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">OpenAI API Key</label>
                    <input
                      type="password"
                      value={newKeyValue}
                      onChange={e => setNewKeyValue(e.target.value)}
                      placeholder="sk-..."
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-green-500 transition-colors font-mono"
                    />
                    <p className="text-xs text-gray-500 mt-1">Your key is stored locally and sent only to OpenAI.</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={addApiKey}
                      disabled={!newKeyLabel.trim() || !newKeyValue.trim()}
                      className="bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      <Check size={14} /> Save Key
                    </button>
                    <button
                      onClick={() => { setShowNewKey(false); setNewKeyLabel(''); setNewKeyValue(''); }}
                      className="border border-gray-600 text-gray-400 hover:text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Key list */}
              {apiKeys.length === 0 && !showNewKey ? (
                <div className="bg-gray-900 border border-gray-800 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 text-center">
                  <Key size={32} className="text-gray-700" />
                  <p className="text-sm text-gray-500">No API keys yet.</p>
                  <p className="text-xs text-gray-600 max-w-xs">Add your OpenAI API key to use your own quota for AI Takeoff instead of the platform key.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {apiKeys.map(k => (
                    <div key={k.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center gap-4">
                      <Key size={16} className="text-green-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white">{k.label}</div>
                        <div className="text-xs text-gray-500 font-mono mt-0.5">
                          {k.key.slice(0, 7)}••••••••{k.key.slice(-4)}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          Added {new Date(k.createdAt).toLocaleDateString()}
                          {k.lastUsed && ` · Last used ${new Date(k.lastUsed).toLocaleDateString()}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => copyKey(k.id, k.key)}
                          className="text-gray-500 hover:text-white p-2 transition-colors"
                          title="Copy key"
                        >
                          {copiedKeyId === k.id ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                        </button>
                        <button
                          onClick={() => removeApiKey(k.id)}
                          className="text-gray-500 hover:text-red-400 p-2 transition-colors"
                          title="Remove key"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Info box */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-2">
                <h3 className="text-sm font-semibold text-gray-200">How it works</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  When you add an OpenAI API key here, AI Takeoff will use it instead of the platform's shared key.
                  This means usage is billed directly to your OpenAI account and you won't hit platform rate limits.
                </p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Keys are stored in your browser's local storage and sent to the server only when running a takeoff.
                  They are never logged or stored server-side.
                </p>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
