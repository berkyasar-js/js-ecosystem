'use client';
import { useParams } from 'next/navigation';
import { ProjectWorkspace } from '@/components/work/ProjectWorkspace';

/** ORBIT proje çalışma ekranı (liste / pano / özet / dosyalar). İş mantığı components/work altında. */
export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  return <ProjectWorkspace projectId={id} />;
}
