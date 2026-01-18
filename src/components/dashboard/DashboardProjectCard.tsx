import { Link } from 'react-router-dom';
import { ArrowRight, FolderKanban } from 'lucide-react';
import type { Group } from '@/types/database';

interface DashboardProjectCardProps {
  group: Group;
}

export default function DashboardProjectCard({
  group,
}: DashboardProjectCardProps) {
  return (
    <div className="border rounded-xl overflow-hidden">
      {/* Project Header - Clickable */}
      <Link
        to={`/p/${group.slug}`}
        className="group flex items-center gap-4 p-4 bg-card hover:bg-muted/30 transition-all"
      >
        {/* Thumbnail */}
        <div className="relative w-20 h-20 flex-shrink-0 rounded-xl bg-muted overflow-hidden">
          {group.image_url ? (
            <img
              src={group.image_url}
              alt={group.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
              <FolderKanban className="w-8 h-8 text-primary/40" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base line-clamp-1 group-hover:text-primary transition-colors">
            {group.name}
          </h3>
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            {group.description || 'Không có mô tả'}
          </p>
        </div>

        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
      </Link>
    </div>
  );
}