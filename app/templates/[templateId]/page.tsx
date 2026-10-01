import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { templateRegistry } from '@/templates/registry';
import TemplateDetail from './template-detail';

type Props = { params: Promise<{ templateId: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { templateId } = await params;
  const template = templateRegistry.find(item => item.id === templateId);
  if (!template) return { title: 'Template not found | Folio' };
  return { title: `${template.name} resume template | Folio`, description: `Explore the ${template.name} resume template and start a new resume.` };
}
export default async function TemplatePage({ params }: Props) {
  const { templateId } = await params;
  if (!templateRegistry.some(item => item.id === templateId)) notFound();
  return <TemplateDetail templateId={templateId}/>;
}
