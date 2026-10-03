"use client";

import { useActionState } from "react";

import { loginAction, type LoginState } from "./actions";
import styles from "./page.module.css";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <form className={styles.form} action={action}>
      <label className={styles.field}>
        <span>Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </label>
      <label className={styles.field}>
        <span>Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
