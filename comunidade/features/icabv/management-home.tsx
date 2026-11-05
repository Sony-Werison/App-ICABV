"use client";
import type { Capabilities } from "./module-ui";

export function ManagementHome({
  name,
  ..._options
}: {
  name: string;
  people: boolean;
  finance: boolean;
  capabilities: Capabilities;
  onNavigate: (tab: string) => void;
}) {
  void _options;
  return (
    <header className="management-heading">
      <div>
        <span className="church-label">ICABV / PAINEL DE GESTÃO</span>
        <h1>Gestão da igreja</h1>
        <p>Bem-vindo, {name.split(" ")[0]}.</p>
      </div>
    </header>
  );
}
