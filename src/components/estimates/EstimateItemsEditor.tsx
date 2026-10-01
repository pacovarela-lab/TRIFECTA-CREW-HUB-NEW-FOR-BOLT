import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEstimateItems, useUpdateEstimateItem, useDeleteEstimateItem, useAddEstimateItem } from "@/hooks/useTrifectaData";
import { Plus, Trash2, Save } from "lucide-react";
import { usd } from "@/lib/format";

interface Props { projectId: string }

interface DraftItem {
  id: string;
  description: string;
  category: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  dirty?: boolean;
}

export const EstimateItemsEditor = ({ projectId }: Props) => {
  const { data, isLoading } = useEstimateItems(projectId);
  const updateItem = useUpdateEstimateItem();
  const deleteItem = useDeleteEstimateItem();
  const addItem = useAddEstimateItem();
  const [drafts, setDrafts] = useState<DraftItem[]>([]);

  useEffect(() => {
    setDrafts((data ?? []).map((it: any) => ({
      id: it.id,
      description: it.description ?? "",
      category: it.category ?? "",
      quantity: Number(it.quantity ?? 0),
      unit: it.unit ?? "",
      unit_price: Number(it.unit_price ?? 0),
      total: Number(it.total ?? 0),
      dirty: false,
    })));
  }, [data]);

  const patch = (idx: number, p: Partial<DraftItem>) => {
    setDrafts((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, ...p, dirty: true };
      // recalc total when quantity or unit_price changes
      if (p.quantity !== undefined || p.unit_price !== undefined) {
        next.total = Number((next.quantity * next.unit_price).toFixed(2));
      }
      return next;
    }));
  };

  const save = async (idx: number) => {
    const it = drafts[idx];
    await updateItem.mutateAsync({
      id: it.id,
      projectId,
      patch: {
        description: it.description,
        category: it.category || null,
        quantity: it.quantity,
        unit: it.unit || null,
        unit_price: it.unit_price,
        total: it.total,
      },
    });
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, dirty: false } : d)));
  };

  const total = drafts.reduce((s, d) => s + Number(d.total || 0), 0);

  if (isLoading) return <div className="h-20 animate-pulse rounded-xl bg-muted" />;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Items del estimado ({drafts.length})</p>
          <p className="text-sm font-bold">{usd(total)}</p>
        </div>

        {drafts.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Aún no hay items.</p>
        ) : (
          <div className="space-y-2">
            {drafts.map((it, idx) => (
              <div key={it.id} className="rounded-lg border border-border p-3">
                <div className="grid grid-cols-12 gap-2">
                  <Input className="col-span-12 h-10" value={it.description} placeholder="Descripción" onChange={(e) => patch(idx, { description: e.target.value })} />
                  <Input className="col-span-6 h-10" value={it.category} placeholder="Categoría" onChange={(e) => patch(idx, { category: e.target.value })} />
                  <Input className="col-span-3 h-10" type="number" value={it.quantity} placeholder="Cant." onChange={(e) => patch(idx, { quantity: Number(e.target.value) })} />
                  <Input className="col-span-3 h-10" value={it.unit} placeholder="Unidad" onChange={(e) => patch(idx, { unit: e.target.value })} />
                  <Input className="col-span-6 h-10" type="number" value={it.unit_price} placeholder="$ Unit." onChange={(e) => patch(idx, { unit_price: Number(e.target.value) })} />
                  <Input className="col-span-6 h-10" type="number" value={it.total} placeholder="$ Total" onChange={(e) => patch(idx, { total: Number(e.target.value) })} />
                </div>
                <div className="mt-2 flex justify-between gap-2">
                  <Button size="sm" variant="ghost" className="text-destructive"
                    onClick={() => deleteItem.mutate({ id: it.id, projectId })}>
                    <Trash2 className="mr-1 h-4 w-4" /> Eliminar
                  </Button>
                  <Button size="sm" disabled={!it.dirty || updateItem.isPending} onClick={() => save(idx)}>
                    <Save className="mr-1 h-4 w-4" /> {it.dirty ? "Guardar" : "Guardado"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" className="w-full" disabled={addItem.isPending}
          onClick={() => addItem.mutate({ projectId })}>
          <Plus className="mr-1 h-4 w-4" /> Agregar línea
        </Button>
      </CardContent>
    </Card>
  );
};
