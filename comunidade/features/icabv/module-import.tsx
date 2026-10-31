"use client";
import { useState } from "react";
import { adaptModuleBackup, type ModuleBundle } from "./legacy-module-adapter";
import {
  ModuleState,
  moduleRpc,
  useModuleAction,
  useModulePeople,
} from "./module-ui";
export function ModuleImport({ module }: { module: "louvor" | "ebd" }) {
  const [bundle, setBundle] = useState<ModuleBundle | null>(null),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    people = useModulePeople(module, true),
    action = useModuleAction();
  return (
    <section className="icabv-card module-page">
      <h2>
        Importar{" "}
        {module === "louvor"
          ? "backup completo do Louvor"
          : "backup do Portal EBD"}
      </h2>
      <p>
        Selecione um JSON exportado pelo aplicativo de origem e confira os
        vínculos. A importação acrescenta dados; não apaga o histórico nem
        altera contas, senhas ou permissões de administrador.
      </p>
      {action.notice}
      <label className="icabv-field">
        Arquivo de backup
        <input
          type="file"
          accept=".json"
          disabled={action.busy}
          onChange={async (e) => {
            setBundle(null);
            setError("");
            setConfirmed(false);
            try {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 15_000_000)
                throw Error("Use um arquivo com até 15 MB.");
              const raw = JSON.parse(
                (await file.text()).replace(/^\uFEFF/, ""),
              );
              setBundle(adaptModuleBackup(module, raw));
            } catch (err) {
              setError(err instanceof Error ? err.message : "Backup inválido.");
            }
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {bundle && (
        <>
          <h3>Conferir os dados</h3>
          <p>
            {bundle.people.length} pessoas ·{" "}
            {module === "louvor"
              ? `${bundle.songs.length} músicas · ${bundle.services.length} cultos`
              : `${bundle.classes.length} turmas · ${bundle.modules.length} módulos · ${bundle.activities.length} atividades · ${bundle.recordings.length} gravações · ${bundle.history.length} registros de histórico`}
          </p>
          <p>
            Selecione a pessoa já cadastrada quando houver correspondência.
            “Criar cadastro sem login” preserva o histórico sem criar conta de
            acesso. Para vincular sua conta, selecione “Minha conta” ou seu
            nome; o vínculo não é feito pelo e-mail do arquivo.
          </p>
          <ModuleState query={people}>
            {bundle.people.map((p, i) => (
              <label className="icabv-field" key={p.legacy_id}>
                {p.name}
                {p.email && ` · ${p.email}`}
                <select
                  disabled={action.busy}
                  value={p.person_id}
                  onChange={(e) => {
                    setConfirmed(false);
                    setBundle({
                      ...bundle,
                      people: bundle.people.map((v, n) =>
                        n === i ? { ...v, person_id: e.target.value } : v,
                      ),
                    });
                  }}
                >
                  <option value="">Criar cadastro sem login</option>
                  {people.data?.map((person) => (
                    <option value={person.id} key={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </ModuleState>
          {module === "ebd" && (
            <p>
              Conteúdos e gravações entram como rascunho para revisão. Notas e
              respostas antigas ficam identificadas como histórico importado.
              Perfis administrativos do aplicativo antigo não concedem acesso
              administrativo neste app.
            </p>
          )}
          <label className="module-choice">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Conferi as correspondências e quero acrescentar esses dados.
          </label>
          <button
            className="primary"
            disabled={
              !confirmed || action.busy || people.isPending || !!people.error
            }
            onClick={async () => {
              if (
                await action.act(
                  () =>
                    moduleRpc("import_module_backup", {
                      target_module: module,
                      bundle,
                    }),
                  "Backup importado. Os vínculos foram preservados para evitar duplicação em novas importações.",
                )
              ) {
                setBundle(null);
                setConfirmed(false);
              }
            }}
          >
            Confirmar importação completa
          </button>
        </>
      )}
    </section>
  );
}
