import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../store/useAuth';
import { useWorkspace } from '../../store/useWorkspace';
import {
  listWorkspaceMembers,
  type WorkspaceMember,
} from '../../api/workspaces';
import {
  listInvitesForWorkspace,
  createInvite,
  revokeInvite,
  type SentInvite,
} from '../../api/invites';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function WorkspaceView() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invites, setInvites] = useState<SentInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteSentFlash, setInviteSentFlash] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Setters live only in async callbacks to satisfy
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!workspace) return;
    let mounted = true;

    Promise.all([
      listWorkspaceMembers(workspace.id),
      listInvitesForWorkspace(workspace.id),
    ])
      .then(([m, i]) => {
        if (!mounted) return;
        setMembers(m);
        setInvites(i);
        setLoadError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        console.error('[badger] workspace view load failed:', err);
        setLoadError(
          err instanceof Error ? err.message : 'Could not load workspace.',
        );
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [workspace, reloadToken]);

  const refresh = useCallback(() => {
    setReloadToken((t) => t + 1);
  }, []);

  function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!workspace || !user) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setInviteError('Email is required.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setInviteError('Enter a valid email address.');
      return;
    }

    setInviteBusy(true);
    setInviteError(null);
    setInviteSentFlash(null);

    createInvite(email, workspace.id, user.id)
      .then(() => {
        setInviteEmail('');
        setInviteSentFlash(`Invite sent to ${email}.`);
        refresh();
      })
      .catch((err) => {
        console.error('[badger] invite create failed:', err);
        const message =
          err instanceof Error && /duplicate|unique/i.test(err.message)
            ? 'That email already has a pending invite for this workspace.'
            : err instanceof Error
              ? err.message
              : 'Could not send invite.';
        setInviteError(message);
      })
      .finally(() => {
        setInviteBusy(false);
      });
  }

  function handleRevoke(inviteId: string) {
    if (!window.confirm('Revoke this invite?')) return;
    revokeInvite(inviteId)
      .then(() => refresh())
      .catch((err) => {
        console.error('[badger] invite revoke failed:', err);
        setLoadError(
          err instanceof Error ? err.message : 'Could not revoke invite.',
        );
      });
  }

  if (!workspace) return null;

  const pending = invites.filter((i) => !i.accepted);
  const accepted = invites.filter((i) => i.accepted);

  return (
    <div className="view">
      <div className="view-header">
        <h2>Workspace</h2>
      </div>

      <p className="workspace-intro">
        Members of <strong>{workspace.name}</strong> share the same pipeline. Anyone you
        invite below will see every client in the workspace once they sign in.
      </p>

      {loadError && (
        <div className="write-error-banner" role="status">
          <span className="write-error-text">{loadError}</span>
        </div>
      )}

      <section className="workspace-section">
        <h3 className="workspace-section-title">Invite teammate</h3>
        <form className="workspace-invite-form" onSubmit={handleInvite}>
          <input
            type="email"
            placeholder="teammate@example.com"
            value={inviteEmail}
            onChange={(e) => {
              setInviteEmail(e.target.value);
              if (inviteError) setInviteError(null);
              if (inviteSentFlash) setInviteSentFlash(null);
            }}
            disabled={inviteBusy}
            className="workspace-invite-input"
          />
          <button
            type="submit"
            className="btn btn--primary"
            disabled={inviteBusy || !inviteEmail.trim()}
          >
            {inviteBusy ? 'Sending…' : 'Send invite'}
          </button>
        </form>
        {inviteError && <p className="form-error">{inviteError}</p>}
        {inviteSentFlash && (
          <p className="workspace-flash" role="status">{inviteSentFlash}</p>
        )}
        <p className="workspace-section-help">
          When they sign in with this email, they'll automatically join {workspace.name}.
          No email is sent yet — share the link to Badger with them directly.
        </p>
      </section>

      <section className="workspace-section">
        <h3 className="workspace-section-title">
          Members {loading ? '' : `(${members.length})`}
        </h3>
        {loading ? (
          <p className="workspace-muted">Loading…</p>
        ) : members.length === 0 ? (
          <p className="workspace-muted">No members.</p>
        ) : (
          <ul className="workspace-list">
            {members.map((m) => (
              <li key={m.userId} className="workspace-list-row">
                <span className="workspace-list-primary">
                  {m.userId === user?.id
                    ? `You${m.email ? ` (${m.email})` : ''}`
                    : m.email ?? 'Workspace member'}
                </span>
                <span className="workspace-list-meta">
                  {m.role === 'owner' ? 'Owner' : 'Member'} · joined {formatTimestamp(m.joinedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="workspace-section">
        <h3 className="workspace-section-title">
          Pending invites {loading ? '' : `(${pending.length})`}
        </h3>
        {loading ? (
          <p className="workspace-muted">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="workspace-muted">No pending invites.</p>
        ) : (
          <ul className="workspace-list">
            {pending.map((inv) => (
              <li key={inv.id} className="workspace-list-row">
                <span className="workspace-list-primary">{inv.email}</span>
                <span className="workspace-list-meta">
                  sent {formatTimestamp(inv.createdAt)}
                </span>
                <button
                  type="button"
                  className="btn-link btn-link--danger"
                  onClick={() => handleRevoke(inv.id)}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {accepted.length > 0 && (
        <section className="workspace-section">
          <h3 className="workspace-section-title">Accepted invites ({accepted.length})</h3>
          <ul className="workspace-list">
            {accepted.map((inv) => (
              <li key={inv.id} className="workspace-list-row">
                <span className="workspace-list-primary">{inv.email}</span>
                <span className="workspace-list-meta">
                  accepted (sent {formatTimestamp(inv.createdAt)})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
