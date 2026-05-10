import { useEffect, useState } from "react";
import { Button } from "../components/Button.js";
import { PageHeader } from "../components/PageHeader.js";
import { disableUser, enableUser, listAdminUsers, type AdminUserRecord } from "../lib/api.js";

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  async function loadInitial(): Promise<void> {
    setLoading(true);
    try {
      const result = await listAdminUsers(undefined, 25);
      setUsers(result.users);
      setNextCursor(result.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore(): Promise<void> {
    if (!nextCursor) {
      return;
    }

    const result = await listAdminUsers(nextCursor, 25);
    setUsers((current) => [...current, ...result.users]);
    setNextCursor(result.nextCursor);
  }

  async function updateStatus(userId: string, nextStatus: "active" | "disabled"): Promise<void> {
    setPendingUserId(userId);
    try {
      if (nextStatus === "active") {
        await enableUser(userId);
      } else {
        await disableUser(userId);
      }

      setUsers((current) =>
        current.map((user) => (user.id === userId ? { ...user, status: nextStatus } : user))
      );
    } finally {
      setPendingUserId(null);
    }
  }

  useEffect(() => {
    void loadInitial();
  }, []);

  return (
    <section>
      <PageHeader
        title="User Management"
        description="Review platform users, usage, and approval state. Access remains controlled by the backend."
      />

      <div className="card-list">
        {loading ? <article className="card empty">Loading users…</article> : null}

        {!loading && users.length === 0 ? <article className="card empty">No users found.</article> : null}

        {users.map((user) => (
          <article key={user.id} className="card admin-user-card">
            <div className="card-row admin-user-header">
              <div>
                <h3>{user.firstName ?? user.email}</h3>
                <p className="page-header-description">{user.email}</p>
              </div>
              <div className="admin-user-pills">
                <span className="status">{user.role}</span>
                <span className="status">{user.status}</span>
              </div>
            </div>

            <div className="admin-user-usage">
              <article>
                <strong>Daily</strong>
                <p>
                  {user.usage.dailyUsed} / {user.usage.dailyLimit}
                </p>
              </article>
              <article>
                <strong>Monthly</strong>
                <p>
                  {user.usage.monthlyUsed} / {user.usage.monthlyLimit}
                </p>
              </article>
              <article>
                <strong>Per Run</strong>
                <p>{user.usage.perRunLimit}</p>
              </article>
            </div>

            <div className="job-card-actions">
              {user.status === "active" ? (
                <Button
                  variant="secondary"
                  disabled={pendingUserId === user.id}
                  onClick={() => void updateStatus(user.id, "disabled")}
                >
                  {pendingUserId === user.id ? "Disabling..." : "Disable"}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  disabled={pendingUserId === user.id}
                  onClick={() => void updateStatus(user.id, "active")}
                >
                  {pendingUserId === user.id ? "Enabling..." : "Enable"}
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>

      {nextCursor ? (
        <div className="admin-load-more">
          <Button variant="subtle" onClick={() => void loadMore()}>
            Load More
          </Button>
        </div>
      ) : null}
    </section>
  );
}
