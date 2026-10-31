import { useEffect, useRef, useState } from "react";
import { LoadingState } from "./presentation";
import { AppState, View } from "./web-native";
const randomUUID = () => crypto.randomUUID();
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pt } from "../../packages/shared/src";
import { supabase } from "./supabase";
import { Action, Body, Card, Field, Title } from "./ui";
import { displayBrasilia } from "./event-format";

const f = pt.chatCopy,
  gap = { gap: 8 };
type Reason = keyof typeof f.reasons;
type Message = {
  id: string;
  body: string | null;
  author_name: string | null;
  created_at: string;
  status: "pending" | "published" | "hidden" | "withdrawn";
  is_mine: boolean;
  report_count: number | null;
  report_reasons: Reason[] | null;
};
type Decision = {
  id: string;
  kind: "approve" | "hide" | "withdraw" | "report";
};
async function rpc<T>(name: string, args: Record<string, unknown>) {
  if (!supabase) throw new Error("unconfigured");
  const result = await supabase.rpc(name, args);
  if (result.error) throw result.error;
  return result.data as T;
}
export function GroupChat({
  unit,
  manager = false,
}: {
  unit: string;
  manager?: boolean;
}) {
  const [active, setActive] = useState(
    AppState.currentState !== "background" &&
      AppState.currentState !== "inactive",
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => subscription.remove();
  }, []);
  const client = useQueryClient(),
    lock = useRef(false);
  const nonce = useRef<{ unit: string; content: string; value: string } | null>(
    null,
  );
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [review, setReview] = useState(false),
    [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [decision, setDecision] = useState<Decision | null>(null),
    [reason, setReason] = useState<Reason>("inappropriate");
  const cursor = cursors[cursors.length - 1];
  const messages = useQuery({
    enabled: active,
    queryKey: ["community", "group_chat_page", unit, cursor, review],
    queryFn: () =>
      rpc<Message[]>("group_chat_page", { unit, cursor_id: cursor, review }),
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });
  const visible = messages.error ? [] : (messages.data?.slice(0, 20) ?? []);
  async function run(
    name: string,
    args: Record<string, unknown>,
    success = f.saved,
  ) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await rpc(name, args);
      setMessage(success);
      await client.invalidateQueries({ queryKey: ["community"] });
      return true;
    } catch (e) {
      const detail =
        e && typeof e === "object" && "message" in e ? String(e.message) : "";
      setMessage(
        detail.includes("message_rate_limit")
          ? f.rateLimit
          : detail.includes("invalid_message")
            ? f.invalid
            : detail.includes("message_withdrawn")
              ? f.closed
              : f.error,
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const switchView = (value: boolean) => {
    setReview(value);
    setCursors([null]);
    setDecision(null);
  };
  return (
    <View style={gap}>
      <Title>{f.title}</Title>
      <Body>{f.privacy}</Body>
      {manager && (
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Action
            secondary={review}
            selected={!review}
            onPress={() => switchView(false)}
          >
            {f.feed}
          </Action>
          <Action
            secondary={!review}
            selected={review}
            onPress={() => switchView(true)}
          >
            {f.review}
          </Action>
        </View>
      )}
      <Body>{f.updateHint}</Body>
      <Action
        secondary
        disabled={busy || messages.isFetching}
        onPress={() => {
          setDecision(null);
          if (cursor !== null) setCursors([null]);
          else void messages.refetch();
        }}
      >
        {f.refresh}
      </Action>
      {message ? <Body>{message}</Body> : null}
      {!review && (
        <Card>
          <Body>{manager ? f.managerHint : f.approvalHint}</Body>
          <Field
            label={f.compose}
            value={text}
            editable={!busy}
            multiline
            maxLength={2000}
            onChangeText={setText}
          />
          <Body>{text.length}/2000</Body>
          <Action
            requiresProfile
            disabled={
              busy ||
              messages.isPending ||
              Boolean(messages.error) ||
              !text.trim()
            }
            onPress={() => {
              const content = text.trim();
              if (!content || content.length > 2000) {
                setMessage(f.invalid);
                return;
              }
              if (
                !nonce.current ||
                nonce.current.unit !== unit ||
                nonce.current.content !== content
              )
                nonce.current = { unit, content, value: randomUUID() };
              void run(
                "send_group_message",
                { unit, content, nonce: nonce.current.value },
                f.sent,
              ).then((ok) => {
                if (ok) {
                  setText("");
                  nonce.current = null;
                  setCursors([null]);
                }
              });
            }}
          >
            {manager ? f.publish : f.send}
          </Action>
        </Card>
      )}
      {messages.isPending ? (
        <LoadingState label={f.loading} />
      ) : messages.error ? (
        <>
          <Body>{f.loadError}</Body>
          <Action secondary onPress={() => void messages.refetch()}>
            {f.retry}
          </Action>
        </>
      ) : !visible.length ? (
        <Body>{f.empty}</Body>
      ) : null}
      {visible.map((m) => (
        <Card key={m.id}>
          <Body>
            {m.author_name ? `${m.is_mine ? f.mine : m.author_name} · ` : ""}
            {displayBrasilia(m.created_at)} · {pt.timeZoneShort}
          </Body>
          <Body>{f[m.status]}</Body>
          {m.body ? <Body>{m.body}</Body> : null}
          {manager && Number(m.report_count) > 0 && (
            <>
              <Body>
                {f.reports}: {m.report_count}
              </Body>
              {m.report_reasons?.map((r) => (
                <Body key={r}>{f.reasons[r]}</Body>
              ))}
            </>
          )}
          {decision?.id === m.id ? (
            <>
              <Body>
                {decision.kind === "report"
                  ? f.reportHint
                  : decision.kind === "withdraw"
                    ? f.withdrawHint
                    : decision.kind === "hide"
                      ? f.hideHint
                      : f.approveHint}
              </Body>
              {decision.kind === "report" &&
                (Object.keys(f.reasons) as Reason[]).map((r) => (
                  <Action
                    key={r}
                    secondary={reason !== r}
                    selected={reason === r}
                    disabled={busy}
                    onPress={() => setReason(r)}
                  >
                    {f.reasons[r]}
                  </Action>
                ))}
              <Action
                disabled={busy}
                onPress={() => {
                  const name =
                    decision.kind === "withdraw"
                      ? "withdraw_group_message"
                      : decision.kind === "report"
                        ? "report_group_message"
                        : "moderate_group_message";
                  const args =
                    decision.kind === "report"
                      ? { message: m.id, reason }
                      : decision.kind === "withdraw"
                        ? { message: m.id }
                        : {
                            message: m.id,
                            publish: decision.kind === "approve",
                          };
                  void run(
                    name,
                    args,
                    decision.kind === "report" ? f.reported : f.saved,
                  ).then((ok) => {
                    if (ok) setDecision(null);
                  });
                }}
              >
                {f.confirm}
              </Action>
              <Action
                secondary
                disabled={busy}
                onPress={() => setDecision(null)}
              >
                {f.back}
              </Action>
            </>
          ) : (
            <>
              {m.is_mine && m.status !== "withdrawn" && (
                <Action
                  secondary
                  disabled={busy}
                  onPress={() => setDecision({ id: m.id, kind: "withdraw" })}
                >
                  {f.withdraw}
                </Action>
              )}
              {!m.is_mine && m.status === "published" && (
                <Action
                  secondary
                  disabled={busy}
                  onPress={() => {
                    setDecision({ id: m.id, kind: "report" });
                    setReason("inappropriate");
                  }}
                >
                  {f.report}
                </Action>
              )}
              {manager && m.status !== "withdrawn" && (
                <>
                  {m.status !== "published" && (
                    <Action
                      disabled={busy}
                      onPress={() => setDecision({ id: m.id, kind: "approve" })}
                    >
                      {m.status === "hidden" ? f.restore : f.approve}
                    </Action>
                  )}
                  {m.status !== "hidden" && (
                    <Action
                      secondary
                      disabled={busy}
                      onPress={() => setDecision({ id: m.id, kind: "hide" })}
                    >
                      {f.hide}
                    </Action>
                  )}
                </>
              )}
            </>
          )}
        </Card>
      ))}
      {!messages.error &&
        (cursors.length > 1 || (messages.data?.length ?? 0) > 20) && (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
            }}
          >
            <Action
              secondary
              disabled={cursors.length === 1 || messages.isFetching || busy}
              onPress={() => {
                setCursors(cursors.slice(0, -1));
                setDecision(null);
              }}
            >
              {f.newer}
            </Action>
            <Body>
              {f.page} {cursors.length}
            </Body>
            <Action
              secondary
              disabled={
                (messages.data?.length ?? 0) <= 20 ||
                messages.isFetching ||
                busy
              }
              onPress={() => {
                setCursors([...cursors, visible[visible.length - 1].id]);
                setDecision(null);
              }}
            >
              {f.older}
            </Action>
          </View>
        )}
    </View>
  );
}
