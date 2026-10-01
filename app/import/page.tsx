'use client';
import Link from 'next/link';
import ImportFlow from '@/components/import/ImportFlow';
import { JourneyFooter, JourneyHeader } from '@/components/journey/SiteChrome';

export default function ImportPage() {
  return <main className="journey-page import-page"><JourneyHeader/><div className="journey-container import-container"><Link href="/start" className="journey-back">← Back to start</Link><ImportFlow/></div><JourneyFooter/></main>;
}
