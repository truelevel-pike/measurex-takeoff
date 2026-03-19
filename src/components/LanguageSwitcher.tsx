'use client';

import { useTranslation, setLocale } from '@/i18n';

export default function LanguageSwitcher() {
  const { locale } = useTranslation();

  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value as 'en' | 'es')}
      className="rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      aria-label="Select language"
    >
      <option value="en">EN</option>
      <option value="es">ES</option>
    </select>
  );
}
