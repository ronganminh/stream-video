"use client";

import { useActionState, useMemo, useState } from "react";

import { saveHostsAction, type HostsState } from "./actions";
import type { HostsState } from "./actions";
import styles from "./page.module.css";

export type HostRow = {
  id: string;
  label: string;
  enabled: boolean;
  isPrimary: boolean;
  sortOrder: number;
};

const initialState: HostsState = {};

function move<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function HostsForm({ hosts }: { hosts: HostRow[] }) {
  const [state, action, pending] = useActionState(
    saveHostsAction,
    initialState,
  );
  const [ordered, setOrdered] = useState(hosts);
  const initialPrimary = useMemo(
    () => hosts.find((host) => host.isPrimary)?.id ?? "",
    [hosts],
  );
  const [primary, setPrimary] = useState(initialPrimary);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const reorder = (id: string, direction: -1 | 1) => {
    setOrdered((current) => {
      const index = current.findIndex((host) => host.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      return move(current, index, target);
    });
  };

  return (
    <form
      className={styles.form}
      action={action}
      onSubmit={(event) => {
        if (
          primary !== initialPrimary &&
          !window.confirm(
            "Change the primary host? Existing videos and mirrors will stay unchanged; future syncs will use the new primary host.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input
        type="hidden"
        name="order"
        value={JSON.stringify(ordered.map((host) => host.id))}
      />

      <div className={styles.table} role="table" aria-label="Video hosts">
        <div className={styles.headerRow} role="row">
          <span role="columnheader">Order</span>
          <span role="columnheader">Host</span>
          <span role="columnheader">Enabled</span>
          <span role="columnheader">Primary</span>
        </div>
        {ordered.map((host) => (
          <div
            className={styles.hostRow}
            role="row"
            key={host.id}
            draggable
            onDragStart={() => setDraggedId(host.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (!draggedId || draggedId === host.id) return;
              setOrdered((current) => {
                const from = current.findIndex((item) => item.id === draggedId);
                const to = current.findIndex((item) => item.id === host.id);
                return from < 0 || to < 0 ? current : move(current, from, to);
              });
              setDraggedId(null);
            }}
          >
            <button
              type="button"
              className={styles.handle}
              aria-label={`Reorder ${host.label}. Use Up or Down arrow keys.`}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  reorder(host.id, -1);
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  reorder(host.id, 1);
                }
              }}
            >
              drag_indicator
            </button>
            <span className={styles.hostName} role="cell">
              <strong>{host.label}</strong>
              <code>{host.id}</code>
            </span>
            <label className={styles.check} role="cell">
              <input
                type="checkbox"
                name="enabledHostId"
                value={host.id}
                defaultChecked={host.enabled}
                disabled={host.id === primary}
              />
              <span>Enabled</span>
            </label>
            <label className={styles.check} role="cell">
              <input
                type="radio"
                name="primaryHostId"
                value={host.id}
                checked={primary === host.id}
                onChange={() => setPrimary(host.id)}
              />
              <span>Primary</span>
            </label>
          </div>
        ))}
      </div>

      {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
      {state.success ? <p className={styles.success} role="status">{state.success}</p> : null}

      <div className={styles.actions}>
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save hosts"}
        </button>
      </div>
    </form>
  );
}
