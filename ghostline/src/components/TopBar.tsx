import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from './Button';
import { nav } from '../lib/router';

export function TopBar({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="topbar">
      <IconButton label="Back" onClick={() => nav.back()}><ChevronLeft size={22} /></IconButton>
      <h2>{title}</h2>
      {right}
    </div>
  );
}
