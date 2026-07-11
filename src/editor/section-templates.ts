export type SectionTemplateId = 'blank' | 'chapter' | 'scene' | 'notes' | 'appendix';

export interface SectionTemplate {
  id: SectionTemplateId;
  label: string;
  markdown: string;
}

export const SECTION_TEMPLATES: readonly SectionTemplate[] = [
  { id: 'blank', label: 'Blank', markdown: '' },
  { id: 'chapter', label: 'Chapter', markdown: '# Chapter\n\n' },
  { id: 'scene', label: 'Scene', markdown: '# Scene\n\n' },
  { id: 'notes', label: 'Notes', markdown: '# Notes\n\n' },
  { id: 'appendix', label: 'Appendix', markdown: '# Appendix\n\n' }
];

export function getSectionTemplate(id: SectionTemplateId): SectionTemplate {
  return SECTION_TEMPLATES.find(template => template.id === id) ?? SECTION_TEMPLATES[0];
}
