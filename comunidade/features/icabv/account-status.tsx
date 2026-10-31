"use client";
import { createContext, useContext } from "react";
export const AccountStatus = createContext({ ready: true, manager: false });
export const useAccountStatus = () => useContext(AccountStatus);
export function actionError(
  error: unknown,
  fallback = "Não foi possível concluir. Confira os dados e tente novamente.",
) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  if (message.includes("last_admin"))
    return "É necessário manter pelo menos um administrador. Conceda o acesso a outra pessoa antes de remover o último.";
  if (message.includes("leader_role_required"))
    return "Escolha uma pessoa com perfil de líder ou administrador.";
  if (message.includes("forbidden") || message.includes("unauthorized"))
    return "Seu perfil não permite esta operação. Atualize as permissões da conta e tente novamente.";
  return fallback;
}
