import { Package } from 'lucide-react';
import { useStockItems } from '@/features/stock';
import { Badge } from '@/shared/ui';

/** The stock items at or below their alert level. */
export function useLowStock(enabled = true) {
  const items = useStockItems(enabled);
  return { query: items, low: (items.data ?? []).filter((i) => i.low) };
}

export function LowStockBadges({ names }: { names: { id: string; name: string }[] }) {
  return (
    <>
      {names.map((i) => (
        <Badge key={i.id} tone="warning" icon={<Package />}>
          {i.name}
        </Badge>
      ))}
    </>
  );
}
