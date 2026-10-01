import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Search } from "lucide-react";
import { useClients, useClientProjects } from "@/hooks/useTrifectaData";
import { findSimilar } from "@/lib/similarity";

export interface ClientPickerValue {
  client_id: string | null;     // null = new client to be created
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

interface Props {
  value: ClientPickerValue;
  onChange: (v: ClientPickerValue) => void;
}

export const ClientPicker = ({ value, onChange }: Props) => {
  const { data: clients } = useClients();
  const [search, setSearch] = useState("");
  const { data: clientProjects } = useClientProjects(value.client_id ?? undefined);

  const matches = useMemo(() => {
    if (!search.trim() && !value.name && !value.phone && !value.email) return [];
    const probe = search.trim()
      ? { name: search, phone: search, email: search }
      : { name: value.name, phone: value.phone, email: value.email, address: value.address };
    return findSimilar(clients ?? [], probe);
  }, [clients, search, value.name, value.phone, value.email, value.address]);

  // If user picked a client, show their data prefilled
  useEffect(() => {
    if (!value.client_id) return;
    const c = (clients ?? []).find((x: any) => x.id === value.client_id);
    if (c && c.name !== value.name) {
      onChange({
        ...value,
        name: c.name ?? "",
        phone: c.phone ?? "",
        email: c.email ?? "",
        address: c.address ?? "",
        notes: c.notes ?? "",
      });
    }
  }, [value.client_id, clients]); // eslint-disable-line

  const clearLink = () => onChange({ ...value, client_id: null });

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Nombre del cliente *</Label>
        <Input
          className="h-11"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value, client_id: null })}
          placeholder="ej. Diego Passarella"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Teléfono</Label>
          <Input className="h-11" value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value, client_id: null })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Correo</Label>
          <Input className="h-11" type="email" value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value, client_id: null })} />
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Dirección</Label>
          <Input className="h-11" value={value.address} onChange={(e) => onChange({ ...value, address: e.target.value })} />
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-10 pl-9"
          placeholder="Buscar clientes existentes"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {value.client_id && (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="flex items-center justify-between p-3">
            <div>
              <p className="text-sm font-semibold">Vinculado a cliente existente</p>
              <p className="text-xs text-muted-foreground">{value.name}</p>
            </div>
            <button type="button" onClick={clearLink} className="text-xs text-primary underline">
              Usar como nuevo
            </button>
          </CardContent>
        </Card>
      )}

      {matches.length > 0 && !value.client_id && (
        <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <p className="flex items-center gap-1 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4" /> Posible cliente existente
          </p>
          {matches.map((m) => (
            <button
              key={m.record.id}
              type="button"
              className="flex w-full items-center justify-between rounded border border-border bg-background p-2 text-left"
              onClick={() => onChange({ ...value, client_id: m.record.id })}
            >
              <div>
                <p className="text-sm font-medium">{m.record.name}</p>
                <p className="text-xs text-muted-foreground">{m.reasons.join(" · ")}</p>
              </div>
              <Badge variant="outline" className="text-[10px]">Usar existente</Badge>
            </button>
          ))}
        </div>
      )}

      {value.client_id && (clientProjects ?? []).length > 0 && (
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Proyectos existentes de este cliente ({clientProjects!.length})
          </p>
          <ul className="space-y-1">
            {clientProjects!.slice(0, 5).map((p: any) => (
              <li key={p.id} className="flex items-center justify-between text-sm">
                <span className="truncate">{p.name}</span>
                <Badge variant="outline" className="text-[10px] capitalize">{p.status}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
