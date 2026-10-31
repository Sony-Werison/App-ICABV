"use client";
import { useState } from "react";
import { supabase } from "./supabase";
import {
  ModuleForm,
  ModuleState,
  useModuleAction,
  useModulePeople,
  useModuleRows,
} from "./module-ui";
type Contact = {
  person_id: string;
  phone: string;
  email: string;
  birth_date: string | null;
  share_birthday: boolean;
  avatar_url: string;
};
export function PersonContacts({
  personId,
  management = false,
}: {
  personId?: string;
  management?: boolean;
}) {
  const [selected, setSelected] = useState(personId ?? ""),
    people = useModulePeople("ebd", management),
    contacts = useModuleRows<Contact>("person_contacts", "person_id"),
    action = useModuleAction();
  const id = management ? selected || people.data?.[0]?.id : personId,
    contact = contacts.data?.find((c) => c.person_id === id);
  return (
    <section className="icabv-card module-page">
      <h2>
        {management
          ? "Dados complementares da pessoa"
          : "Meus dados de contato"}
      </h2>
      <p>
        Dados opcionais compartilhados pelo cadastro da igreja. Não são exigidos
        para participar do app, Louvor ou EBD.
      </p>
      {action.notice}
      {management && (
        <ModuleState query={people}>
          <label className="icabv-field">
            Pessoa
            <select
              value={id ?? ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              {people.data?.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>
        </ModuleState>
      )}
      <ModuleState query={contacts}>
        {id && (
          <ModuleForm
            key={id + JSON.stringify(contact)}
            title="Contato e identificação"
            initial={contact ?? {}}
            fields={[
              { name: "phone", label: "Telefone / WhatsApp" },
              { name: "email", label: "E-mail de contato", type: "email" },
              { name: "birth_date", label: "Data de nascimento", type: "date" },
              { name: "share_birthday", label: "Compartilhar meu aniversário com a igreja", type: "checkbox", hint: "O informe mostra apenas o dia e o mês, sem idade ou ano de nascimento. Você pode desativar quando quiser." },
              {
                name: "avatar_url",
                label: "Endereço HTTPS da foto",
                type: "url",
              },
            ]}
            busy={action.busy}
            onSave={(v) =>
              action.act(() =>
                supabase!
                  .from("person_contacts")
                  .upsert({
                    ...v,
                    birth_date: v.birth_date || null,
                    person_id: id,
                  }),
              )
            }
          />
        )}
      </ModuleState>
      <p>
        O e-mail de contato não altera o login nem concede acesso a outra conta.
      </p>
    </section>
  );
}
