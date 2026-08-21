import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/EmptyState.js';
import { Button } from '@/components/ui/button.js';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center">
      <EmptyState title="This page swam away" hint="404 — nothing at this address but open water." />
      <Button onClick={() => (location.href = '/')}>Swim home</Button>
      <Link to="/explore" className="mt-2 text-sm text-ocean underline">
        or explore the ocean
      </Link>
    </div>
  );
}
