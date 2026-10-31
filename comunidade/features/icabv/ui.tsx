"use client";
import {
  createContext,
  Children,
  Fragment,
  isValidElement,
  type ReactElement,
  useId,
  type ReactNode,
  type InputHTMLAttributes,
} from "react";
import { useAccountStatus } from "./account-status";
import { theme } from "../../packages/shared/src";
export const Palette = createContext(theme.light);
export function Card({ children }: { children: ReactNode }) {
  const flattened: ReactNode[] = [];
  const collect = (nodes: ReactNode) =>
    Children.forEach(nodes, (node) => {
      if (
        isValidElement<{ children?: ReactNode }>(node) &&
        node.type === Fragment
      )
        collect(node.props.children);
      else if (node !== null && node !== undefined && typeof node !== "boolean")
        flattened.push(node);
    });
  collect(children);
  const content: ReactNode[] = [];
  let actions: ReactElement[] = [];
  const flush = () => {
    if (actions.length) {
      content.push(
        <div className="card-actions" key={"actions-" + content.length}>
          {actions}
        </div>,
      );
      actions = [];
    }
  };
  flattened.forEach((node, index) => {
    if (isValidElement(node) && node.type === Action)
      actions.push(<Fragment key={node.key ?? index}>{node}</Fragment>);
    else {
      flush();
      content.push(
        <Fragment key={isValidElement(node) ? (node.key ?? index) : index}>
          {node}
        </Fragment>,
      );
    }
  });
  flush();
  return <section className="icabv-card">{content}</section>;
}
export function Body({ children }: { children: ReactNode; compact?: boolean }) {
  return <p className="icabv-body">{children}</p>;
}
export function Title({
  children,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return <h2 className="icabv-title">{children}</h2>;
}
export function Action({
  children,
  onPress,
  disabled,
  secondary,
  selected,
  requiresProfile = false,
}: {
  children: string;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
  secondary?: boolean;
  selected?: boolean;
  requiresProfile?: boolean;
}) {
  const { ready } = useAccountStatus();
  return (
    <button
      type="button"
      disabled={disabled || (requiresProfile && !ready)}
      title={
        requiresProfile && !ready
          ? "Entre com sua conta para participar."
          : undefined
      }
      className={secondary ? "secondary" : "primary"}
      onClick={onPress}
      aria-pressed={selected}
    >
      {children}
    </button>
  );
}
type FieldProps = {
  label: string;
  value?: string;
  onChangeText?: (value: string) => void;
  multiline?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: string;
  autoCapitalize?: string;
  autoComplete?: string;
  editable?: boolean;
  compact?: boolean;
  maxLength?: number;
  placeholder?: string;
};
export function Field({
  label,
  value,
  onChangeText,
  multiline,
  secureTextEntry,
  keyboardType,
  autoComplete,
  editable,
  maxLength,
  placeholder,
}: FieldProps) {
  const id = useId();
  const props = {
    id,
    "aria-label": label,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChangeText?.(e.target.value),
    disabled: editable === false,
    maxLength,
    placeholder,
  };
  return (
    <label className="icabv-field" htmlFor={id}>
      {label}
      {multiline ? (
        <textarea {...props} rows={4} />
      ) : (
        <input
          {...props}
          type={
            secureTextEntry
              ? "password"
              : keyboardType === "email-address"
                ? "email"
                : keyboardType === "url"
                  ? "url"
                  : "text"
          }
          inputMode={
            ["numeric", "number-pad"].includes(keyboardType ?? "")
              ? "numeric"
              : keyboardType === "decimal-pad"
                ? "decimal"
                : undefined
          }
          autoComplete={
            autoComplete as InputHTMLAttributes<HTMLInputElement>["autoComplete"]
          }
        />
      )}
    </label>
  );
}
export function Check({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="icabv-check">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
