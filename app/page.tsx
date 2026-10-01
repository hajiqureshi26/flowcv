import type { Metadata } from 'next';
import LandingPage from '@/components/journey/LandingPage';

export const metadata: Metadata = { title: 'Folio | Resume builder and templates', description: 'Create a clear, polished resume with flexible templates and thoughtful editing tools.' };
export default function HomePage() { return <LandingPage/>; }
