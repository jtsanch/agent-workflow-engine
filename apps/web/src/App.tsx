import {SignInButton, SignOutButton, UserButton} from "@clerk/react";
import { Link, Route, Routes } from "react-router-dom";
import { Button } from "./components/Button.js";
import { AdminUsersPage } from "./pages/AdminUsersPage.js";
import { JobsPage } from "./pages/JobsPage.js";
import { RunsPage } from "./pages/RunsPage.js";
import { CreateJobPage } from "./pages/CreateJobPage.js";
import { useAppAuth } from "./auth/useAppAuth.js";

export function App() {
  const auth = useAppAuth();

  if (auth.status === "loading") {
    return (
      <div className="shell shell-center">
        <main className="content content-narrow">
          <article className="card empty">Loading authentication…</article>
        </main>
      </div>
    );
  }

  if (auth.status === "signed_out") {
    return (
      <div className="shell shell-center">
        <main className="content content-narrow">
          <article className="card auth-card">
            <p className="eyebrow">Personal Agent OS</p>
            <h1>Control Plane</h1>
            <p className="page-header-description">
              Sign in with Google through Clerk to continue. Platform access is still approved by the backend after
              authentication.
            </p>
            <SignInButton mode="modal">
              <Button variant="primary">Sign In</Button>
            </SignInButton>
          </article>
        </main>
      </div>
    );
  }

  if (auth.status === "pending_approval") {
    return (
      <div className="shell shell-center">
        <main className="content content-narrow">
          <article className="card auth-card">
            <p className="eyebrow">Personal Agent OS</p>
            <h1>Approval Pending</h1>
            <p className="page-header-description">Your account is pending approval.</p>
            <div className="auth-card-actions">
              <SignOutButton>
                <Button variant="secondary">Sign Out</Button>
              </SignOutButton>
            </div>
          </article>
        </main>
      </div>
    );
  }

  if (auth.status === "error") {
    return (
      <div className="shell shell-center">
        <main className="content content-narrow">
          <article className="card empty">{auth.error.message}</article>
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Personal Agent OS</p>
          <h1>Control Plane</h1>
          <div className="sidebar-user">
            <p className="sidebar-user-name">{auth.user.firstName ?? auth.user.email}</p>
            <p className="sidebar-user-meta">
              <span>{auth.user.email}</span>
              <span className="status">{auth.user.role}</span>
            </p>
          </div>
        </div>
        <nav className="nav">
          <Link to="/">Jobs</Link>
          <Link to="/runs">Runs</Link>
          <Link to="/jobs/new">Create Job</Link>
          {auth.user.role === "admin" ? <Link to="/admin/users">Users</Link> : null}
        </nav>
        <div className="sidebar-footer">
          <section className="usage-summary card">
            <div>
              <p className="eyebrow">Usage</p>
              <h2>Limits</h2>
            </div>
            <div className="usage-summary-grid">
              <article>
                <strong>Daily</strong>
                <p>
                  {auth.usage.dailyUsed} / {auth.usage.dailyLimit}
                </p>
              </article>
              <article>
                <strong>Monthly</strong>
                <p>
                  {auth.usage.monthlyUsed} / {auth.usage.monthlyLimit}
                </p>
              </article>
              <article>
                <strong>Per Run</strong>
                <p>{auth.usage.perRunLimit}</p>
              </article>
            </div>
          </section>
          <SignOutButton>
            <Button variant="secondary">Sign Out</Button>
          </SignOutButton>
        </div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<JobsPage />} />
          <Route path="/runs" element={<RunsPage />} />
          <Route path="/jobs/new" element={<CreateJobPage />} />
          {auth.user.role === "admin" ? <Route path="/admin/users" element={<AdminUsersPage />} /> : null}
        </Routes>
      </main>
    </div>
  );
}
